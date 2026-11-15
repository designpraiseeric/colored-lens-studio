// Apple Intelligence without image input (built against an SDK that predates image attachments): the model works
// from Colored Lens's measurements of the frame only.
import Foundation
import CoreGraphics
import FoundationModels
import Vision

@available(macOS 26.0, *)
@Generable struct CLPick {
  @Guide(description: "A recipe id copied exactly from the RECIPES list") var recipe: String
  @Guide(description: "One sentence on why this recipe fits") var why: String
}
@available(macOS 26.0, *)
@Generable struct CLReply {
  @Guide(description: "What the measurements say about the picture") var sees: String
  @Guide(description: "What the colour is doing for this moment") var reading: String
  @Guide(description: "A short direct answer to the editor's message; empty if there was none") var reply: String
  @Guide(description: "At most two short questions for the editor") var questions: [String]
  @Guide(description: "Up to two feeling ids from ANSWER IDS") var feeling: [String]
  @Guide(description: "Two to four picks from the RECIPES list") var picks: [CLPick]
}

/** What the Mac's own vision can say about the frame: scene and object labels, and how many faces. */
func describe(_ image: CGImage) -> String {
  let classify = VNClassifyImageRequest(), faces = VNDetectFaceRectanglesRequest()
  try? VNImageRequestHandler(cgImage: image, options: [:]).perform([classify, faces])
  let labels = (classify.results ?? []).filter { $0.confidence > 0.25 }.prefix(12).map { "\($0.identifier.replacingOccurrences(of: "_", with: " ")) (\(Int($0.confidence * 100))%)" }
  let n = faces.results?.count ?? 0
  return "WHAT THE MAC'S VISION FINDS IN THE FRAME: " + (labels.isEmpty ? "nothing it can name" : labels.joined(separator: ", ")) + ". Faces found: \(n)."
}

enum AppleAI {
  static let variant = "apple-text"
  static func status() async -> [String: Any] {
    guard #available(macOS 26.0, *) else { return ["apple": ["available": false, "reason": "needsNewerMacOS"]] }
    switch SystemLanguageModel.default.availability {
    case .available: return ["apple": ["available": true, "image": false]]
    case .unavailable(let reason): return ["apple": ["available": false, "reason": String(describing: reason)]]
    @unknown default: return ["apple": ["available": false, "reason": "unknown"]]
    }
  }
  static func ask(system: String, prompt: String, image: CGImage?) async throws -> String {
    guard #available(macOS 26.0, *) else { throw NSError(domain: "ColoredLens", code: 1, userInfo: [NSLocalizedDescriptionKey: "needsNewerMacOS"]) }
    let session = LanguageModelSession(instructions: system + "\nYou cannot see the picture itself in this version: rely on MEASUREMENTS and on what the Mac's vision finds.")
    let r = try await session.respond(to: prompt + (image.map { "\n" + describe($0) } ?? ""), generating: CLReply.self).content
    let obj: [String: Any] = ["sees": r.sees, "reading": r.reading, "reply": r.reply, "questions": r.questions, "answers": ["feeling": r.feeling],
      "picks": r.picks.map { ["recipe": $0.recipe, "why": $0.why] }]
    return String(data: try JSONSerialization.data(withJSONObject: obj), encoding: .utf8) ?? "{}"
  }
}
