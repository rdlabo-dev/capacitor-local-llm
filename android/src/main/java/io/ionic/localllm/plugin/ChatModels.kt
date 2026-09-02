package io.ionic.localllm.plugin

import kotlinx.coroutines.Job
import java.util.UUID

enum class ChatRole(val promptLabel: String) {
    User("user"),
    Assistant("assistant")
}

data class ChatMessage(val role: ChatRole, val content: String)

data class HistoryLimits(
    val maxMessages: Int = DEFAULT_MAX_MESSAGES,
    val maxCharacters: Int = DEFAULT_MAX_CHARACTERS
) {
    init {
        if (maxMessages < 2) throw LocalLLMError.InvalidOptions("history.maxMessages must be at least 2")
        if (maxCharacters < 1) throw LocalLLMError.InvalidOptions("history.maxCharacters must be greater than 0")
    }

    companion object {
        const val DEFAULT_MAX_MESSAGES = 20
        const val DEFAULT_MAX_CHARACTERS = 12_000
    }
}

data class ActiveGeneration(val id: String, val job: Job)

data class ChatSession(
    val instructions: String?,
    val limits: HistoryLimits,
    val history: MutableList<ChatMessage> = mutableListOf(),
    var activeGeneration: ActiveGeneration? = null
)

internal object ChatHistory {
    fun appendTurn(chat: ChatSession, prompt: String, response: String) {
        chat.history += ChatMessage(ChatRole.User, prompt)
        chat.history += ChatMessage(ChatRole.Assistant, response)
        trim(chat)
    }

    fun trim(chat: ChatSession) {
        while (
            chat.history.size > chat.limits.maxMessages ||
            chat.history.sumOf { it.content.length } > chat.limits.maxCharacters
        ) {
            if (!dropOldestTurn(chat)) return
        }
    }

    fun dropOldestTurn(chat: ChatSession): Boolean {
        if (chat.history.isEmpty()) return false
        chat.history.removeAt(0)
        if (chat.history.firstOrNull()?.role == ChatRole.Assistant) chat.history.removeAt(0)
        return true
    }

    fun buildPrompt(chat: ChatSession, prompt: String, includeInstructions: Boolean): String = buildString {
        if (includeInstructions && !chat.instructions.isNullOrBlank()) {
            appendLine("<system>")
            appendLine(chat.instructions)
            appendLine("</system>")
        }
        chat.history.forEach { message ->
            appendLine("<${message.role.promptLabel}>")
            appendLine(message.content)
            appendLine("</${message.role.promptLabel}>")
        }
        appendLine("<user>")
        appendLine(prompt)
        append("</user>")
    }
}

internal class ChatStore {
    private val chats = mutableMapOf<String, ChatSession>()

    fun create(instructions: String?, limits: HistoryLimits, id: String = UUID.randomUUID().toString()): String =
        synchronized(chats) {
            chats.putIfAbsent(id, ChatSession(instructions, limits))
            id
        }

    fun get(id: String): ChatSession = synchronized(chats) { chats[id] } ?: throw LocalLLMError.ChatNotFound()

    fun delete(id: String) {
        val chat = synchronized(chats) { chats.remove(id) } ?: throw LocalLLMError.ChatNotFound()
        synchronized(chat) { chat.activeGeneration?.job?.cancel() }
    }

    fun begin(id: String, generation: ActiveGeneration): ChatSession {
        val chat = get(id)
        synchronized(chat) {
            if (chat.activeGeneration != null) throw LocalLLMError.ChatBusy()
            chat.activeGeneration = generation
        }
        return chat
    }

    fun finish(chat: ChatSession, generationId: String) {
        synchronized(chat) {
            if (chat.activeGeneration?.id == generationId) chat.activeGeneration = null
        }
    }

    fun cancel(id: String, generationId: String?) {
        val chat = get(id)
        val active = synchronized(chat) { chat.activeGeneration } ?: throw LocalLLMError.GenerationNotFound()
        if (generationId != null && generationId != active.id) throw LocalLLMError.GenerationNotFound()
        active.job.cancel()
    }

    fun clear() {
        synchronized(chats) {
            chats.values.forEach { chat -> synchronized(chat) { chat.activeGeneration?.job?.cancel() } }
            chats.clear()
        }
    }
}
