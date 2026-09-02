package io.ionic.localllm.plugin

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.Content
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.generateContentRequest
import android.content.Context
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.job
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface ModelDownloadEvent {
    data object Started : ModelDownloadEvent
    data class Progress(val downloadedBytes: Long) : ModelDownloadEvent
    data object Completed : ModelDownloadEvent
}

data class TextGenerationResult(val text: String, val generationId: String)

internal enum class NativeGenerationState(val value: String) {
    Started("started"),
    Completed("completed"),
    Cancelled("cancelled"),
    Failed("failed")
}

internal typealias GenerationStateHandler = (String, NativeGenerationState, String?) -> Unit

internal enum class ImageAnalysisBackend(val value: String) {
    MlKitPrompt("ml-kit-prompt"),
    LiteRtLm("litert-lm")
}

internal data class ImageAnalysisAvailability(
    val availability: LLMAvailability,
    val backend: ImageAnalysisBackend? = null,
    val maxImages: Int? = null
)

class LocalLLM(
    context: Context,
    val model: GenerativeModel = Generation.getClient()
) {
    private val chats = ChatStore()
    private val generationMutex = Mutex()
    private val fallbackModel = LiteRtFallbackModel(context)
    private val imageResolver = AndroidImageResolver(context)

    private suspend fun systemAvailability(): LLMAvailability = try {
        mapFeatureStatus(model.checkStatus())
    } catch (error: GenAiException) {
        mapAvailabilityError(error.errorCode)
    }

    suspend fun availability(): LLMAvailability = generationMutex.withLock {
        when {
            fallbackModel.isReady -> LLMAvailability.Available
            fallbackModel.isLoading -> LLMAvailability.NotReady
            else -> systemAvailability()
        }
    }

    internal suspend fun imageAnalysisAvailability(): ImageAnalysisAvailability = generationMutex.withLock {
        resolveImageAnalysisAvailability(
            systemAvailability(),
            fallbackModel.isReady,
            fallbackModel.isLoading,
            fallbackModel.supportsVision,
            fallbackModel.maxImages
        )
    }

    suspend fun configureFallbackModel(options: FallbackModelOptions) {
        generationMutex.withLock { fallbackModel.configure(options) }
    }

    suspend fun download(onEvent: (ModelDownloadEvent) -> Unit) {
        generationMutex.withLock {
            try {
                model.download().collect { status ->
                    when (status) {
                        is DownloadStatus.DownloadStarted -> onEvent(ModelDownloadEvent.Started)
                        is DownloadStatus.DownloadProgress ->
                            onEvent(ModelDownloadEvent.Progress(status.totalBytesDownloaded))
                        is DownloadStatus.DownloadCompleted -> onEvent(ModelDownloadEvent.Completed)
                        is DownloadStatus.DownloadFailed -> throw status.e
                    }
                }
            } catch (error: GenAiException) {
                throw mapSdkError(error)
            }
        }
    }

    suspend fun warmup() {
        generationMutex.withLock {
            if (selectBackend() == GenerationBackend.System) model.warmup()
        }
    }

    fun createChat(
        instructions: String?,
        limits: HistoryLimits = HistoryLimits(),
        id: String = UUID.randomUUID().toString()
    ): String = chats.create(instructions, limits, id)

    fun deleteChat(id: String) {
        chats.delete(id)
    }

    internal suspend fun generateText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        images: List<AndroidImageInput> = emptyList(),
        legacyImageRouting: Boolean = false,
        onState: GenerationStateHandler = { _, _, _ -> }
    ): TextGenerationResult = runGeneration(
        chatId,
        prompt,
        options,
        images,
        legacyImageRouting,
        onState,
        streaming = false
    ) { _, _ -> }

    internal suspend fun streamText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        images: List<AndroidImageInput> = emptyList(),
        legacyImageRouting: Boolean = false,
        onState: GenerationStateHandler = { _, _, _ -> },
        onChunk: (generationId: String, text: String) -> Unit
    ): TextGenerationResult = runGeneration(
        chatId,
        prompt,
        options,
        images,
        legacyImageRouting,
        onState,
        streaming = true,
        onChunk = onChunk
    )

    fun cancelGeneration(chatId: String, generationId: String?) {
        chats.cancel(chatId, generationId)
    }

    suspend fun close() {
        chats.clear()
        generationMutex.withLock {
            fallbackModel.close()
            model.close()
        }
    }

    private suspend fun runGeneration(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        images: List<AndroidImageInput>,
        legacyImageRouting: Boolean,
        onState: GenerationStateHandler,
        streaming: Boolean,
        onChunk: (generationId: String, text: String) -> Unit
    ): TextGenerationResult {
        val generationId = UUID.randomUUID().toString()
        val active = ActiveGeneration(generationId, currentCoroutineContext().job)
        val chat = chats.begin(chatId, active)
        onState(generationId, NativeGenerationState.Started, null)

        try {
            return generationMutex.withLock {
                val backend = selectBackend(images.isNotEmpty(), legacyImageRouting)
                val tokenLimit =
                    if (backend == GenerationBackend.System) model.getTokenLimit() else fallbackModel.maxTokens
                options?.validate(tokenLimit)
                val resolvedImages = if (images.isEmpty()) null else imageResolver.resolve(images)
                val imagePaths = resolvedImages?.paths ?: emptyList()
                var bitmaps = emptyList<android.graphics.Bitmap>()
                val text = try {
                    if (backend == GenerationBackend.Fallback) {
                        fallbackModel.generate(chat, prompt, imagePaths, options) { chunk ->
                            if (streaming) onChunk(generationId, chunk)
                        }
                    } else {
                        bitmaps = resolvedImages?.decodeBitmaps() ?: emptyList()
                        val request = buildFittingRequest(chat, prompt, options, tokenLimit, bitmaps)
                        if (streaming) {
                            val accumulated = StringBuilder()
                            model.generateContentStream(request).collect { response ->
                                val chunk = response.candidates.first().text
                                accumulated.append(chunk)
                                if (chunk.isNotEmpty()) onChunk(generationId, chunk)
                            }
                            accumulated.toString()
                        } else {
                            model.generateContent(request).candidates.first().text
                        }
                    }
                } finally {
                    bitmaps.forEach(android.graphics.Bitmap::recycle)
                    resolvedImages?.close()
                }
                synchronized(chat) { ChatHistory.appendTurn(chat, prompt, text) }
                onState(generationId, NativeGenerationState.Completed, null)
                TextGenerationResult(text, generationId)
            }
        } catch (error: CancellationException) {
            onState(generationId, NativeGenerationState.Cancelled, "LOCAL_LLM_GENERATION_CANCELLED")
            throw LocalLLMError.GenerationCancelled(error)
        } catch (error: GenAiException) {
            val mapped = mapSdkError(error)
            onState(generationId, NativeGenerationState.Failed, mapped.code)
            throw mapped
        } catch (error: Exception) {
            val code = (error as? LocalLLMError)?.code ?: "LOCAL_LLM_UNKNOWN_ERROR"
            onState(generationId, NativeGenerationState.Failed, code)
            throw error
        } finally {
            chats.finish(chat, generationId)
        }
    }

    private suspend fun buildRequest(
        chat: ChatSession,
        prompt: String,
        options: LLMOptions?,
        images: List<android.graphics.Bitmap> = emptyList()
    ): com.google.mlkit.genai.prompt.GenerateContentRequest {
        val systemPromptAvailable = model.isSystemPromptAvailable()
        val text = ChatHistory.buildPrompt(chat, prompt, includeInstructions = !systemPromptAvailable)
        val content = Content.Builder().apply {
            images.forEach(::image)
            text(text)
        }.build()
        return generateContentRequest(content) {
            if (systemPromptAvailable && !chat.instructions.isNullOrBlank()) {
                systemInstruction = SystemInstruction(chat.instructions)
            }
            temperature = options?.temperature
            topK = options?.topK
            maxOutputTokens = options?.maxOutputTokens ?: LLMOptions.DEFAULT_MAX_OUTPUT_TOKENS
        }
    }

    private suspend fun buildFittingRequest(
        chat: ChatSession,
        prompt: String,
        options: LLMOptions?,
        tokenLimit: Int,
        images: List<android.graphics.Bitmap> = emptyList()
    ): com.google.mlkit.genai.prompt.GenerateContentRequest {
        while (true) {
            val request = buildRequest(chat, prompt, options, images)
            val requiredTokens = model.countTokens(request).totalTokens + request.maxOutputTokens
            if (requiredTokens <= tokenLimit) return request
            val removed = synchronized(chat) { ChatHistory.dropOldestTurn(chat) }
            if (!removed) throw LocalLLMError.ContextWindowExceeded()
        }
    }

    private suspend fun selectBackend(
        imagesRequested: Boolean = false,
        legacyImageRouting: Boolean = false
    ): GenerationBackend {
        val system = systemAvailability()
        return chooseGenerationBackend(
            system,
            fallbackModel.isReady,
            fallbackModel.supportsVision,
            imagesRequested,
            legacyImageRouting
        )
    }

    private fun mapSdkError(error: GenAiException): LocalLLMError = mapGenAiErrorCode(error.errorCode, error)
}

internal enum class GenerationBackend {
    System,
    Fallback
}

internal fun chooseGenerationBackend(
    system: LLMAvailability,
    fallbackReady: Boolean,
    fallbackSupportsVision: Boolean,
    imagesRequested: Boolean,
    legacyImageRouting: Boolean = false
): GenerationBackend {
    if (imagesRequested && legacyImageRouting) {
        if (fallbackReady && fallbackSupportsVision) return GenerationBackend.Fallback
        if (fallbackReady) throw LocalLLMError.Unsupported("image input for this fallback model")
        throw LocalLLMError.Unsupported("legacy imagePaths without a configured fallback model")
    }
    if (system == LLMAvailability.Available) return GenerationBackend.System
    if (fallbackReady) {
        if (imagesRequested && !fallbackSupportsVision) {
            throw LocalLLMError.Unsupported("image input for this fallback model")
        }
        return GenerationBackend.Fallback
    }
    if (imagesRequested) throw LocalLLMError.Unsupported("image input")

    return when (system) {
        LLMAvailability.Downloadable -> throw LocalLLMError.DownloadRequired()
        LLMAvailability.Downloading, LLMAvailability.NotReady -> throw LocalLLMError.ModelNotReady()
        LLMAvailability.DeviceNotEligible -> throw LocalLLMError.DeviceNotEligible()
        else -> throw LocalLLMError.NotAvailable()
    }
}

internal fun resolveImageAnalysisAvailability(
    system: LLMAvailability,
    fallbackReady: Boolean,
    fallbackLoading: Boolean,
    fallbackSupportsVision: Boolean,
    fallbackMaxImages: Int
): ImageAnalysisAvailability = when {
    system == LLMAvailability.Available -> ImageAnalysisAvailability(
        LLMAvailability.Available,
        ImageAnalysisBackend.MlKitPrompt,
        ImageInputPolicy.MAX_IMAGES
    )
    fallbackReady && fallbackSupportsVision -> ImageAnalysisAvailability(
        LLMAvailability.Available,
        ImageAnalysisBackend.LiteRtLm,
        fallbackMaxImages
    )
    fallbackLoading -> ImageAnalysisAvailability(
        LLMAvailability.NotReady,
        ImageAnalysisBackend.LiteRtLm,
        fallbackMaxImages
    )
    else -> ImageAnalysisAvailability(system)
}

internal fun mapGenAiErrorCode(errorCode: Int, cause: Throwable? = null): LocalLLMError = when (errorCode) {
        GenAiException.ErrorCode.CANCELLED -> LocalLLMError.GenerationCancelled(cause)
        GenAiException.ErrorCode.NOT_SUPPORTED,
        GenAiException.ErrorCode.AICORE_INCOMPATIBLE -> LocalLLMError.DeviceNotEligible(cause)
        GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE -> LocalLLMError.DeviceNotEligible(cause)
        GenAiException.ErrorCode.NOT_AVAILABLE -> LocalLLMError.NotAvailable(cause)
        GenAiException.ErrorCode.REQUEST_TOO_LARGE -> LocalLLMError.ContextWindowExceeded(cause)
        else -> LocalLLMError.NotAvailable(cause)
}

internal fun mapAvailabilityError(errorCode: Int): LLMAvailability = when (mapGenAiErrorCode(errorCode)) {
    is LocalLLMError.DeviceNotEligible -> LLMAvailability.DeviceNotEligible
    is LocalLLMError.ModelNotReady -> LLMAvailability.NotReady
    else -> LLMAvailability.Unavailable
}

internal fun mapFeatureStatus(status: Int): LLMAvailability = when (status) {
    FeatureStatus.UNAVAILABLE -> LLMAvailability.Unavailable
    FeatureStatus.DOWNLOADABLE -> LLMAvailability.Downloadable
    FeatureStatus.DOWNLOADING -> LLMAvailability.Downloading
    FeatureStatus.AVAILABLE -> LLMAvailability.Available
    else -> LLMAvailability.Unavailable
}
