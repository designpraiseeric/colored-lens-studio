// Apple Intelligence with image input (Foundation Models, image attachments).
import Foundation
import CoreGraphics
import FoundationModels

@available(macOS 27.0, *)
@Generable struct CLPick {
  @Guide(description: "A recipe id copied exactly from the RECIPES list") var recipe: String
  @Guide(description: "One sentence, tied to what is in this frame, on why this recipe fits") var why: String
}
@available(macOS 27.0, *)
@Generable struct CLReply {
  @Guide(description: "One or two sentences on what is in the picture") var sees: String
  @Guide(description: "What the colour is doing for this moment") var reading: String
  @Guide(description: "A short direct answer to the editor's message; empty if there was none") var reply: String
  @Guide(description: "At most two short questions for the editor; empty if the purpose is clear") var questions: [String]
  @Guide(description: "Up to two feeling ids from ANSWER IDS that fit the picture") var feeling: [String]
  @Guide(description: "Two to four picks from the RECIPES list") var picks: [CLPick]
}

enum AppleAI {
  static let variant = "apple-image"
  static func status() async -> [String: Any] {
    guard #available(macOS 27.0, *) else { return ["apple": ["available": false, "reason": "needsNewerMacOS"]] }
    switch SystemLanguageModel.default.availability {
    case .available: return ["apple": ["available": true, "image": true]]
    case .unavailable(let reason): return ["apple": ["available": false, "reason": String(describing: reason)]]
    @unknown default: return ["apple": ["available": false, "reason": "unknown"]]
    }
  }
  static func ask(system: String, prompt: String, image: CGImage?) async throws -> String {
    guard #available(macOS 27.0, *) else { throw NSError(domain: "ColoredLens", code: 1, userInfo: [NSLocalizedDescriptionKey: "needsNewerMacOS"]) }
    let session = LanguageModelSession(instructions: system)
    let r: CLReply
    if let image { r = try await session.respond(generating: CLReply.self) { prompt; Attachment(image) }.content }
    else { r = try await session.respond(to: prompt, generating: CLReply.self).content }
    let obj: [String: Any] = ["sees": r.sees, "reading": r.reading, "reply": r.reply, "questions": r.questions, "answers": ["feeling": r.feeling],
      "picks": r.picks.map { ["recipe": $0.recipe, "why": $0.why] }]
    return String(data: try JSONSerialization.data(withJSONObject: obj), encoding: .utf8) ?? "{}"
  }
}
