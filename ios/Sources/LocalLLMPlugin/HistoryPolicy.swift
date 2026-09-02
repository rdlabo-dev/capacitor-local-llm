import FoundationModels

public struct HistoryLimits: Sendable {
    static let defaultMaxMessages = 20
    static let defaultMaxCharacters = 12_000
    static let defaultReservedOutputCharacters = 512

    let maxMessages: Int
    let maxCharacters: Int

    init(maxMessages: Int = defaultMaxMessages, maxCharacters: Int = defaultMaxCharacters) throws {
        guard maxMessages >= 2 else { throw LocalLLMError.invalidOptions("history.maxMessages must be at least 2") }
        guard maxCharacters > 0 else {
            throw LocalLLMError.invalidOptions("history.maxCharacters must be greater than 0")
        }
        self.maxMessages = maxMessages
        self.maxCharacters = maxCharacters
    }
}

@available(iOS 26.0, *)
func trimmedTranscriptEntries(
    _ source: [Transcript.Entry],
    limits: HistoryLimits,
    reservedCharacters: Int = 0,
    contextSize: Int? = nil
) -> [Transcript.Entry] {
    var entries = source
    while transcriptMessageCount(entries) > limits.maxMessages ||
            transcriptCharacterCount(entries, includeInstructions: false) > limits.maxCharacters ||
            contextSize.map({ transcriptCharacterCount(entries, includeInstructions: true) + reservedCharacters > $0 }) == true {
        guard let promptIndex = entries.firstIndex(where: { if case .prompt = $0 { true } else { false } }) else {
            break
        }
        let responseIndex = entries[(promptIndex + 1)...].firstIndex { if case .response = $0 { true } else { false } }
        entries.removeSubrange(promptIndex...(responseIndex ?? promptIndex))
    }
    return entries
}

@available(iOS 26.0, *)
private func transcriptMessageCount(_ entries: [Transcript.Entry]) -> Int {
    entries.reduce(into: 0) { count, entry in
        if case .prompt = entry { count += 1 }
        if case .response = entry { count += 1 }
    }
}

@available(iOS 26.0, *)
private func transcriptCharacterCount(_ entries: [Transcript.Entry], includeInstructions: Bool) -> Int {
    entries.reduce(into: 0) { count, entry in
        let segments: [Transcript.Segment]
        switch entry {
        case .instructions(let instructions) where includeInstructions: segments = instructions.segments
        case .prompt(let prompt): segments = prompt.segments
        case .response(let response): segments = response.segments
        default: return
        }
        count += segments.reduce(into: 0) { total, segment in
            if case .text(let text) = segment { total += text.content.count }
        }
    }
}
