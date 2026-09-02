import FoundationModels

@available(iOS 26.0, *)
final class NativeChat {
    var session: LanguageModelSession
    let generation = GenerationSlot()
    let limits: HistoryLimits

    init(instructions: String?, limits: HistoryLimits) {
        session = LanguageModelSession(instructions: instructions)
        self.limits = limits
        configureTranscriptErrorHandling()
    }

    func replaceSession(transcript: Transcript) {
        session = LanguageModelSession(transcript: transcript)
        configureTranscriptErrorHandling()
    }

    private func configureTranscriptErrorHandling() {
        #if compiler(>=6.4)
        if #available(iOS 27.0, *) {
            session.transcriptErrorHandlingPolicy = .revertTranscript
        }
        #endif
    }
}
