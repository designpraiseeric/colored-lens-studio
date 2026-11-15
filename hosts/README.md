# Hosts

The panel (`ui/app.js`) and everything in `core/` know nothing about Premiere or Resolve. Each host supplies one
object with the members below; `startApp(host, rootElement)` does the rest.

| Member | What it does | Premiere (`premiere/host.js`) | Resolve (`resolve/main.js` + `renderer.js`) | Web (`web/host.js`) |
|---|---|---|---|---|
| `name`, `label`, `version`, `os` | identity, shown in the panel and used by the updater | UXP | from `package.json` | from `package.json` |
| `fetch(url)` | network | UXP `fetch` | Chromium `fetch` | `fetch` |
| `readBundled(name, type)` | content shipped inside the plugin | plugin folder | plugin folder via IPC | `content/` |
| `cache.read / cache.write` | content downloaded from GitHub Pages | UXP data folder | Electron userData | localStorage |
| `grabFrame(seconds?)` | frame under the playhead (or at a time) as `{frame, seconds, timecode, clipName}` | `Exporter.exportSequenceFrame` → BMP | `Timeline.GrabStill` + `ExportStills` → BMP | file picker |
| `sequenceDuration()` | for scanning | `Sequence.getEndTime` | `GetEndFrame − GetStartFrame` | n/a |
| `addMarker / listMarkers` | color script shots, stored in the project | sequence markers (comment) | timeline markers (`customData`) | memory |
| `applyLook({params, look, makeCube})` | put the look on clips | adds/updates the **Lukuluku Look** effect on selected clips; `.cube` for Lumetri if the effect is missing | `.cube` → `SetLUT` on node 1 (Resolve's API cannot add OpenFX) | downloads the `.cube` |
| `saveFile(name, data)` | user-chosen location | `getFileForSaving` | save dialog | download |
| `openUrl(url)` | browser | `shell.openExternal` | `shell.openExternal` | `window.open` |
| `installUpdate(url, filename, onProgress)` | one-click update | download to temp + `shell.openPath` | download to temp + `shell.openPath` | opens the release page |

`test/hosts.test.mjs` runs the built Premiere panel and Resolve main process against mocks of these APIs.
