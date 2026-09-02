@preconcurrency import Capacitor
import Foundation

final class ResolvedImageInput {
    let urls: [URL]
    private let temporaryURLs: [URL]

    init(urls: [URL], temporaryURLs: [URL]) {
        self.urls = urls
        self.temporaryURLs = temporaryURLs
    }

    func close() {
        temporaryURLs.forEach { try? FileManager.default.removeItem(at: $0) }
    }
}

func resolvedImages(_ call: CAPPluginCall) throws -> ResolvedImageInput {
    let hasImages = call.options["images"] != nil
    let hasLegacyPaths = call.options["imagePaths"] != nil
    if hasImages && hasLegacyPaths {
        throw LocalLLMError.invalidOptions("images and imagePaths cannot be used together")
    }
    if hasImages {
        guard let images = call.getArray("images") else {
            throw LocalLLMError.invalidOptions("images must be an array")
        }
        guard images.count <= LocalLLM.maxImagesPerGeneration else {
            throw LocalLLMError.invalidOptions(
                "at most \(LocalLLM.maxImagesPerGeneration) image(s) can be supplied"
            )
        }
        var temporaryURLs: [URL] = []
        do {
            let urls = try images.map { value in
                try resolveImage(value, temporaryURLs: &temporaryURLs)
            }
            return ResolvedImageInput(urls: urls, temporaryURLs: temporaryURLs)
        } catch {
            temporaryURLs.forEach { try? FileManager.default.removeItem(at: $0) }
            throw error
        }
    }
    guard hasLegacyPaths else { return ResolvedImageInput(urls: [], temporaryURLs: []) }
    guard let paths = call.getArray("imagePaths") as? [String], paths.allSatisfy({ !$0.isEmpty }) else {
        throw LocalLLMError.invalidOptions("imagePaths must be an array of non-empty strings")
    }
    if !paths.isEmpty { throw LocalLLMError.unsupported("image input") }
    return ResolvedImageInput(urls: [], temporaryURLs: [])
}

private func resolveImage(_ value: Any, temporaryURLs: inout [URL]) throws -> URL {
    guard let object = value as? JSObject else {
        throw LocalLLMError.invalidOptions("each image must be an object")
    }
    let uri = (object["uri"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let base64 = (object["base64"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasURI = uri?.isEmpty == false
    let hasBase64 = base64?.isEmpty == false
    guard hasURI != hasBase64 else {
        throw LocalLLMError.invalidOptions("each image must contain exactly one of uri or base64")
    }
    if let uri, hasURI { return try validatedLocalImageURL(uri) }

    let data = try decodedBase64Image(base64 ?? "")
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("local-llm-\(UUID().uuidString).img")
    do {
        try data.write(to: url, options: .atomic)
    } catch {
        throw LocalLLMError.imageNotReadable
    }
    temporaryURLs.append(url)
    return try validatedLocalImageURL(url.path)
}
