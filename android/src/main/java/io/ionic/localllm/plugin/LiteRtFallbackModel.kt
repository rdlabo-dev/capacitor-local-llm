package io.ionic.localllm.plugin

import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.URI
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.withContext

data class FallbackModelOptions(
    val path: String,
    val maxTokens: Int = DEFAULT_MAX_TOKENS,
    val maxImages: Int = DEFAULT_MAX_IMAGES,
    val supportsImages: Boolean = true
) {
    init {
        if (!path.lowercase().endsWith(".litertlm")) {
            throw LocalLLMError.InvalidOptions("fallback model path must end with .litertlm")
        }
        if (maxTokens !in MIN_MAX_TOKENS..MAX_MAX_TOKENS) {
            throw LocalLLMError.InvalidOptions(
                "fallback model maxTokens must be between $MIN_MAX_TOKENS and $MAX_MAX_TOKENS"
            )
        }
        if (maxImages !in 1..MAX_MAX_IMAGES) {
            throw LocalLLMError.InvalidOptions("fallback model maxImages must be between 1 and $MAX_MAX_IMAGES")
        }
    }

    companion object {
        const val DEFAULT_MAX_TOKENS = 4096
        const val DEFAULT_MAX_IMAGES = 1
        const val MAX_MAX_IMAGES = 8
        const val MIN_MAX_TOKENS = 256
        const val MAX_MAX_TOKENS = 32_768
    }
}

internal class LiteRtFallbackModel(private val context: Context) {
    @Volatile
    private var engine: Engine? = null

    @Volatile
    var isLoading = false
        private set

    @Volatile
    var maxTokens = FallbackModelOptions.DEFAULT_MAX_TOKENS
        private set

    @Volatile
    var supportsVision = false
        private set

    @Volatile
    private var maxImages = FallbackModelOptions.DEFAULT_MAX_IMAGES

    val isReady: Boolean
        get() = engine != null

    suspend fun configure(options: FallbackModelOptions) {
        isLoading = true
        try {
            val loaded = withContext(Dispatchers.IO) {
                val resolvedModel = resolveModelPath(options.path)
                val candidate = Engine(
                    EngineConfig(
                        modelPath = resolvedModel.path,
                        backend = Backend.CPU(),
                        visionBackend = if (options.supportsImages) Backend.CPU() else null,
                        maxNumTokens = options.maxTokens,
                        maxNumImages = if (options.supportsImages) options.maxImages else null,
                        cacheDir = context.cacheDir.absolutePath
                    )
                )
                try {
                    candidate.initialize()
                    LoadedFallback(candidate, resolvedModel.staleFiles)
                } catch (error: Exception) {
                    candidate.close()
                    throw error
                }
            }
            val previous = synchronized(this) {
                val old = engine
                engine = loaded.engine
                maxTokens = options.maxTokens
                maxImages = options.maxImages
                supportsVision = options.supportsImages
                old
            }
            runCatching { previous?.close() }
            loaded.staleFiles.forEach(File::delete)
        } catch (error: LocalLLMError) {
            throw error
        } catch (error: Exception) {
            throw LocalLLMError.NotAvailable(error)
        } finally {
            isLoading = false
        }
    }

    suspend fun generate(
        chat: ChatSession,
        prompt: String,
        imagePaths: List<String>,
        options: LLMOptions?,
        onChunk: (String) -> Unit
    ): String {
        val configuredEngine = engine ?: throw LocalLLMError.ModelNotReady()
        if (imagePaths.size > maxImages) {
            throw LocalLLMError.InvalidOptions("at most $maxImages image(s) can be supplied")
        }
        if (imagePaths.isNotEmpty() && !supportsVision) {
            throw LocalLLMError.Unsupported("image input for this fallback model")
        }
        val maxOutputTokens = options?.maxOutputTokens ?: LLMOptions.DEFAULT_MAX_OUTPUT_TOKENS
        trimToFit(chat, prompt, imagePaths.size, maxOutputTokens)
        val history = synchronized(chat) { chat.history.toList() }
        val config = ConversationConfig(
            systemInstruction = chat.instructions?.takeIf { it.isNotBlank() }?.let(Contents::of),
            initialMessages = history.map { message ->
                when (message.role) {
                    ChatRole.User -> Message.user(message.content)
                    ChatRole.Assistant -> Message.model(message.content)
                }
            },
            samplerConfig = SamplerConfig(
                topK = options?.topK ?: DEFAULT_TOP_K,
                topP = DEFAULT_TOP_P,
                temperature = (options?.temperature ?: DEFAULT_TEMPERATURE).toDouble(),
                seed = DEFAULT_SEED
            ),
            maxOutputToken = maxOutputTokens
        )
        val conversation = try {
            configuredEngine.createConversation(config)
        } catch (error: Exception) {
            throw LocalLLMError.NotAvailable(error)
        }
        val response = StringBuilder()
        val temporaryImageFiles = mutableListOf<File>()
        try {
            val resolvedImagePaths = withContext(Dispatchers.IO) {
                resolveImagePaths(imagePaths, temporaryImageFiles)
            }
            val contents = resolvedImagePaths.map { Content.ImageFile(it) } + Content.Text(prompt)
            conversation.sendMessageAsync(Contents.of(contents)).collect { message ->
                val chunk = message.contents.contents
                    .filterIsInstance<Content.Text>()
                    .joinToString(separator = "") { it.text }
                if (chunk.isNotEmpty()) {
                    response.append(chunk)
                    onChunk(chunk)
                }
            }
            return response.toString()
        } catch (error: CancellationException) {
            runCatching { conversation.cancelProcess() }
            throw error
        } catch (error: LocalLLMError) {
            throw error
        } catch (error: Exception) {
            throw LocalLLMError.NotAvailable(error)
        } finally {
            runCatching { conversation.close() }
            temporaryImageFiles.forEach(File::delete)
        }
    }

    fun close() {
        val current = synchronized(this) {
            val value = engine
            engine = null
            supportsVision = false
            value
        }
        runCatching { current?.close() }
    }

    private fun trimToFit(chat: ChatSession, prompt: String, imageCount: Int, maxOutputTokens: Int) {
        while (estimatedTokens(chat, prompt, imageCount, maxOutputTokens) > maxTokens) {
            val removed = synchronized(chat) { ChatHistory.dropOldestTurn(chat) }
            if (!removed) throw LocalLLMError.ContextWindowExceeded()
        }
    }

    private fun estimatedTokens(chat: ChatSession, prompt: String, imageCount: Int, maxOutputTokens: Int): Int {
        val characterCount = synchronized(chat) {
            (chat.instructions?.length ?: 0) + chat.history.sumOf { it.content.length } + prompt.length
        }
        return estimateFallbackTokens(characterCount, imageCount, maxOutputTokens)
    }

    private fun resolveModelPath(path: String): ResolvedModel {
        if (!path.startsWith(ANDROID_ASSET_PREFIX)) {
            val file = resolveLocalFile(path, "fallback model")
            if (!file.isAbsolute || !file.isFile || !file.canRead()) {
                throw LocalLLMError.InvalidOptions("fallback model path must be a readable absolute file")
            }
            return ResolvedModel(file.absolutePath)
        }

        val assetPath = path.removePrefix(ANDROID_ASSET_PREFIX)
        if (assetPath.isBlank() || assetPath.split('/').any { it == ".." }) {
            throw LocalLLMError.InvalidOptions("fallback model asset path is invalid")
        }
        val modelDirectory = File(context.filesDir, MODEL_DIRECTORY).also { directory ->
            if (!directory.exists() && !directory.mkdirs()) {
                throw LocalLLMError.NotAvailable()
            }
        }
        val packageVersion = context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
        val cacheName = assetCacheFileName(packageVersion, assetPath)
        val destination = File(modelDirectory, cacheName)
        val identitySuffix = cacheName.substringAfter('-')
        val staleFiles = modelDirectory.listFiles()
            ?.filter { it != destination && it.name.substringAfter('-', missingDelimiterValue = "") == identitySuffix }
            .orEmpty()
        if (destination.isFile && destination.canRead()) {
            return ResolvedModel(destination.absolutePath, staleFiles)
        }
        val temporary = File.createTempFile("model-", ".litertlm", modelDirectory)
        try {
            context.assets.open(assetPath).use { input -> temporary.outputStream().use(input::copyTo) }
            if (destination.exists() && !destination.delete()) throw LocalLLMError.NotAvailable()
            if (!temporary.renameTo(destination)) throw LocalLLMError.NotAvailable()
        } finally {
            temporary.delete()
        }
        return ResolvedModel(destination.absolutePath, staleFiles)
    }

    private suspend fun resolveImagePaths(paths: List<String>, temporaryFiles: MutableList<File>): List<String> {
        try {
            return paths.map { path ->
                if (path.startsWith(CONTENT_URI_PREFIX)) {
                    val uri = Uri.parse(path)
                    val extension = MimeTypeMap.getSingleton()
                        .getExtensionFromMimeType(context.contentResolver.getType(uri))
                        ?.let { ".$it" } ?: ".img"
                    val temporary = File.createTempFile("image-", extension, context.cacheDir)
                    temporaryFiles += temporary
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        temporary.outputStream().use { output -> copyWithByteLimit(input, output) }
                    } ?: throw LocalLLMError.InvalidOptions("image URI is not readable")
                    temporary.absolutePath
                } else {
                    val file = resolveLocalFile(path, "image")
                    if (!file.isAbsolute || !file.isFile || !file.canRead()) {
                        throw LocalLLMError.InvalidOptions("image path must be a readable absolute file or content URI")
                    }
                    if (file.length() > MAX_IMAGE_BYTES) {
                        throw LocalLLMError.InvalidOptions("image must not exceed $MAX_IMAGE_MEBIBYTES MiB")
                    }
                    file.absolutePath
                }
            }
        } catch (error: CancellationException) {
            temporaryFiles.forEach(File::delete)
            throw error
        } catch (error: LocalLLMError) {
            temporaryFiles.forEach(File::delete)
            throw error
        } catch (_: Exception) {
            temporaryFiles.forEach(File::delete)
            throw LocalLLMError.InvalidOptions("image path or URI is not readable")
        }
    }

    companion object {
        private const val ANDROID_ASSET_PREFIX = "/android_asset/"
        private const val CONTENT_URI_PREFIX = "content://"
        private const val MODEL_DIRECTORY = "local-llm-models"
        private const val DEFAULT_TOP_K = 40
        private const val DEFAULT_TOP_P = 0.95
        private const val DEFAULT_TEMPERATURE = 0.8f
        private const val DEFAULT_SEED = 0
    }
}

private data class ResolvedModel(val path: String, val staleFiles: List<File> = emptyList())
private data class LoadedFallback(val engine: Engine, val staleFiles: List<File>)

private const val FILE_URI_PREFIX = "file:"
private const val URI_SCHEME_SEPARATOR = "://"
private const val PROMPT_OVERHEAD_TOKENS = 64
private const val TOKENS_PER_IMAGE = 512
private const val MAX_IMAGE_MEBIBYTES = 32
internal const val MAX_IMAGE_BYTES = MAX_IMAGE_MEBIBYTES * 1024L * 1024L

internal fun estimateFallbackTokens(characterCount: Int, imageCount: Int, maxOutputTokens: Int): Int =
    characterCount + PROMPT_OVERHEAD_TOKENS + imageCount * TOKENS_PER_IMAGE + maxOutputTokens

internal fun assetCacheFileName(packageVersion: Long, assetPath: String): String {
    val identity = MessageDigest.getInstance("SHA-256")
        .digest(assetPath.toByteArray(Charsets.UTF_8))
        .take(8)
        .joinToString(separator = "") { byte -> "%02x".format(byte) }
    return "$packageVersion-$identity-${File(assetPath).name}"
}

internal fun resolveLocalFile(path: String, label: String): File = try {
    if (path.startsWith(FILE_URI_PREFIX)) {
        val uri = URI(path)
        if (uri.scheme != "file" || !uri.authority.isNullOrEmpty()) {
            throw LocalLLMError.InvalidOptions("$label file URI must not contain an authority")
        }
        File(uri)
    } else {
        if (path.contains(URI_SCHEME_SEPARATOR)) {
            throw LocalLLMError.InvalidOptions("$label path uses an unsupported URI scheme")
        }
        File(path)
    }
} catch (error: LocalLLMError) {
    throw error
} catch (_: Exception) {
    throw LocalLLMError.InvalidOptions("$label path is invalid")
}

internal suspend fun copyWithByteLimit(input: InputStream, output: OutputStream, maxBytes: Long = MAX_IMAGE_BYTES) {
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var copied = 0L
    while (true) {
        currentCoroutineContext().ensureActive()
        val count = input.read(buffer)
        if (count < 0) return
        copied += count
        if (copied > maxBytes) {
            throw LocalLLMError.InvalidOptions("image must not exceed $MAX_IMAGE_MEBIBYTES MiB")
        }
        output.write(buffer, 0, count)
    }
}
