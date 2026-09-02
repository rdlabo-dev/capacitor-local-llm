package io.ionic.localllm.plugin

sealed class LocalLLMError(message: String, val code: String, cause: Throwable? = null) : Exception(message, cause) {
    class NotAvailable(cause: Throwable? = null) :
        LocalLLMError("The on-device language model is unavailable", "LOCAL_LLM_NOT_AVAILABLE", cause)
    class DeviceNotEligible(cause: Throwable? = null) :
        LocalLLMError("This device is not eligible for Gemini Nano", "LOCAL_LLM_DEVICE_NOT_ELIGIBLE", cause)
    class ModelNotReady(cause: Throwable? = null) :
        LocalLLMError("The on-device language model is not ready", "LOCAL_LLM_MODEL_NOT_READY", cause)
    class DownloadRequired :
        LocalLLMError("The on-device language model must be downloaded", "LOCAL_LLM_MODEL_DOWNLOAD_REQUIRED")
    class ContextWindowExceeded(cause: Throwable? = null) :
        LocalLLMError("The chat context window was exceeded", "LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED", cause)
    class ChatNotFound : LocalLLMError("Chat not found", "LOCAL_LLM_CHAT_NOT_FOUND")
    class ChatBusy : LocalLLMError("A generation is already running for this chat", "LOCAL_LLM_CHAT_BUSY")
    class GenerationNotFound : LocalLLMError("Generation not found", "LOCAL_LLM_GENERATION_NOT_FOUND")
    class GenerationCancelled(cause: Throwable? = null) :
        LocalLLMError("Generation was cancelled", "LOCAL_LLM_GENERATION_CANCELLED", cause)
    class ImageNotReadable(cause: Throwable? = null) :
        LocalLLMError("The image could not be read", "LOCAL_LLM_IMAGE_NOT_READABLE", cause)
    class ImageTooLarge(message: String? = null, cause: Throwable? = null) :
        LocalLLMError(
            message ?: "The image must not exceed ${ImageInputPolicy.MAX_FILE_MEBIBYTES} MiB",
            "LOCAL_LLM_IMAGE_TOO_LARGE",
            cause
        )
    class InvalidOptions(message: String) : LocalLLMError(message, "LOCAL_LLM_INVALID_OPTIONS")
    class Unsupported(feature: String) :
        LocalLLMError("$feature is not supported on Android", "LOCAL_LLM_UNSUPPORTED")
}
