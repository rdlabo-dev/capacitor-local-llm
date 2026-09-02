package io.ionic.localllm.plugin

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
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

class LocalLLM(
    context: Context,
    val model: GenerativeModel = Generation.getClient()
) {
    private val chats = ChatStore()
    private val generationMutex = Mutex()
    private val fallbackModel = LiteRtFallbackModel(context)

    private suspend fun systemAvailability(): LLMAvailability = try {
        mapFeatureStatus(model.checkStatus())
    } catch (error: GenAiException) {
        mapAvailabilityError(error.errorCode)
    }

    suspend fun availability(): LLMAvailability = generationMutex.withLock {
        val system = systemAvailability()
        when {
            system == LLMAvailability.Available -> system
            fallbackModel.isReady -> LLMAvailability.Available
            fallbackModel.isLoading -> LLMAvailability.NotReady
            else -> system
        }
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

    suspend fun generateText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        imagePaths: List<String> = emptyList()
    ): TextGenerationResult = runGeneration(chatId, prompt, options, imagePaths, streaming = false) { _, _ -> }

    suspend fun streamText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        imagePaths: List<String> = emptyList(),
        onChunk: (generationId: String, text: String) -> Unit
    ): TextGenerationResult = runGeneration(chatId, prompt, options, imagePaths, streaming = true, onChunk = onChunk)

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
        imagePaths: List<String>,
        streaming: Boolean,
        onChunk: (generationId: String, text: String) -> Unit
    ): TextGenerationResult {
        val generationId = UUID.randomUUID().toString()
        val active = ActiveGeneration(generationId, currentCoroutineContext().job)
        val chat = chats.begin(chatId, active)

        try {
            return generationMutex.withLock {
                val backend = selectBackend(imagePaths.isNotEmpty())
                val tokenLimit =
                    if (backend == GenerationBackend.System) model.getTokenLimit() else fallbackModel.maxTokens
                options?.validate(tokenLimit)
                val text = if (backend == GenerationBackend.Fallback) {
                    fallbackModel.generate(chat, prompt, imagePaths, options) { chunk ->
                        if (streaming) onChunk(generationId, chunk)
                    }
                } else {
                    val request = buildFittingRequest(chat, prompt, options, tokenLimit)
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
                synchronized(chat) { ChatHistory.appendTurn(chat, prompt, text) }
                TextGenerationResult(text, generationId)
            }
        } catch (error: CancellationException) {
            throw LocalLLMError.GenerationCancelled(error)
        } catch (error: GenAiException) {
            throw mapSdkError(error)
        } finally {
            chats.finish(chat, generationId)
        }
    }

    private suspend fun buildRequest(
        chat: ChatSession,
        prompt: String,
        options: LLMOptions?
    ): com.google.mlkit.genai.prompt.GenerateContentRequest {
        val systemPromptAvailable = model.isSystemPromptAvailable()
        return generateContentRequest(
            TextPart(ChatHistory.buildPrompt(chat, prompt, includeInstructions = !systemPromptAvailable))
        ) {
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
        tokenLimit: Int
    ): com.google.mlkit.genai.prompt.GenerateContentRequest {
        while (true) {
            val request = buildRequest(chat, prompt, options)
            val requiredTokens = model.countTokens(request).totalTokens + request.maxOutputTokens
            if (requiredTokens <= tokenLimit) return request
            val removed = synchronized(chat) { ChatHistory.dropOldestTurn(chat) }
            if (!removed) throw LocalLLMError.ContextWindowExceeded()
        }
    }

    private suspend fun selectBackend(imagesRequested: Boolean = false): GenerationBackend {
        val system = systemAvailability()
        return chooseGenerationBackend(system, fallbackModel.isReady, fallbackModel.supportsVision, imagesRequested)
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
    imagesRequested: Boolean
): GenerationBackend {
    if (!imagesRequested && system == LLMAvailability.Available) return GenerationBackend.System
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
