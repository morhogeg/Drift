import AppIntents
import UIKit

@available(iOS 16.0, *)
struct AskDriftIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Drift"
    static var description = IntentDescription("Ask Drift about selected text")

    // This parameter receives the selected text from the system
    @Parameter(title: "Text", description: "The selected text to ask Drift about")
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Drift about \(\.$text)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "drift://ask?text=\(encoded)") {
            UIApplication.shared.open(url)
        }
        return .result()
    }
}
