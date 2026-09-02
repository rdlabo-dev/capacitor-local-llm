@preconcurrency import Capacitor
import Foundation

@objc(LocalLLMPlugin)
@preconcurrency
// Capacitor requires the complete JavaScript bridge surface on this plugin type.
// swiftlint:disable:next type_body_length
public class LocalLLMPlugin: CAPPlugin, CAPBridgedPlugin, @unchecked Sendable {
    public let identifier = "LocalLLMPlugin"
    public let jsName = "LocalLLM"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getImageAnalysisAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureFallbackModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "warmup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createChat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteChat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "streamText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelGeneration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "systemAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prompt", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endSession", returnType: CAPPluginReturnPromise)
    ]

    private let implementation = LocalLLM()
    private let warmupChatId = "__local_llm_warmup__"
    private var availabilityPollingTask: Task<Void, Never>?
    private var forceAvailabilityListenerUpdate = false

    @objc override public func addListener(_ call: CAPPluginCall) {
        super.addListener(call)
        let eventName = call.getString("eventName")
        if eventName == "availabilityChange" || eventName == "systemAvailabilityChange" {
            startAvailabilityPolling()
        }
    }

    @objc override public func removeAllListeners(_ call: CAPPluginCall) {
        super.removeAllListeners(call)
        stopAvailabilityPolling()
    }

    @objc override public func removeListener(_ call: CAPPluginCall) {
        super.removeListener(call)
        if !hasListeners("availabilityChange") && !hasListeners("systemAvailabilityChange") {
            stopAvailabilityPolling()
        }
    }

    @objc func getAvailability(_ call: CAPPluginCall) {
        resolveAvailability(call)
    }

    @objc func getImageAnalysisAvailability(_ call: CAPPluginCall) {
        let availability = LocalLLM.imageAnalysisAvailability()
        var result: JSObject = ["status": availability.rawValue]
        #if compiler(>=6.4)
        if #available(iOS 27.0, *), LocalLLM.imageAnalysisSupportsVision() {
            result["backend"] = "foundation-models"
            result["maxImages"] = LocalLLM.maxImagesPerGeneration
        }
        #endif
        call.resolve(result)
    }

    @objc func systemAvailability(_ call: CAPPluginCall) {
        call.resolve(["status": LocalLLM.availability().legacyValue])
    }

    @objc func downloadModel(_ call: CAPPluginCall) {
        rejectCall(call, LocalLLMError.unsupported("model download"))
    }

    @objc func download(_ call: CAPPluginCall) {
        downloadModel(call)
    }

    @objc func configureFallbackModel(_ call: CAPPluginCall) {
        rejectCall(call, LocalLLMError.unsupported("Android fallback model"))
    }

    @objc func createChat(_ call: CAPPluginCall) {
        Task {
            do {
                let history = call.getObject("history")
                let limits = try HistoryLimits(
                    maxMessages: try history.flatMap { try intOption($0, "maxMessages") }
                        ?? HistoryLimits.defaultMaxMessages,
                    maxCharacters: try history.flatMap { try intOption($0, "maxCharacters") }
                        ?? HistoryLimits.defaultMaxCharacters
                )
                let id = try await implementation.createChat(
                    instructions: call.getString("instructions"),
                    limits: limits
                )
                call.resolve(["id": id])
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func deleteChat(_ call: CAPPluginCall) {
        Task {
            do {
                let id = try requiredString(call, "id")
                try await implementation.deleteChat(id)
                call.resolve()
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func generateText(_ call: CAPPluginCall) {
        Task { [self] in
            do {
                let chatId = try requiredString(call, "chatId")
                let images = try resolvedImages(call)
                defer { images.close() }
                let result = try await implementation.generateText(
                    chatId: chatId,
                    prompt: requiredString(call, "prompt"),
                    options: try generationOptions(call),
                    imageURLs: images.urls,
                    onState: { [weak self] generationId, state, errorCode in
                        self?.notifyGenerationState(chatId, generationId, state, errorCode)
                    }
                )
                call.resolve(["text": result.text, "generationId": result.generationId])
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func streamText(_ call: CAPPluginCall) {
        Task { [self] in
            do {
                let chatId = try requiredString(call, "chatId")
                let images = try resolvedImages(call)
                defer { images.close() }
                let result = try await implementation.streamText(
                    chatId: chatId,
                    prompt: requiredString(call, "prompt"),
                    options: try generationOptions(call),
                    imageURLs: images.urls,
                    onState: { [weak self] generationId, state, errorCode in
                        self?.notifyGenerationState(chatId, generationId, state, errorCode)
                    },
                    onChunk: { [weak self] generationId, chunk in
                    self?.notifyListeners("textChunk", data: [
                        "chatId": chatId,
                        "generationId": generationId,
                        "text": chunk
                    ])
                })
                call.resolve(["text": result.text, "generationId": result.generationId])
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func cancelGeneration(_ call: CAPPluginCall) {
        Task {
            do {
                try await implementation.cancelGeneration(
                    chatId: requiredString(call, "chatId"),
                    generationId: call.getString("generationId")
                )
                call.resolve()
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func warmup(_ call: CAPPluginCall) {
        Task {
            do {
                let explicitChatId = call.getString("chatId")
                let legacySessionId = call.getString("sessionId")
                let chatId = explicitChatId ?? legacySessionId ?? warmupChatId
                if explicitChatId == nil {
                    _ = try await implementation.createChat(
                        instructions: call.getString("promptPrefix"),
                        id: chatId
                    )
                }
                try await implementation.warmup(chatId: chatId, promptPrefix: call.getString("promptPrefix"))
                call.resolve()
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func prompt(_ call: CAPPluginCall) {
        Task {
            let requestedId = call.getString("sessionId")
            let chatId = requestedId ?? UUID().uuidString
            do {
                _ = try await implementation.createChat(instructions: call.getString("instructions"), id: chatId)
                let result = try await implementation.generateText(
                    chatId: chatId,
                    prompt: requiredString(call, "prompt"),
                    options: try legacyGenerationOptions(call)
                )
                if requestedId == nil { try? await implementation.deleteChat(chatId) }
                call.resolve(["text": result.text])
            } catch {
                if requestedId == nil { try? await implementation.deleteChat(chatId) }
                rejectCall(call, error)
            }
        }
    }

    @objc func endSession(_ call: CAPPluginCall) {
        Task {
            do {
                do {
                    try await implementation.deleteChat(requiredString(call, "sessionId"))
                } catch LocalLLMError.chatNotFound {
                    // The deprecated API was idempotent; keep cleanup calls safe.
                }
                call.resolve()
            } catch {
                rejectCall(call, error)
            }
        }
    }

    @objc func generateImage(_ call: CAPPluginCall) {
        Task {
            do {
                let images = try await implementation.generateImage(
                    prompt: requiredString(call, "prompt"),
                    promptImages: call.getArray("promptImages")?.compactMap { $0 as? String } ?? [],
                    variations: max(1, call.getInt("count", 1))
                )
                call.resolve(["pngBase64Images": images])
            } catch {
                rejectCall(call, error)
            }
        }
    }

    private func resolveAvailability(_ call: CAPPluginCall) {
        call.resolve(["status": LocalLLM.availability().rawValue])
    }

    private func notifyGenerationState(
        _ chatId: String,
        _ generationId: String,
        _ state: NativeGenerationState,
        _ errorCode: String?
    ) {
        var data: JSObject = ["chatId": chatId, "generationId": generationId, "state": state.rawValue]
        if let errorCode { data["errorCode"] = errorCode }
        notifyListeners("generationStateChange", data: data)
    }

    private func requiredString(_ call: CAPPluginCall, _ name: String) throws -> String {
        guard let value = call.getString(name), !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw LocalLLMError.missingParameter(name)
        }
        return value
    }

    private func generationOptions(_ call: CAPPluginCall) throws -> LLMOptions? {
        guard let value = call.getObject("options") else { return nil }
        return LLMOptions(
            temperature: try doubleOption(value, "temperature"),
            topK: try intOption(value, "topK"),
            maxOutputTokens: try intOption(value, "maxOutputTokens")
        )
    }

    private func legacyGenerationOptions(_ call: CAPPluginCall) throws -> LLMOptions? {
        guard let value = call.getObject("options") else { return nil }
        return LLMOptions(
            temperature: try doubleOption(value, "temperature"),
            topK: nil,
            maxOutputTokens: try intOption(value, "maximumOutputTokens")
        )
    }

    private func doubleOption(_ object: JSObject, _ name: String) throws -> Double? {
        guard let raw = object[name] else { return nil }
        guard !(raw is Bool), let number = raw as? NSNumber else {
            throw LocalLLMError.invalidOptions("\(name) must be a number")
        }
        let value = number.doubleValue
        guard value.isFinite else { throw LocalLLMError.invalidOptions("\(name) must be finite") }
        return value
    }

    private func intOption(_ object: JSObject, _ name: String) throws -> Int? {
        guard let value = try doubleOption(object, name) else { return nil }
        guard value.rounded() == value, value >= Double(Int.min), value <= Double(Int.max) else {
            throw LocalLLMError.invalidOptions("\(name) must be an integer")
        }
        return Int(value)
    }

    private func rejectCall(_ call: CAPPluginCall, _ error: Error) {
        if let error = error as? LocalLLMError {
            call.reject(error.localizedDescription, error.errorCode)
        } else {
            call.reject(error.localizedDescription, "LOCAL_LLM_UNKNOWN_ERROR")
        }
    }

    private func startAvailabilityPolling() {
        guard availabilityPollingTask == nil else {
            forceAvailabilityListenerUpdate = true
            return
        }
        availabilityPollingTask = Task { [weak self] in
            var lastAvailability: LLMAvailability?
            while !Task.isCancelled {
                guard let self else { return }
                let current = LocalLLM.availability()
                if current != lastAvailability || forceAvailabilityListenerUpdate {
                    lastAvailability = current
                    forceAvailabilityListenerUpdate = false
                    notifyListeners("availabilityChange", data: ["status": current.rawValue])
                    notifyListeners("systemAvailabilityChange", data: ["status": current.legacyValue])
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    private func stopAvailabilityPolling() {
        availabilityPollingTask?.cancel()
        availabilityPollingTask = nil
    }
}
