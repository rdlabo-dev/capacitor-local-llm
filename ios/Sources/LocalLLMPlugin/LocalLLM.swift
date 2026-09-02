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

@available(iOS 26.0, *)
func mapImageAnalysisAvailability(
    _ availability: SystemLanguageModel.Availability,
    supportsVision: Bool
) -> LLMAvailability {
    let mapped = LocalLLM.mapAvailability(availability)
    return mapped == .available && !supportsVision ? .unavailable : mapped
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

enum NativeGenerationState: String, Sendable {
    case started, completed, cancelled, failed
}

typealias GenerationStateHandler = @Sendable (String, NativeGenerationState, String?) -> Void

@available(iOS 26.0, *)
private struct GenerationExecution: Sendable {
    let onState: GenerationStateHandler
    let operation: @Sendable (LanguageModelSession, GenerationOptions, String) async throws -> String
}

@available(iOS 26.0, *)
private func nativeGenerationOptions(_ options: LLMOptions?) -> GenerationOptions {
    #if compiler(>=6.4)
    GenerationOptions(
        samplingMode: options?.topK.map { .random(top: $0) },
        temperature: options?.temperature,
        maximumResponseTokens: options?.maxOutputTokens
    )
    #else
    GenerationOptions(
        sampling: options?.topK.map { .random(top: $0) },
        temperature: options?.temperature,
        maximumResponseTokens: options?.maxOutputTokens
    )
    #endif
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
    static let maxImagesPerGeneration = 4

    private let chats = ChatOwnershipStore()

    static func availability() -> LLMAvailability {
        guard #available(iOS 26.0, *) else { return .deviceNotEligible }
        return mapAvailability(SystemLanguageModel.default.availability)
    }

    static func imageAnalysisAvailability() -> LLMAvailability {
        #if compiler(>=6.4)
        guard #available(iOS 27.0, *) else { return .deviceNotEligible }
        return mapImageAnalysisAvailability(
            SystemLanguageModel.default.availability,
            supportsVision: imageAnalysisSupportsVision()
        )
        #else
        return .unavailable
        #endif
    }

    static func imageAnalysisSupportsVision() -> Bool {
        #if compiler(>=6.4)
        guard #available(iOS 27.0, *) else { return false }
        return SystemLanguageModel.default.capabilities.contains(.vision)
        #else
        return false
        #endif
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
        chats.insert(NativeChat(instructions: instructions, limits: try limits ?? HistoryLimits()), id: id)
        return id
    }

    func deleteChat(_ id: String) throws {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text chat") }
        let chat: NativeChat = try chats.value(for: id)
        try? chat.generation.cancel(requestedId: nil)
        _ = try chats.remove(id)
    }

    func warmup(chatId: String, promptPrefix: String?) throws {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        let chat: NativeChat = try chats.value(for: chatId)
        try checkAvailability()
        chat.session.prewarm(promptPrefix: .init(promptPrefix))
    }

    func generateText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        imageURLs: [URL] = [],
        onState: @escaping GenerationStateHandler = { _, _, _ in }
    ) async throws -> TextGenerationResult {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        let nativePrompt = try makePrompt(text: prompt, imageURLs: imageURLs)
        return try await runGeneration(
            chatId: chatId,
            prompt: prompt,
            imageCount: imageURLs.count,
            options: options,
            execution: GenerationExecution(onState: onState) { session, nativeOptions, _ in
                try await session.respond(to: nativePrompt, options: nativeOptions).content
            }
        )
    }

    func streamText(
        chatId: String,
        prompt: String,
        options: LLMOptions?,
        imageURLs: [URL] = [],
        onState: @escaping GenerationStateHandler = { _, _, _ in },
        onChunk: @escaping @Sendable (String, String) -> Void
    ) async throws -> TextGenerationResult {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        let nativePrompt = try makePrompt(text: prompt, imageURLs: imageURLs)
        return try await runGeneration(
            chatId: chatId,
            prompt: prompt,
            imageCount: imageURLs.count,
            options: options,
            execution: GenerationExecution(onState: onState) { session, nativeOptions, generationId in
                var accumulated = ""
                for try await snapshot in session.streamResponse(to: nativePrompt, options: nativeOptions) {
                    let current = snapshot.content
                    let chunk = current.hasPrefix(accumulated) ? String(current.dropFirst(accumulated.count)) : current
                    accumulated = current
                    if !chunk.isEmpty {
                        onChunk(generationId, chunk)
                    }
                }
                return accumulated
            }
        )
    }

    func cancelGeneration(chatId: String, generationId: String?) throws {
        guard #available(iOS 26.0, *) else { throw LocalLLMError.unsupported("text generation") }
        let chat: NativeChat = try chats.value(for: chatId)
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
        imageCount: Int,
        options: LLMOptions?,
        execution: GenerationExecution
    ) async throws -> TextGenerationResult {
        try checkAvailability()
        try options?.validate()
        let chat: NativeChat = try chats.value(for: chatId)
        guard chat.generation.task == nil else { throw LocalLLMError.chatBusy }

        trimHistory(
            chat,
            reservedCharacters: prompt.count
                + imageCount * HistoryLimits.reservedCharactersPerImage
                + (options?.maxOutputTokens ?? HistoryLimits.defaultReservedOutputCharacters),
            contextSize: SystemLanguageModel.default.contextSize
        )

        let generationId = UUID().uuidString
        let nativeOptions = nativeGenerationOptions(options)
        let session = chat.session
        let transcriptBeforeGeneration = session.transcript
        let task = Task.detached { try await execution.operation(session, nativeOptions, generationId) }
        try chat.generation.begin(id: generationId, task: task)
        execution.onState(generationId, .started, nil)

        do {
            let text = try await task.value
            if task.isCancelled { throw CancellationError() }
            if imageCount > 0 {
                let entries = appendingTextTurn(
                    to: Array(transcriptBeforeGeneration), prompt: prompt, response: text
                )
                chat.replaceSession(transcript: Transcript(entries: entries))
            }
            trimHistory(chat)
            finishGeneration(chatId: chatId, generationId: generationId)
            execution.onState(generationId, .completed, nil)
            return TextGenerationResult(text: text, generationId: generationId)
        } catch is CancellationError {
            chat.replaceSession(transcript: transcriptBeforeGeneration)
            finishGeneration(chatId: chatId, generationId: generationId)
            execution.onState(generationId, .cancelled, LocalLLMError.generationCancelled.errorCode)
            throw LocalLLMError.generationCancelled
        } catch {
            chat.replaceSession(transcript: transcriptBeforeGeneration)
            finishGeneration(chatId: chatId, generationId: generationId)
            let mapped = mapNativeGenerationError(error)
            let code = (mapped as? LocalLLMError)?.errorCode ?? "LOCAL_LLM_UNKNOWN_ERROR"
            execution.onState(generationId, .failed, code)
            throw mapped
        }
    }

    @available(iOS 26.0, *)
    private func finishGeneration(chatId: String, generationId: String) {
        guard let chat: NativeChat = try? chats.value(for: chatId) else { return }
        chat.generation.finish(id: generationId)
    }

    @available(iOS 26.0, *)
    private func makePrompt(text: String, imageURLs: [URL]) throws -> Prompt {
        guard !imageURLs.isEmpty else { return Prompt(text) }
        guard imageURLs.count <= Self.maxImagesPerGeneration else {
            throw LocalLLMError.invalidOptions("at most \(Self.maxImagesPerGeneration) image(s) can be supplied")
        }
        #if compiler(>=6.4)
        if #available(iOS 27.0, *) {
            guard Self.imageAnalysisSupportsVision() else {
                throw LocalLLMError.unsupported("image input")
            }
            return Prompt {
                text
                for (index, url) in imageURLs.enumerated() {
                    Attachment(imageURL: url).label("image-\(index)")
                }
            }
        }
        #endif
        throw LocalLLMError.unsupported("image input")
    }

    @available(iOS 26.0, *)
    private func trimHistory(_ chat: NativeChat, reservedCharacters: Int = 0, contextSize: Int? = nil) {
        let originalEntries = Array(chat.session.transcript)
        let entries = trimmedTranscriptEntries(
            originalEntries,
            limits: chat.limits,
            reservedCharacters: reservedCharacters,
            contextSize: contextSize
        )
        if entries.count != originalEntries.count {
            chat.replaceSession(transcript: Transcript(entries: entries))
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
