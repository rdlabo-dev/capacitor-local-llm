package io.ionic.localllm.plugin

import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatModelsTest {
    @Test
    fun chatLifecycleRejectsUnknownIds() {
        val store = ChatStore()
        val id = store.create("Be concise", HistoryLimits(), "chat-1")

        assertEquals("chat-1", id)
        assertEquals("Be concise", store.get(id).instructions)
        store.delete(id)
        assertThrows(LocalLLMError.ChatNotFound::class.java) { store.get(id) }
    }

    @Test
    fun busyChatRejectsSecondGenerationAndCancellationChecksId() {
        val store = ChatStore()
        val id = store.create(null, HistoryLimits())
        val job = Job()
        val chat = store.begin(id, ActiveGeneration("generation-1", job))

        assertThrows(LocalLLMError.ChatBusy::class.java) {
            store.begin(id, ActiveGeneration("generation-2", Job()))
        }
        assertThrows(LocalLLMError.GenerationNotFound::class.java) { store.cancel(id, "other") }
        store.cancel(id, "generation-1")
        assertTrue(job.isCancelled)
        store.finish(chat, "generation-1")
    }

    @Test
    fun historyIsStructuredAndTrimmedByWholeTurns() {
        val chat = ChatSession(null, HistoryLimits(maxMessages = 2, maxCharacters = 100))
        ChatHistory.appendTurn(chat, "first", "one")
        ChatHistory.appendTurn(chat, "second", "two")

        assertEquals(
            listOf(ChatMessage(ChatRole.User, "second"), ChatMessage(ChatRole.Assistant, "two")),
            chat.history
        )
    }

    @Test
    fun promptConstructionKeepsInstructionsOutsideHistory() {
        val chat = ChatSession("Be concise", HistoryLimits())
        ChatHistory.appendTurn(chat, "hello", "hi")

        val prompt = ChatHistory.buildPrompt(chat, "next", includeInstructions = true)

        assertTrue(prompt.startsWith("<system>\nBe concise\n</system>"))
        assertTrue(prompt.contains("<user>\nhello\n</user>"))
        assertTrue(prompt.endsWith("<user>\nnext\n</user>"))
        assertFalse(chat.history.any { it.content == "Be concise" })
    }

    @Test
    fun optionAndAvailabilityMappingAreStable() {
        LLMOptions(0.5f, 16, 256).validate(4096)
        assertThrows(LocalLLMError.InvalidOptions::class.java) { LLMOptions(2f, null, null).validate(4096) }
        assertThrows(LocalLLMError.InvalidOptions::class.java) { LLMOptions(null, null, 4097).validate(8192) }
        assertEquals(LLMAvailability.Available, mapFeatureStatus(FeatureStatus.AVAILABLE))
        assertEquals(LLMAvailability.Downloading, mapFeatureStatus(FeatureStatus.DOWNLOADING))
        assertEquals(LLMAvailability.Unavailable, mapFeatureStatus(Int.MIN_VALUE))
        assertEquals("notready", LLMAvailability.Downloading.legacyValue)
        assertTrue(mapGenAiErrorCode(GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE) is LocalLLMError.DeviceNotEligible)
        assertTrue(mapGenAiErrorCode(GenAiException.ErrorCode.NOT_AVAILABLE) is LocalLLMError.NotAvailable)
        assertEquals(LLMAvailability.Unavailable, mapAvailabilityError(606))
        assertEquals("LOCAL_LLM_CHAT_BUSY", LocalLLMError.ChatBusy().code)
    }

    @Test
    fun fallbackOptionsDefaultToVisionAndRejectInvalidLimits() {
        val options = FallbackModelOptions("/android_asset/model.litertlm")

        assertTrue(options.supportsImages)
        assertEquals(1, options.maxImages)
        assertEquals(4096, options.maxTokens)
        assertThrows(LocalLLMError.InvalidOptions::class.java) {
            FallbackModelOptions("/android_asset/model.task")
        }
        assertThrows(LocalLLMError.InvalidOptions::class.java) {
            FallbackModelOptions("/android_asset/model.litertlm", maxImages = 0)
        }
    }

    @Test
    fun fallbackBackendSelectionIsExplicit() {
        assertEquals(
            GenerationBackend.System,
            chooseGenerationBackend(LLMAvailability.Available, fallbackReady = true, true, imagesRequested = false)
        )
        assertEquals(
            GenerationBackend.Fallback,
            chooseGenerationBackend(LLMAvailability.Unavailable, fallbackReady = true, true, imagesRequested = true)
        )
        assertThrows(LocalLLMError.Unsupported::class.java) {
            chooseGenerationBackend(LLMAvailability.Available, fallbackReady = true, false, imagesRequested = true)
        }
    }

    @Test
    fun fallbackContextBudgetIsConservativeForCjkAndImages() {
        assertEquals(4096 + 64 + 256, estimateFallbackTokens(4096, imageCount = 0, maxOutputTokens = 256))
        assertEquals(512, estimateFallbackTokens(0, imageCount = 1, maxOutputTokens = 0) - 64)
    }

    @Test
    fun fallbackFileUrlsDecodeAndCopiesAreBounded() {
        val directory = File(System.getProperty("java.io.tmpdir"), "local llm 日本語")
        val file = File(directory, "photo one.jpg")
        assertEquals(file.absolutePath, resolveLocalFile(file.toURI().toString(), "image").absolutePath)
        assertThrows(LocalLLMError.InvalidOptions::class.java) {
            resolveLocalFile("file://example.com/photo.jpg", "image")
        }

        val output = ByteArrayOutputStream()
        runBlocking { copyWithByteLimit(ByteArrayInputStream(ByteArray(4)), output, maxBytes = 4) }
        assertEquals(4, output.size())
        assertThrows(LocalLLMError.InvalidOptions::class.java) {
            runBlocking {
                copyWithByteLimit(ByteArrayInputStream(ByteArray(5)), ByteArrayOutputStream(), maxBytes = 4)
            }
        }
    }

    @Test
    fun fallbackAssetCacheIdentityIncludesFullPath() {
        val first = assetCacheFileName(2, "models/a/model.litertlm")
        val second = assetCacheFileName(2, "models/b/model.litertlm")

        assertTrue(first.endsWith("-model.litertlm"))
        assertFalse(first == second)
        assertEquals(first, assetCacheFileName(2, "models/a/model.litertlm"))
    }

    @Test
    fun fallbackImageCopyObservesCancellation() = runBlocking {
        val copyJob = Job(coroutineContext[Job])
        val input = object : InputStream() {
            private var firstRead = true

            override fun read(): Int = -1

            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                if (!firstRead) return -1
                firstRead = false
                copyJob.cancel()
                buffer[offset] = 1
                return 1
            }
        }
        var cancellationObserved = false

        try {
            withContext(copyJob) { copyWithByteLimit(input, ByteArrayOutputStream()) }
        } catch (_: CancellationException) {
            cancellationObserved = true
        }

        assertTrue(cancellationObserved)
    }

    @Test
    fun liteRtCoroutineRuntimeProvidesRequiredChannelBridge() {
        val sendChannel = Class.forName("kotlinx.coroutines.channels.SendChannel")

        assertTrue(sendChannel.declaredMethods.any { it.name == "close\$default" })
    }
}
