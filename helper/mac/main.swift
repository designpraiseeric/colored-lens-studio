// Colored Lens Helper (macOS). A small background agent that lets the Colored Lens panel reach things a Premiere
// panel cannot: Apple Intelligence (the on-device model), and models on this computer such as Ollama (Premiere
// blocks http:// on macOS). The panel and the helper talk through small JSON files in the user's own
// ~/Library/Application Support/ColoredLens/bridge folder: no network port is opened.
//   req-<id>.json  {type:"status"} | {type:"apple", system, prompt, imageB64} | {type:"http", method, url, headers, body}
//   res-<id>.json  the answer
import Foundation
import CoreGraphics
import ImageIO

let fm = FileManager.default
let bridge = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/ColoredLens/bridge", isDirectory: true)
try? fm.createDirectory(at: bridge, withIntermediateDirectories: true)

func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

func cgImage(fromBase64 b64: String?) -> CGImage? {
  guard let b64, let data = Data(base64Encoded: b64), let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

/** Requests to models on this computer only (Ollama, LM Studio, Foundry Local). */
func httpProxy(_ req: [String: Any]) async -> [String: Any] {
  guard let s = req["url"] as? String, let url = URL(string: s), let host = url.host, ["localhost", "127.0.0.1"].contains(host), url.scheme == "http" || url.scheme == "https"
  else { return ["error": "The helper only reaches addresses on this computer (localhost)."] }
  var r = URLRequest(url: url, timeoutInterval: 240); r.httpMethod = (req["method"] as? String) ?? "GET"
  for (k, v) in (req["headers"] as? [String: String]) ?? [:] { r.setValue(v, forHTTPHeaderField: k) }
  if let b = req["body"] as? String { r.httpBody = b.data(using: .utf8) }
  do { let (data, resp) = try await URLSession.shared.data(for: r)
    return ["status": (resp as? HTTPURLResponse)?.statusCode ?? 0, "text": String(data: data, encoding: .utf8) ?? ""]
  } catch { return ["status": 0, "text": "", "error": error.localizedDescription] }
}

func answer(_ req: [String: Any]) async -> [String: Any] {
  switch req["type"] as? String {
  case "status":
    var s = await AppleAI.status(); s["helper"] = helperVersion; s["variant"] = AppleAI.variant; return s
  case "apple":
    do { return ["text": try await AppleAI.ask(system: (req["system"] as? String) ?? "", prompt: (req["prompt"] as? String) ?? "", image: cgImage(fromBase64: req["imageB64"] as? String))] }
    catch { return ["error": String(describing: error)] }
  case "http": return await httpProxy(req)
  default: return ["error": "Unknown request"]
  }
}

@MainActor enum Work { static var busy = Set<String>() }
@MainActor func runLoop() async {
  log("Colored Lens Helper \(helperVersion) (\(AppleAI.variant)) watching \(bridge.path)")
  while true {
    let files = (try? fm.contentsOfDirectory(at: bridge, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
    for f in files {
      let name = f.lastPathComponent
      let age = -(((try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()).timeIntervalSinceNow)
      if age > 600 { try? fm.removeItem(at: f); continue } // leftovers
      guard name.hasPrefix("req-"), name.hasSuffix(".json"), !Work.busy.contains(name) else { continue }
      guard let data = try? Data(contentsOf: f), let req = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue } // still being written
      Work.busy.insert(name)
      let id = String(name.dropFirst(4).dropLast(5))
      Task { @MainActor in
        let res = await answer(req)
        let out = (try? JSONSerialization.data(withJSONObject: res)) ?? Data("{\"error\":\"could not encode the answer\"}".utf8)
        let tmp = bridge.appendingPathComponent("tmp-\(id).json"), dst = bridge.appendingPathComponent("res-\(id).json")
        try? out.write(to: tmp, options: .atomic); try? fm.moveItem(at: tmp, to: dst); try? fm.removeItem(at: f)
        Work.busy.remove(name)
      }
    }
    try? await Task.sleep(nanoseconds: 120_000_000)
  }
}
