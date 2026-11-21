# Bolt

<p align="center"><img src="app/public/assets/bolt-transparent.png" alt="Bolt" width="144"></p>

A Windows workspace for personal study, PDF research, and authorized practice, powered by a local AI model.

Visit the **[Bolt website](https://bolt-automation.vercel.app)** for a product overview, downloads, [app usage terms](https://bolt-automation.vercel.app/usage-terms), and [website terms](https://bolt-automation.vercel.app/site-terms).

The promotional website lives in [`website/`](website/README.md). Preview it with `node tools/preview-website.cjs`; it is a separate static site, not the desktop app.

## Open Bolt

1. Download the **[Windows package](https://github.com/boltautomation/Bolt-Automation/releases/latest)** and extract it completely. Keep its folders together.
2. Open **Start Bolt.cmd** inside the extracted **Bolt** folder. You can also use the launcher beside this README for the development copy.
3. Install Chrome or Brave if needed. Follow **Finish setup** in the app to install [Ollama for Windows](https://ollama.com/download/windows) once, then use **Download model** in the app. The default model download is about 2.5 GB.

The Windows x64 package includes Node.js and the PDF dependencies. No terminal commands, Node installation, or npm setup are needed to run that package. Chrome/Brave, Ollama, and the AI model are separate. An installed Ollama service starts automatically when possible. Internet access is needed for initial downloads and online research; local PDFs and downloaded models stay on your computer.

## Accuracy and review

Bolt defaults to two source-based answer passes and **guesses off**. The passes must agree, quote actual source text, and meet the model-confidence threshold. Unresolved questions stay available for review. The interface separates cross-checks, guesses, and review items; none of these is a measured correctness score. AI can still be wrong. Settings lets you select a larger already-installed model if you want to try one.

## Educational-use disclaimer

**Bolt is intended for educational purposes only. It is not approved or endorsed for cheating, causing harm, or other misuse.**

Use it only for personal learning and activities you are authorized to automate. Do not use it to cheat on assessments, fabricate participation, manipulate rewards, harm or harass others, commit fraud, impersonate anyone, or access accounts or content without permission. Follow school policies, connected-site terms, and applicable laws. Review AI answers and sources; generated output, guesses, and automated actions can be wrong.

Bolt is independent software and is not affiliated with or endorsed by connected educational platforms. This disclaimer does not grant permission, override rules, or prevent consequences for misuse.

## Where things live

| Folder | Contents |
| --- | --- |
| `releases/` | Local package-builder output. Download published packages from [GitHub Releases](https://github.com/boltautomation/Bolt-Automation/releases/latest). |
| `docs/` | [Full guide](docs/GUIDE.md), including settings, privacy, and limitations. |
| `tools/` | Launcher, package builder, and bundled runtime for this development copy. |
| `app/` | App source and interface. |
| `website/` | Responsive promo site and its Vercel configuration. |
| `extension/` | Shared quiz engine and the earlier browser-extension source. |
| `tests/` | Development checks. |
| `archives/` | Older logo backups. |

The clean package groups the application, engine, dependencies, and runtime under **resources/**. Its saved accounts, progress, and PDF library are created in **resources/.app-runtime/**. The development copy keeps its existing **.app-runtime/** folder. Neither private data folder is included in the ZIP.

For updates, extract into a new folder and keep your existing copy until you have finished any active work. Saved logins are protected for your Windows user and are not portable to another Windows account. See the full guide before moving private data.

## Development

Run `npm test` for unit tests. Build a fresh Windows x64 package with `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Build-Bolt.ps1`. The builder uses the bundled runtime and installed dependencies; see [the full guide](docs/GUIDE.md) for source-checkout setup and browser tests.
