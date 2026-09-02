package io.ionic.localllm.plugin

data class LLMOptions(
    val temperature: Float?,
    val topK: Int?,
    val maxOutputTokens: Int?
) {
    fun validate(tokenLimit: Int) {
        if (temperature != null && (temperature !in 0f..1f || !temperature.isFinite())) {
            throw LocalLLMError.InvalidOptions("temperature must be between 0 and 1")
        }
        if (topK != null && topK < 1) {
            throw LocalLLMError.InvalidOptions("topK must be greater than 0")
        }
        val maximum = minOf(tokenLimit, MAX_OUTPUT_TOKENS)
        if (maxOutputTokens != null && maxOutputTokens !in 1..maximum) {
            throw LocalLLMError.InvalidOptions("maxOutputTokens must be between 1 and $maximum")
        }
    }

    companion object {
        const val DEFAULT_MAX_OUTPUT_TOKENS = 256
        const val MAX_OUTPUT_TOKENS = 4096
    }
}
