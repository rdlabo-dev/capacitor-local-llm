import Foundation
import FoundationModels
import ImageIO

enum ImageInputPolicy {
    static let maxFileMebibytes = 32
    static let maxFileBytes = maxFileMebibytes * 1_024 * 1_024
    static let maxBase64Characters = ((maxFileBytes + 2) / 3) * 4
}

func decodedBase64Image(_ value: String) throws -> Data {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        throw LocalLLMError.invalidOptions("each image must contain non-empty base64 data")
    }
    let encoded: String
    if trimmed.hasPrefix("data:") {
        guard let comma = trimmed.firstIndex(of: ","),
              trimmed[..<comma].lowercased().hasSuffix(";base64") else {
            throw LocalLLMError.imageNotReadable
        }
        encoded = String(trimmed[trimmed.index(after: comma)...])
    } else {
        encoded = trimmed
    }
    guard encoded.count <= ImageInputPolicy.maxBase64Characters else {
        throw LocalLLMError.imageTooLarge
    }
    guard let data = Data(base64Encoded: encoded), !data.isEmpty else {
        throw LocalLLMError.imageNotReadable
    }
    guard data.count <= ImageInputPolicy.maxFileBytes else { throw LocalLLMError.imageTooLarge }
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          CGImageSourceGetCount(source) > 0,
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          image.width > 0,
          image.height > 0 else {
        throw LocalLLMError.imageNotReadable
    }
    return data
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
    case imageNotReadable
    case imageTooLarge
    case generationFailed(String)
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
        case .imageNotReadable: return "LOCAL_LLM_IMAGE_NOT_READABLE"
        case .imageTooLarge: return "LOCAL_LLM_IMAGE_TOO_LARGE"
        case .generationFailed: return "LOCAL_LLM_GENERATION_FAILED"
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
        case .imageNotReadable: return "The image could not be read"
        case .imageTooLarge: return "The image must not exceed \(ImageInputPolicy.maxFileMebibytes) MiB"
        case .generationFailed(let message): return message
        case .imageGenerationFailed: return "Image generation failed"
        }
    }

    public var errorUserInfo: [String: Any] {
        [NSLocalizedDescriptionKey: errorDescription ?? ""]
    }
}

func validatedLocalImageURL(_ value: String) throws -> URL {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        throw LocalLLMError.invalidOptions("each image must contain a non-empty uri")
    }
    let url: URL
    if trimmed.hasPrefix("/") {
        url = URL(fileURLWithPath: trimmed)
    } else if let parsed = URL(string: trimmed), parsed.isFileURL {
        url = parsed
    } else {
        throw LocalLLMError.imageNotReadable
    }
    guard FileManager.default.isReadableFile(atPath: url.path) else {
        throw LocalLLMError.imageNotReadable
    }
    let fileSize = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
    guard let fileSize else { throw LocalLLMError.imageNotReadable }
    guard fileSize <= ImageInputPolicy.maxFileBytes else { throw LocalLLMError.imageTooLarge }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          CGImageSourceGetCount(source) > 0,
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          image.width > 0,
          image.height > 0 else {
        throw LocalLLMError.imageNotReadable
    }
    return url
}

@available(iOS 26.0, *)
func mapNativeGenerationError(_ error: Error) -> Error {
    #if compiler(>=6.4)
    if #available(iOS 27.0, *), let mapped = mapIOS27GenerationError(error) {
        return mapped
    }
    #endif
    guard let generationError = error as? LanguageModelSession.GenerationError else { return error }
    switch generationError {
    case .concurrentRequests: return LocalLLMError.chatBusy
    case .exceededContextWindowSize: return LocalLLMError.contextWindowExceeded
    case .assetsUnavailable: return LocalLLMError.modelNotReady
    default: return generationError
    }
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
private func mapIOS27GenerationError(_ error: Error) -> Error? {
    if let languageModelError = error as? LanguageModelError {
        return mapLanguageModelError(languageModelError)
    }
    if let systemModelError = error as? SystemLanguageModel.Error {
        switch systemModelError {
        case .assetsUnavailable:
            return LocalLLMError.modelNotReady
        @unknown default:
            return LocalLLMError.generationFailed(systemModelError.localizedDescription)
        }
    }
    if let sessionError = error as? LanguageModelSession.Error {
        switch sessionError {
        case .concurrentRequests, .transcriptMutationWhileResponding:
            return LocalLLMError.chatBusy
        @unknown default:
            return LocalLLMError.generationFailed(sessionError.localizedDescription)
        }
    }
    return nil
}

@available(iOS 27.0, *)
private func mapLanguageModelError(_ error: LanguageModelError) -> LocalLLMError {
    switch error {
    case .contextSizeExceeded:
        return .contextWindowExceeded
    case .unsupportedCapability,
         .unsupportedTranscriptContent,
         .unsupportedGenerationGuide,
         .unsupportedLanguageOrLocale:
        return .unsupported("requested generation")
    case .rateLimited, .guardrailViolation, .refusal, .timeout:
        return .generationFailed(error.localizedDescription)
    @unknown default:
        return .generationFailed(error.localizedDescription)
    }
}
#endif
