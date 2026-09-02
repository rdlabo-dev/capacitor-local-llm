package io.ionic.localllm.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Logger
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "LocalLLM")
class LocalLLMPlugin : Plugin() {
    private var implementation: LocalLLM? = null
    private val coroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var availabilityPollingJob: Job? = null
    private var forceAvailabilityListenerUpdate = false

    override fun load() {
        super.load()
        implementation = LocalLLM(context)
    }

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    override fun addListener(call: PluginCall) {
        super.addListener(call)
        if (call.getString("eventName") in setOf("availabilityChange", "systemAvailabilityChange")) {
            startAvailabilityPolling()
        }
    }

    @PluginMethod
    override fun removeAllListeners(call: PluginCall) {
        super.removeAllListeners(call)
        stopAvailabilityPolling()
    }

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    override fun removeListener(call: PluginCall) {
        super.removeListener(call)
        if (!hasListeners("availabilityChange") && !hasListeners("systemAvailabilityChange")) {
            stopAvailabilityPolling()
        }
    }

    override fun handleOnDestroy() {
        availabilityPollingJob?.cancel()
        val current = implementation
        implementation = null
        coroutineScope.launch {
            try {
                current?.close()
            } finally {
                coroutineScope.cancel()
            }
        }
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getAvailability(call: PluginCall) = resolveAvailability(call)

    @PluginMethod
    fun systemAvailability(call: PluginCall) = resolveAvailability(call, legacy = true)

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        coroutineScope.launch {
            try {
                impl().download { event ->
                    val data = JSObject()
                    when (event) {
                        ModelDownloadEvent.Started -> data.put("progress", 0)
                        is ModelDownloadEvent.Progress -> data.put("downloadedBytes", event.downloadedBytes)
                        ModelDownloadEvent.Completed -> data.put("progress", 1)
                    }
                    notifyListeners("downloadProgress", data)
                }
                call.resolve()
            } catch (error: Exception) {
                call.rejectWithError(error)
            }
        }
    }

    @PluginMethod
    fun download(call: PluginCall) = downloadModel(call)

    @PluginMethod
    fun configureFallbackModel(call: PluginCall) {
        coroutineScope.launch {
            try {
                val maxTokens = call.optionalInt("maxTokens") ?: FallbackModelOptions.DEFAULT_MAX_TOKENS
                val maxImages = call.optionalInt("maxImages") ?: FallbackModelOptions.DEFAULT_MAX_IMAGES
                impl().configureFallbackModel(
                    FallbackModelOptions(
                        call.requiredString("path"),
                        maxTokens,
                        maxImages,
                        call.getBoolean("supportsImages", true) ?: true
                    )
                )
                forceAvailabilityListenerUpdate = true
                call.resolve()
            } catch (error: Exception) {
                call.rejectWithError(error)
            }
        }
    }

    @PluginMethod
    fun warmup(call: PluginCall) {
        coroutineScope.launch {
            try {
                impl().warmup()
                call.resolve()
            } catch (error: Exception) {
                call.rejectWithError(error)
            }
        }
    }

    @PluginMethod
    fun createChat(call: PluginCall) {
        try {
            val history = call.getObject("history")
            val limits = HistoryLimits(
                maxMessages = history?.optionalInt("maxMessages") ?: HistoryLimits.DEFAULT_MAX_MESSAGES,
                maxCharacters = history?.optionalInt("maxCharacters") ?: HistoryLimits.DEFAULT_MAX_CHARACTERS
            )
            call.resolve(JSObject().put("id", impl().createChat(call.getString("instructions"), limits)))
        } catch (error: Exception) {
            call.rejectWithError(error)
        }
    }

    @PluginMethod
    fun deleteChat(call: PluginCall) {
        try {
            impl().deleteChat(call.requiredString("id"))
            call.resolve()
        } catch (error: Exception) {
            call.rejectWithError(error)
        }
    }

    @PluginMethod
    fun generateText(call: PluginCall) {
        coroutineScope.launch {
            try {
                val result = impl().generateText(
                    call.requiredString("chatId"),
                    call.requiredString("prompt"),
                    generationOptions(call, legacy = false),
                    imagePaths(call)
                )
                call.resolve(result.toJSObject())
            } catch (error: Exception) {
                call.rejectWithError(error)
            }
        }
    }

    @PluginMethod
    fun streamText(call: PluginCall) {
        coroutineScope.launch {
            try {
                val chatId = call.requiredString("chatId")
                val result = impl().streamText(
                    chatId,
                    call.requiredString("prompt"),
                    generationOptions(call, legacy = false),
                    imagePaths(call)
                ) { generationId, chunk ->
                    notifyListeners(
                        "textChunk",
                        JSObject().put("chatId", chatId).put("generationId", generationId).put("text", chunk)
                    )
                }
                call.resolve(result.toJSObject())
            } catch (error: Exception) {
                call.rejectWithError(error)
            }
        }
    }

    @PluginMethod
    fun cancelGeneration(call: PluginCall) {
        try {
            impl().cancelGeneration(call.requiredString("chatId"), call.getString("generationId"))
            call.resolve()
        } catch (error: Exception) {
            call.rejectWithError(error)
        }
    }

    @PluginMethod
    fun prompt(call: PluginCall) {
        coroutineScope.launch {
            val requestedId = call.getString("sessionId")
            val chatId = requestedId ?: UUID.randomUUID().toString()
            try {
                impl().createChat(call.getString("instructions"), id = chatId)
                val result = impl().generateText(
                    chatId,
                    call.requiredString("prompt"),
                    generationOptions(call, legacy = true)
                )
                if (requestedId == null) impl().deleteChat(chatId)
                call.resolve(JSObject().put("text", result.text))
            } catch (error: Exception) {
                if (requestedId == null) runCatching { impl().deleteChat(chatId) }
                call.rejectWithError(error)
            }
        }
    }

    @PluginMethod
    fun endSession(call: PluginCall) {
        try {
            try {
                impl().deleteChat(call.requiredString("sessionId"))
            } catch (_: LocalLLMError.ChatNotFound) {
                // The deprecated API was idempotent; keep cleanup calls safe.
            }
            call.resolve()
        } catch (error: Exception) {
            call.rejectWithError(error)
        }
    }

    @PluginMethod
    fun generateImage(call: PluginCall) {
        call.rejectWithError(LocalLLMError.Unsupported("image generation"))
    }

    private fun resolveAvailability(call: PluginCall, legacy: Boolean = false) {
        coroutineScope.launch {
            try {
                val status = impl().availability()
                call.resolve(JSObject().put("status", if (legacy) status.legacyValue else status.value))
            } catch (error: Exception) {
                call.rejectWithError(error)
            }
        }
    }

    private fun generationOptions(call: PluginCall, legacy: Boolean): LLMOptions? {
        val value = call.getObject("options") ?: return if (legacy) LLMOptions(null, 16, null) else null
        return LLMOptions(
            temperature = value.optionalDouble("temperature")?.toFloat(),
            topK = if (legacy) 16 else value.optionalInt("topK"),
            maxOutputTokens = value.optionalInt(if (legacy) "maximumOutputTokens" else "maxOutputTokens")
        )
    }

    private fun imagePaths(call: PluginCall): List<String> {
        if (!call.data.has("imagePaths")) return emptyList()
        val values = call.getArray("imagePaths")
            ?: throw LocalLLMError.InvalidOptions("imagePaths must be an array")
        return (0 until values.length()).map { index ->
            values.optString(index).takeIf { it.isNotBlank() }
                ?: throw LocalLLMError.InvalidOptions("imagePaths must contain non-empty strings")
        }
    }

    private fun JSObject.optionalDouble(name: String): Double? {
        if (!has(name)) return null
        val number = opt(name) as? Number ?: throw LocalLLMError.InvalidOptions("$name must be a number")
        return number.toDouble().takeIf(Double::isFinite)
            ?: throw LocalLLMError.InvalidOptions("$name must be finite")
    }

    private fun JSObject.optionalInt(name: String): Int? {
        val number = optionalDouble(name) ?: return null
        if (number % 1 != 0.0 || number !in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble()) {
            throw LocalLLMError.InvalidOptions("$name must be an integer")
        }
        return number.toInt()
    }

    private fun TextGenerationResult.toJSObject() =
        JSObject().put("text", text).put("generationId", generationId)

    private fun PluginCall.requiredString(name: String): String =
        getString(name)?.takeIf { it.isNotBlank() }
            ?: throw LocalLLMError.InvalidOptions("$name is required")

    private fun PluginCall.optionalInt(name: String): Int? =
        if (data.has(name)) {
            val number = data.opt(name) as? Number
                ?: throw LocalLLMError.InvalidOptions("$name must be a number")
            val value = number.toDouble()
            if (!value.isFinite() || value % 1 != 0.0 || value !in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble()) {
                throw LocalLLMError.InvalidOptions("$name must be an integer")
            }
            value.toInt()
        } else null

    private fun PluginCall.rejectWithError(error: Exception) {
        val localError = error as? LocalLLMError
        reject(error.message ?: "Unknown error", localError?.code ?: "LOCAL_LLM_UNKNOWN_ERROR", error)
    }

    private fun impl(): LocalLLM = implementation ?: throw LocalLLMError.NotAvailable()

    private fun startAvailabilityPolling() {
        if (availabilityPollingJob?.isActive == true) {
            forceAvailabilityListenerUpdate = true
            return
        }
        availabilityPollingJob = coroutineScope.launch(Dispatchers.IO) {
            var lastAvailability: LLMAvailability? = null
            while (isActive) {
                try {
                    val current = impl().availability()
                    if (current != lastAvailability || forceAvailabilityListenerUpdate) {
                        lastAvailability = current
                        forceAvailabilityListenerUpdate = false
                        val data = JSObject().put("status", current.value)
                        notifyListeners("availabilityChange", data)
                        notifyListeners(
                            "systemAvailabilityChange",
                            JSObject().put("status", current.legacyValue)
                        )
                    }
                } catch (error: Exception) {
                    Logger.warn("LocalLLMPlugin", "Availability check failed: ${error.message}")
                }
                delay(2_000)
            }
        }
    }

    private fun stopAvailabilityPolling() {
        availabilityPollingJob?.cancel()
        availabilityPollingJob = null
    }
}
