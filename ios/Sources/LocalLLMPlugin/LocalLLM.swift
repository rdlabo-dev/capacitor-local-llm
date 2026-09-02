import Foundation
import FoundationModels
import ImageIO
import ImagePlayground
import UniformTypeIdentifiers

public enum LLMAvailability: String, Sendable {
    case available
    case deviceNotEligible = "device-not-eligible"
    case notEnabled = "not-enabled"
    case downloadable
    case downloading
    case notReady = "not-ready"
    case unavailable

    var legacyValue: String {
        switch self {
        case .available: return "available"
        case .downloadable: return "downloadable"
        case .downloading, .notReady: return "notready"
        case .deviceNotEligible, .notEnabled, .unavailable: return "unavailable"
        }
    }
}

public struct LLMOptions: Sendable {
    let temperature: Double?
    let topK: Int?
    let maxOutputTokens: Int?

    func validate() throws {
        if let temperature, !temperature.isFinite || temperature < 0 || temperature > 1 {
            throw LocalLLMError.invalidOptions("temperature must be between 0 and 1")
        }
        if let topK, topK < 1 {
            throw LocalLLMError.invalidOptions("topK must be greater than 0")
        }
        if let maxOutputTokens, maxOutputTokens < 1 {
            throw LocalLLMError.invalidOptions("maxOutputTokens must be greater than 0")
        }
    }
}

public struct TextGenerationResult: Sendable {
    let text: String
    let generationId: String
}

public enum LocalLLMError: LocalizedError, CustomNSError {
    case notAvailable
    case deviceNotEligible
    case notEnabled
    case modelNotReady
    case downloadRequired
    case contextWindowExceeded
    case chatNotFound
    case chatBusy
    case generationNotFound
    case generationCancelled
    case invalidOptions(String)
    case unsupported(String)
    case missingParameter(String)
    case imageGenerationFailed

    public var errorCode: String {
        switch self {
        case .notAvailable: return "LOCAL_LLM_NOT_AVAILABLE"
        case .deviceNotEligible: return "LOCAL_LLM_DEVICE_NOT_ELIGIBLE"
        case .notEnabled: return "LOCAL_LLM_NOT_ENABLED"
        case .modelNotReady: return "LOCAL_LLM_MODEL_NOT_READY"
        case .downloadRequired: return "LOCAL_LLM_MODEL_DOWNLOAD_REQUIRED"
        case .contextWindowExceeded: return "LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED"
        case .chatNotFound: return "LOCAL_LLM_CHAT_NOT_FOUND"
        case .chatBusy: return "LOCAL_LLM_CHAT_BUSY"
        case .generationNotFound: return "LOCAL_LLM_GENERATION_NOT_FOUND"
        case .generationCancelled: return "LOCAL_LLM_GENERATION_CANCELLED"
        case .invalidOptions, .missingParameter: return "LOCAL_LLM_INVALID_OPTIONS"
        case .unsupported: return "LOCAL_LLM_UNSUPPORTED"
        case .imageGenerationFailed: return "LOCAL_LLM_IMAGE_GENERATION_FAILED"
        }
    }

    public var errorDescription: String? {
        switch self {
        case .notAvailable: return "The on-device language model is unavailable"
        case .deviceNotEligible: return "This device is not eligible for Apple Intelligence"
        case .notEnabled: return "Apple Intelligence is not enabled"
        case .modelNotReady: return "The on-device language model is not ready"
        case .downloadRequired: return "The on-device language model must be downloaded"
        case .contextWindowExceeded: return "The chat context window was exceeded"
        case .chatNotFound: return "Chat not found"
        case .chatBusy: return "A generation is already running for this chat"
        case .generationNotFound: return "Generation not found"
        case .generationCancelled: return "Generation was cancelled"
        case .invalidOptions(let message): return message
        case .unsupported(let feature): return "\(feature) is not supported on iOS"
        case .missingParameter(let name): return "\(name) is required"
        case .imageGenerationFailed: return "Image generation failed"
        }
    }

    public var errorUserInfo: [String: Any] {
        [NSLocalizedDescriptionKey: errorDescription ?? ""]
    }
}

final class ChatOwnershipStore {
    private var values: [String: Any] = [:]

    func insert(_ value: Any, id: String) {
        if values[id] == nil { values[id] = value }
    }

    func value<Value>(for id: String, as type: Value.Type = Value.self) throws -> Value {
        guard let value = values[id] as? Value else { throw LocalLLMError.chatNotFound }
        return value
    }

    func remove(_ id: String) throws -> Any {
        guard let value = values.removeValue(forKey: id) else { throw LocalLLMError.chatNotFound }
        return value
    }
}

final class GenerationSlot {
    private(set) var id: String?
    private(set) var task: Task<String, Error>?

    func begin(id: String, task: Task<String, Error>) throws {
        guard self.task == nil else { throw LocalLLMError.chatBusy }
        self.id = id
        self.task = task
    }

    func cancel(requestedId: String?) throws {
        guard let id, let task else { throw LocalLLMError.generationNotFound }
        if let requestedId, requestedId != id { throw LocalLLMError.generationNotFound }
        task.cancel()
    }

    func finish(id: String) {
        guard self.id == id else { return }
        self.id = nil
        task = nil
    }
}

public actor LocalLLM {
    @available(iOS 26.0, *)
    private final class Chat {
        var session: LanguageModelSession
        let generation = GenerationSlot()
        let limits: HistoryLimits

        init(instructions: String?, limits: HistoryLimits) {
            session = LanguageModelSession(instructions: instructions)
            self.limits = limits
        }
    }

    private let chats = ChatOwnershipStore()

    static func availability() -> LLMAvailability {
        guard #available(iOS 26.0, *) else { return .deviceNotEligible }
        return mapAvailability(SystemLanguageModel.default.availability)
    }

    @available(iOS 26.0, *)
    static func mapAvailability(_ availability: SystemLanguageModel.Availability) -> LLMAvailability {
        switch availability {
        case .available:
            return .available
        case .unavailable(.deviceNotEligible):
            return .deviceNotEligible
        case .unavailable(.appleIntelligenceNotEnabled):
            return .notEnabled
        case .unavailable(.modelNotReady):
            return .notReady
        case .unavailable:
            return .unavailable
        }
    }

    func createChat(
        instructions: String? = nil,
        limits: HistoryLimits? = nil,
        id: String = UUID().uuidString
    ) throws -> String {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text chat") }
        chats.insert(Chat(instructions: instructions, limits: try limits ?? HistoryLimits()), id: id)
        return id
    }

    func deleteChat(_ id: String) throws {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text chat") }
        let chat: Chat = try chats.value(for: id)
        try? chat.generation.cancel(requestedId: nil)
        _ = try chats.remove(id)
    }

    func warmup(chatId: String, promptPrefix: String?) throws {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        let chat: Chat = try chats.value(for: chatId)
        try checkAvailability()
        chat.session.prewarm(promptPrefix: .init(promptPrefix))
    }

    func generateText(chatId: String, prompt: String, options: LLMOptions?) async throws -> TextGenerationResult {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        return try await runGeneration(chatId: chatId, prompt: prompt, options: options) { session, nativeOptions, _ in
            try await session.respond(to: prompt, options: nativeOptions).content
        }
    }

    func streamText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        onChunk: @escaping @Sendable (String, String) -> Void
    ) async throws -> TextGenerationResult {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        return try await runGeneration(
            chatId: chatId,
            prompt: prompt,
            options: options
        ) { session, nativeOptions, generationId in
            var accumulated = ""
            for try await snapshot in session.streamResponse(to: prompt, options: nativeOptions) {
                let current = snapshot.content
                let chunk = current.hasPrefix(accumulated) ? String(current.dropFirst(accumulated.count)) : current
                accumulated = current
                if !chunk.isEmpty {
                    onChunk(generationId, chunk)
                }
            }
            return accumulated
        }
    }

    func cancelGeneration(chatId: String, generationId: String?) throws {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        let chat: Chat = try chats.value(for: chatId)
        try chat.generation.cancel(requestedId: generationId)
    }

    func generateImage(prompt: String, promptImages: [String], variations: Int) async throws -> [String] {
        guard #available(iOS 18.4, *) else { throw LocalLLMError.unsupported("image generation") }

        let creator = try await ImageCreator()
        guard let style = creator.availableStyles.first else { throw LocalLLMError.imageGenerationFailed }
        var concepts: [ImagePlaygroundConcept] = [.text(prompt)]
        concepts.append(contentsOf: promptImages.compactMap(base64StringToCGImage).map(ImagePlaygroundConcept.image))

        var imageData: [String] = []
        for try await image in creator.images(for: concepts, style: style, limit: variations) {
            if let data = image.cgImage.toPNGData() {
                imageData.append(data.base64EncodedString())
            }
        }
        return imageData
    }

    @available(iOS 26.0, *)
    private func runGeneration(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        operation: @escaping @Sendable (LanguageModelSession, GenerationOptions, String) async throws -> String
    ) async throws -> TextGenerationResult {
        try checkAvailability()
        try options?.validate()
        let chat: Chat = try chats.value(for: chatId)
        guard chat.generation.task == nil else { throw LocalLLMError.chatBusy }

        trimHistory(
            chat,
            reservedCharacters: prompt.count + (options?.maxOutputTokens ?? HistoryLimits.defaultReservedOutputCharacters),
            contextSize: SystemLanguageModel.default.contextSize
        )

        let generationId = UUID().uuidString
        let nativeOptions = GenerationOptions(
            sampling: options?.topK.map { .random(top: $0) },
            temperature: options?.temperature,
            maximumResponseTokens: options?.maxOutputTokens
        )
        let session = chat.session
        let task = Task.detached { try await operation(session, nativeOptions, generationId) }
        try chat.generation.begin(id: generationId, task: task)

        do {
            let text = try await task.value
            if task.isCancelled { throw CancellationError() }
            trimHistory(chat)
            finishGeneration(chatId: chatId, generationId: generationId)
            return TextGenerationResult(text: text, generationId: generationId)
        } catch is CancellationError {
            finishGeneration(chatId: chatId, generationId: generationId)
            throw LocalLLMError.generationCancelled
        } catch {
            finishGeneration(chatId: chatId, generationId: generationId)
            throw mapGenerationError(error)
        }
    }

    @available(iOS 26.0, *)
    private func finishGeneration(chatId: String, generationId: String) {
        guard let chat: Chat = try? chats.value(for: chatId) else { return }
        chat.generation.finish(id: generationId)
    }

    @available(iOS 26.0, *)
    private func trimHistory(_ chat: Chat, reservedCharacters: Int = 0, contextSize: Int? = nil) {
        let originalEntries = Array(chat.session.transcript)
        let entries = trimmedTranscriptEntries(
            originalEntries,
            limits: chat.limits,
            reservedCharacters: reservedCharacters,
            contextSize: contextSize
        )
        if entries.count != originalEntries.count {
            chat.session = LanguageModelSession(transcript: Transcript(entries: entries))
        }
    }

    private func checkAvailability() throws {
        switch Self.availability() {
        case .available: return
        case .deviceNotEligible: throw LocalLLMError.deviceNotEligible
        case .notEnabled: throw LocalLLMError.notEnabled
        case .notReady, .downloading: throw LocalLLMError.modelNotReady
        case .downloadable: throw LocalLLMError.downloadRequired
        case .unavailable: throw LocalLLMError.notAvailable
        }
    }

    @available(iOS 26.0, *)
    private func mapGenerationError(_ error: Error) -> Error {
        guard let generationError = error as? LanguageModelSession.GenerationError else { return error }
        switch generationError {
        case .concurrentRequests: return LocalLLMError.chatBusy
        case .exceededContextWindowSize: return LocalLLMError.contextWindowExceeded
        case .assetsUnavailable: return LocalLLMError.modelNotReady
        default: return generationError
        }
    }

    private func base64StringToCGImage(_ base64String: String) -> CGImage? {
        let cleanedString = base64String.components(separatedBy: ",").last ?? base64String
        guard let data = Data(base64Encoded: cleanedString.trimmingCharacters(in: .whitespacesAndNewlines)),
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }
}

extension CGImage {
    func toPNGData() -> Data? {
        let pngData = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(pngData, UTType.png.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(destination, self, nil)
        return CGImageDestinationFinalize(destination) ? pngData as Data : nil
    }
}
