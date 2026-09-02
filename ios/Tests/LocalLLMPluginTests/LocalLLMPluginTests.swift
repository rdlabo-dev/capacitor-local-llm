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
}
