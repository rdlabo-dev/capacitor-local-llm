import FoundationModels
import XCTest
@testable import LocalLLMPlugin

final class LocalLLMTests: XCTestCase {
    func testChatOwnershipLifecycle() throws {
        let store = ChatOwnershipStore()
        store.insert("chat", id: "chat-1")

        let value: String = try store.value(for: "chat-1")
        XCTAssertEqual(value, "chat")
        _ = try store.remove("chat-1")
        XCTAssertThrowsError(try store.value(for: "chat-1", as: String.self))
    }

    func testBusyAndCancellationState() throws {
        let slot = GenerationSlot()
        let task = Task<String, Error> {
            try await Task.sleep(for: .seconds(30))
            return "done"
        }
        try slot.begin(id: "generation-1", task: task)

        XCTAssertThrowsError(try slot.begin(id: "generation-2", task: Task<String, Error> { "other" })) { error in
            XCTAssertEqual((error as? LocalLLMError)?.errorCode, "LOCAL_LLM_CHAT_BUSY")
        }
        XCTAssertThrowsError(try slot.cancel(requestedId: "other"))
        try slot.cancel(requestedId: "generation-1")
        XCTAssertTrue(task.isCancelled)
        slot.finish(id: "generation-1")
        XCTAssertNil(slot.id)
    }

    func testOptionValidation() throws {
        try LLMOptions(temperature: 0.5, topK: 16, maxOutputTokens: 256).validate()
        XCTAssertThrowsError(try LLMOptions(temperature: 2, topK: nil, maxOutputTokens: nil).validate())
        XCTAssertThrowsError(try LLMOptions(temperature: nil, topK: 0, maxOutputTokens: nil).validate())
    }

    func testHistoryLimitValidationAndLegacyAvailability() throws {
        let limits = try HistoryLimits(maxMessages: 4, maxCharacters: 100)
        XCTAssertEqual(limits.maxMessages, 4)
        XCTAssertThrowsError(try HistoryLimits(maxMessages: 1, maxCharacters: 100))
        XCTAssertThrowsError(try HistoryLimits(maxMessages: 2, maxCharacters: 0))
        XCTAssertEqual(LLMAvailability.notReady.legacyValue, "notready")
        XCTAssertEqual(LLMAvailability.notEnabled.legacyValue, "unavailable")
    }

    @available(iOS 26.0, *)
    func testTranscriptTrimmingPreservesInstructionsAndDropsWholeTurn() throws {
        let instructions = Transcript.Entry.instructions(
            .init(segments: [.text(.init(content: "system"))], toolDefinitions: [])
        )
        let firstPrompt = Transcript.Entry.prompt(.init(segments: [.text(.init(content: "old question"))]))
        let firstResponse = Transcript.Entry.response(
            .init(assetIDs: [], segments: [.text(.init(content: "old answer"))])
        )
        let latestPrompt = Transcript.Entry.prompt(.init(segments: [.text(.init(content: "new"))]))
        let latestResponse = Transcript.Entry.response(.init(assetIDs: [], segments: [.text(.init(content: "answer"))]))

        let trimmed = trimmedTranscriptEntries(
            [instructions, firstPrompt, firstResponse, latestPrompt, latestResponse],
            limits: try HistoryLimits(maxMessages: 2, maxCharacters: 100),
            reservedCharacters: 10,
            contextSize: 100
        )

        XCTAssertEqual(trimmed, [instructions, latestPrompt, latestResponse])
    }

    @available(iOS 26.0, *)
    func testAvailabilityMappingPreservesNativeReason() {
        XCTAssertEqual(LocalLLM.mapAvailability(.available), .available)
        XCTAssertEqual(LocalLLM.mapAvailability(.unavailable(.deviceNotEligible)), .deviceNotEligible)
        XCTAssertEqual(LocalLLM.mapAvailability(.unavailable(.appleIntelligenceNotEnabled)), .notEnabled)
        XCTAssertEqual(LocalLLM.mapAvailability(.unavailable(.modelNotReady)), .notReady)
    }

    func testLocalImageURLValidationAndStableErrors() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let image = directory.appendingPathComponent("photo one.png")
        let png = try XCTUnwrap(
            Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        )
        try png.write(to: image)
        XCTAssertEqual(try validatedLocalImageURL(image.path), image)
        XCTAssertEqual(try validatedLocalImageURL(image.absoluteString), image)
        XCTAssertEqual(try decodedBase64Image(png.base64EncodedString()), png)
        XCTAssertEqual(
            try decodedBase64Image("data:image/png;base64,\(png.base64EncodedString())"),
            png
        )
        XCTAssertThrowsError(try decodedBase64Image("not-base64")) { error in
            XCTAssertEqual((error as? LocalLLMError)?.errorCode, "LOCAL_LLM_IMAGE_NOT_READABLE")
        }

        let corrupt = directory.appendingPathComponent("corrupt.png")
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: corrupt)
        XCTAssertThrowsError(try validatedLocalImageURL(corrupt.path)) { error in
            XCTAssertEqual((error as? LocalLLMError)?.errorCode, "LOCAL_LLM_IMAGE_NOT_READABLE")
        }

        XCTAssertThrowsError(try validatedLocalImageURL("https://example.com/image.png")) { error in
            XCTAssertEqual((error as? LocalLLMError)?.errorCode, "LOCAL_LLM_IMAGE_NOT_READABLE")
        }

        let oversized = directory.appendingPathComponent("oversized.png")
        FileManager.default.createFile(atPath: oversized.path, contents: nil)
        let handle = try FileHandle(forWritingTo: oversized)
        try handle.truncate(atOffset: UInt64(ImageInputPolicy.maxFileBytes + 1))
        try handle.close()
        XCTAssertThrowsError(try validatedLocalImageURL(oversized.path)) { error in
            XCTAssertEqual((error as? LocalLLMError)?.errorCode, "LOCAL_LLM_IMAGE_TOO_LARGE")
        }
    }

    #if compiler(>=6.4)
    @available(iOS 27.0, *)
    func testVisionAvailabilityAndIOS27ErrorMapping() {
        XCTAssertEqual(mapImageAnalysisAvailability(.available, supportsVision: true), .available)
        XCTAssertEqual(mapImageAnalysisAvailability(.available, supportsVision: false), .unavailable)
        XCTAssertEqual(
            mapImageAnalysisAvailability(.unavailable(.modelNotReady), supportsVision: true),
            .notReady
        )

        let contextError = LanguageModelError.contextSizeExceeded(
            .init(contextSize: 10, tokenCount: 11, debugDescription: "too large")
        )
        let unsupportedError = LanguageModelError.unsupportedCapability(
            .init(capability: .vision, debugDescription: "no vision")
        )
        let timeoutError = LanguageModelError.timeout(.init(debugDescription: "timeout"))

        XCTAssertEqual(
            (mapNativeGenerationError(contextError) as? LocalLLMError)?.errorCode,
            "LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED"
        )
        XCTAssertEqual(
            (mapNativeGenerationError(unsupportedError) as? LocalLLMError)?.errorCode,
            "LOCAL_LLM_UNSUPPORTED"
        )
        XCTAssertEqual(
            (mapNativeGenerationError(timeoutError) as? LocalLLMError)?.errorCode,
            "LOCAL_LLM_GENERATION_FAILED"
        )
        XCTAssertEqual(
            (mapNativeGenerationError(LanguageModelSession.Error.concurrentRequests) as? LocalLLMError)?
                .errorCode,
            "LOCAL_LLM_CHAT_BUSY"
        )
    }

    @available(iOS 26.0, *)
    func testImageTurnRetainsOnlyPromptAndResponseText() throws {
        let entries = appendingTextTurn(
            to: [],
            prompt: "Describe this",
            response: "A landscape"
        )
        XCTAssertEqual(entries.count, 2)
        guard case .prompt(let prompt) = entries[0],
              case .text(let promptText) = prompt.segments.first,
              case .response(let response) = entries[1],
              case .text(let responseText) = response.segments.first else {
            return XCTFail("Expected a text-only prompt and response")
        }
        XCTAssertEqual(promptText.content, "Describe this")
        XCTAssertEqual(responseText.content, "A landscape")
    }
    #endif
}
