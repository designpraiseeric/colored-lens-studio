# Releasing and updates

## Two kinds of update

| | What changes | How it reaches people | What you do |
|---|---|---|---|
| **Content** | Encyclopedia text, reference frames, Lukuluku looks and LUTs | Silently. The panel checks `content/manifest.json` on GitHub Pages each time it opens and downloads only what changed. Works offline afterwards. | Push to `chroma-encyclopedia` or `lukuluku` as usual. The *Live content* workflow picks it up within 6 hours (instantly with the dispatch below). |
| **Code** | Panels, the Look Engine effect, installers | The panel shows *“Colored Lens x.y.z is available → Install update”*. One click downloads the installer from GitHub Releases and opens it. | Bump `version` in `package.json`, add a `## x.y.z` block to `RELEASE_NOTES.md`, push to `main`. |

## Shipping a code update
1. `npm version patch --no-git-tag-version` (or `minor`), and write the notes under `## <new version>` in `RELEASE_NOTES.md`.
2. Push to `main`. The **Release** workflow builds the macOS `.pkg`, the Windows `.exe` and the Premiere `.ccx`, and publishes the GitHub Release.
3. When it finishes, **Live content** runs and updates `version.json`. From then on every installed panel offers the update.

`version.json` only ever names a release whose files already exist, so nobody is offered an update that is still building.

## Instant content updates (optional)
Add this workflow to `chroma-encyclopedia` and `lukuluku` (`.github/workflows/notify-colored-lens.yml`), and add a
fine-grained token with *Actions: write* on `colored-lens-studio` as the secret `COLORED_LENS_DISPATCH`:

```yaml
name: Tell Colored Lens Studio
on: { push: { branches: [main] } }
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - run: gh api repos/designpraiseeric/colored-lens-studio/dispatches -f event_type=content-updated
        env: { GH_TOKEN: '${{ secrets.COLORED_LENS_DISPATCH }}' }
```

## Secrets (all optional)
| Secret | Turns on |
|---|---|
| `AE_SDK_ZIP_URL` | The Premiere Pro effect. A direct download link to the After Effects SDK zip (download it free from Adobe with your login; keep the link private, as Adobe's licence does not allow redistributing it). Without it, releases ship the Resolve effect and both panels; Premiere users get looks through Lumetri `.cube` files. |
| `MAC_APP_IDENTITY`, `MAC_INSTALLER_IDENTITY`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | Signed and notarized macOS installer (Apple Developer account, $99/year). Without them the installer is unsigned. |

## Unsigned installers: what people see
- **macOS, first install** (downloaded in a browser): *“can't be opened because it is from an unidentified developer”*. Right-click the `.pkg` → **Open** → **Open**.
- **macOS, updates from the panel**: the panel downloads the installer itself, so macOS does not quarantine it and this warning should not appear. Confirm on your Mac with the first update.
- **Windows**: SmartScreen shows *“Windows protected your PC”* → **More info** → **Run anyway**.
- **Premiere panel**: Creative Cloud warns that the plugin is not from the Marketplace. That stays even with signing; only a Marketplace listing removes it.
