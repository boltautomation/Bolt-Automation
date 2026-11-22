# Bolt tools

- **Start-Bolt.sh** powers **Start Bolt.command** on macOS, preferring the bundled runtime, checking Chrome/Brave and PDF tools, starting installed Ollama, and reconnecting to Bolt. `--check` validates prerequisites without starting services.
- **Build-Bolt-Mac.cjs** packages the current Mac architecture as **Bolt-v2-hemlock-macOS-arm64.zip** or **Bolt-v2-hemlock-macOS-x64.zip**, preserving executable permissions and including Node and PDF dependencies. The **Build macOS packages** Actions workflow runs builds and native smoke checks for both architectures.

- **Start-Bolt.ps1** powers the top-level **Start Bolt.cmd** launcher. It detects development and clean-package layouts, prefers the bundled runtime, checks PDF dependencies and Chrome/Brave, starts an installed Ollama service when needed, and reconnects to an existing app. `-CheckOnly` checks prerequisites without opening windows or starting services.
- **Build-Bolt.ps1** builds **releases/Bolt-v2-hemlock-Windows-x64.zip** and its checksum. It stages an explicit set of application files, the shared engine, dependency folders, documentation, and runtime. Private data, browser profiles, logs, tests, backups, and older builds are excluded. Every shipped file is listed with its SHA-256 hash in **package-manifest.json**.
- **runtime/** contains the portable Windows x64 Node runtime used by this checkout and by the package builder. Its license notices travel with the package. Chrome, Ollama, and model files are not bundled.

Run the scripts from the project root. The builder only writes staging/output folders inside this project and removes only its own temporary staging paths.
