// No Apple Intelligence in this build (Intel slice, or an SDK without Foundation Models): the helper still bridges
// the panel to models on this computer such as Ollama.
import Foundation
import CoreGraphics
enum AppleAI {
  static let variant = "bridge-only"
  static func status() async -> [String: Any] { ["apple": ["available": false, "reason": "notInThisBuild"]] }
  static func askPlain(system: String, prompt: String, image: CGImage?) async throws -> String { throw NSError(domain: "ColoredLens", code: 2, userInfo: [NSLocalizedDescriptionKey: "notInThisBuild"]) }
  static func ask(system: String, prompt: String, image: CGImage?) async throws -> String { throw NSError(domain: "ColoredLens", code: 2, userInfo: [NSLocalizedDescriptionKey: "notInThisBuild"]) }
}
