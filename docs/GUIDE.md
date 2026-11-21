# Bolt — educational study workspace

Bolt is a Windows app for personal study, research, and authorized practice. Its local **PDF and verified-answer tools** help you read documents, find relevant passages, and keep answers you explicitly verify. It uses a downloaded **local Ollama model**, with **no OpenAI/Claude key or paid AI API**. The ZIP includes the PDF-reading dependencies. Account and activity records remain separate from these study tools.

Optional browser automation can fill and submit activity answers, including randomized responses and unverified guesses when enabled. Those capabilities do not imply permission to use them on a particular activity or website.

## Educational-use disclaimer

**Bolt is intended for educational purposes only. It is not approved or endorsed for cheating, causing harm, or other misuse.** Appropriate uses include personal study, understanding source material, reviewing your own documents, and practice or automation you have permission to perform.

- Do not use Bolt to cheat on tests, exams, graded assignments, or any activity where AI assistance or automation is prohibited. Do not present generated work as your own when that would violate the applicable rules.
- Do not use it to harm, harass, deceive, impersonate others, commit fraud, fabricate participation, manipulate rewards, or access accounts or content without authorization.
- Follow your school or organization's academic-integrity policies, each connected site's terms, and applicable laws. Use only accounts and materials you are authorized to access. Do not bypass access restrictions, account suspensions, or verification requirements.
- Review generated answers and their sources. AI output and automated actions can be incorrect; random responses and guesses do not establish knowledge or reflect your genuine opinions.

Bolt is independent software and is not affiliated with, sponsored by, or endorsed by connected educational platforms. Users are responsible for obtaining permission and for how they use the app. This disclaimer does not grant permission, override any rules, or prevent consequences for misuse.

## Start

For a ready-to-run Windows x64 copy, extract the complete **releases/Bolt.zip** package and double-click **Start Bolt.cmd** inside its **Bolt** folder. Node.js and PDF-reading dependencies are included; you do not need npm or a separate Node installation. Keep the launcher, tools, and resources folders together. The package's own README is a short quick-start guide.

Google Chrome (preferred) or Brave is required for the interface and activity browser. The launcher explains if neither is available. Install [Ollama for Windows](https://ollama.com/download/windows) once for local AI; the launcher starts an installed Ollama service when possible. If the service or a model is missing, **Finish setup** appears in the app with **Get Ollama**, **Check again**, **Download model**, and **Model settings** as appropriate. Choose Download model to fetch the default qwen3:4b model (about 2.5 GB), or choose an already-downloaded local model in Settings. No model download begins automatically. Cloud models remain disabled.

The interface opens centered at up to 1080 × 740 and adapts to smaller screens. The activity browser opens maximized. The local app address is [http://127.0.0.1:43117](http://127.0.0.1:43117). Opening the launcher again reconnects to a running Bolt instance.

In the clean package, application files and dependencies are grouped under **resources/**, and private data is created in **resources/.app-runtime/**. In the development checkout, source stays under **app/** and **extension/** and existing private data stays in **.app-runtime/**. Runtime paths later in this guide are relative to that resource root. The ZIP excludes all saved logins, accounts, progress, PDFs, logs, and browser profiles.

For a source checkout, use Windows with Node.js 22.13+ on the 22 LTS branch, or Node.js 24+, and run `npm ci --ignore-scripts` once. The development launcher also prefers **tools/runtime/node.exe** when present. Ollama, the model, and a compatible browser remain separate prerequisites. See [the quick-start README](../README.md).

## PDFs & saved answers

1. Open **Settings → PDFs & saved answers**. These local tools do not require a connected-site account.
2. Under **Your PDFs**, choose **Import PDF**. Readable PDFs up to 8 MB and 200 pages are supported. Text extraction preserves page numbers. Image-only scans need OCR before import; locked PDFs must be unlocked first.
3. Check the documents you want to use and type a question. **Find passages** uses BM25 keyword retrieval followed by local Ollama reranking. If AI reranking is unavailable, the app clearly labels the keyword-only fallback.
4. **Find an answer** checks for an exact previously verified question with the same document selection, otherwise asks the local model using the relevant passages. Source quotes are checked against the extracted text and shown with page references. Answers can still be incorrect; review the evidence.
5. Edit the answer if needed, check **I checked this answer and confirm it is correct**, then **Save as verified**. Generated answers are never automatically added to this database. Verified entries persist across restarts and can be searched, opened, updated, and deleted. Matching preserves numbers, operators, and negations. Removing a PDF removes answers linked to it.

Study text, excerpts, and verified answers are stored locally in `.app-runtime/study.json`. Uploaded PDF bytes are processed in a bounded worker; the original PDF is not retained. The ZIP excludes this library and other runtime data. PDF extraction and AI requests use local resources; no document text is sent to a hosted model.

**Manual research browser** opens an independent source website you specify. With optional-cookie rejection enabled, it chooses explicit **Reject all**, **Decline**, or **Necessary/Essential only** choices when available. It does not choose Accept, click unrelated Decline buttons, or modify ambiguous preference panels. Unsupported banners, including some embedded-frame banners, need manual handling. Browsing remains manual, and this browser does not access your activity account or submit quizzes.

## Choose a login and activity

1. Open **Accounts**, choose **Add account**, and enter its email/password once. Keep **Save this login on this PC** checked and click **Save & sign in**.
2. Add as many account profiles as you need. Use the sidebar's **Switch account** selector or a saved account's **Switch to account** button; passwords do not need to be typed each time. Saved sessions are restored first, with the saved password used if re-login is needed.
3. Open **Auto Bot** and select **Daily Quiz** or **Modules**. For Modules, **check the practice modules you are authorized to automate**. Search by title/course, use **Select visible** for bulk selection, or uncheck individual modules. Completed modules are hidden by default and cannot be queued again accidentally.
4. Click **Start**. Selected modules run one after another through all remaining questions and surveys. Progress, selections, and completions are saved separately for each account.

The sidebar separates **Auto Bot**, **Accounts**, **History**, and **Settings**. **History** shows completed activities and those needing attention. Module progress is also refreshed from the connected site when signing in or clicking Refresh. Accounts run one at a time in isolated browser sessions.

The sidebar normally shows icons only. Hover to slide it open; moving away collapses it again. Keyboard focus reveals the labels too. On touchscreens, tap the bolt logo to open it and tap outside to close it. Expansion overlays the page so the content stays in place. While open, a logo-colored gradient fades into the bottom of the dark sidebar and the workspace behind it dims. Hovering away or closing the sidebar fades both effects out. The overlay does not block workspace clicks, and reduced-motion and high-contrast settings are respected.

An existing account can be saved without knowing its password using **Save current signed-in account**. That saves its encrypted session; use **Add password** on the profile to enable automatic re-login after the session expires. **Remove** deletes a saved profile without deleting the account on the connected site.

- **Stop** cancels research/generation and prevents later quiz actions.
- A first-launch **Quick tour** points out accounts, activity selection, timing, survey modes, automation choices, saving settings, and progress. Use Back, Skip, or Escape anytime; completed or skipped tours stay dismissed. Replay it from **Quick tour** in the top bar or **Show me around** in Settings. The introduction waits while automation is busy, never changes preferences, and never starts a run. Each spotlight targets a specific control; the card stays separate from it, and its navigation remains visible in compact windows. The sidebar stays collapsed during the tour so it does not cover the highlighted page.
- The interface uses a solid dark charcoal main background, neutral glass panels, and flat button fills. Page switches, slider thumbs, activity selection, and supported dropdown menus have short, smooth transitions. The logo is served with a transparent background. Reduced-motion and reduced-transparency preferences are respected; blur does not animate.
- **Resume remaining queue** continues the current question and the rest of a stopped queue.
- If the connected site expires a session during a run, the app signs back into the same saved account and reopens the interrupted module. A saved password is required for unattended sign-in. Accepted answers remain on the site, and completed modules are retained. Repeated logouts, rejected credentials, or verification pause the entire remaining queue instead of failing each pending module.
- The queue is checkpointed after each submitted answer and when an activity pauses or completes. An expired session is shown as disconnected and is not saved over a verified session.
- A disabled/suspended-account notice stops automatic sign-in attempts and preserves the unfinished queue. Resolve the account restriction with the site operator before signing in manually and resuming.
- **Show browser** brings the automation browser forward for an interactive step.
- The activity browser opens maximized. The bot shows a visible cursor inside its browser. It follows smooth curved paths with gradual acceleration and slowing, then sends browser mouse press/release events for sign-in, Research, answer choices, Submit, and Next. Your Windows pointer stays available for other work. Targets are scrolled into view and checked again before pressing; moved or covered controls trigger automatic recovery. **Stop** cancels movement and releases a held button away from the target.
- The bot activates its target browser tab before moving and clicking, and brings the Research tab forward before its thinking cooldown. This prevents headed Chrome from stalling mouse input on an inactive tab. The automation browser can come to the foreground during these actions.
- The automation browser keeps processing input and layout updates when another window covers it, so background-window throttling does not stall mouse actions.
- The mouse aims at visible answer text and avoids scrolling controls that are already clickable. It rechecks the target after movement and quiz validation, then follows any layout shift before pressing. A nearby blank part of the page is not treated as a popup merely because the answer moved.
- Before pressing, the bot checks trusted mouse events from Chrome to verify where the cursor actually landed. Coordinate offsets or scaling trigger movement-only calibration, followed by another target check. Unverified mouse positions stop the action with a coordinate error instead of clicking an answer when Research was intended.
- Earned-badge popups such as **Level 1 Researcher!** are automatically dismissed with their normal X control. The site records the badge as seen, the bot waits for the popup to close, and an action blocked by a newly appearing badge is retried with the mouse.
- **Check browser sign-in** confirms a login you finished manually after verification.
- **Quit** stops the local server and closes the automation browser. Closing only the app window leaves the server running; the launcher reconnects to it.

## How local answers work

The app reads each question and its linked research webpages, including the connected site's encoded Research buttons. It opens the normal research page in the account's browser context, reads the rendered source, and closes the research tab. That text goes to Ollama at `http://127.0.0.1:11434`. Ollama returns a structured answer with valid choice IDs, an explanation, and quoted supporting evidence. The app verifies that the quote exists in the source before using the answer. Sources and explanations appear in the activity log. Hidden form fields are excluded from question prompts.

No hosted AI service or paid web-search API is used. Internet access is still needed for the connected site, research pages, and the initial model download. Inference uses your computer's hardware. Smaller models can be slower or less accurate on difficult questions; confidence is the model's estimate, not a guarantee.

After each question, the bot answers awareness and interest surveys, then clicks **Next Question**. In **Settings → Run preferences → Survey answers**, choose **No / lowest interest** (the default) or **Random responses**. Random mode chooses from the displayed Yes/No choices and meaningful interest ratings, excluding N/A placeholders. The mode is saved and does not use the model. Turn off **Answer survey questions automatically** to handle them manually.

Personal questions use a random displayed choice when **Random answers for opinion questions** is enabled; disabling that setting restores manual personal answers. With **Guess when stuck** enabled, unresolved factual questions use an explicitly unverified guess after bounded recovery attempts. If guessing is disabled, the affected module is marked **Needs attention** and the queue proceeds to other selected modules. Session-wide problems, including verification/CAPTCHA and unsuccessful automatic sign-in, pause the remaining queue intact. Resume can retry unfinished items. Stopping a run pauses the remaining queue.

Questions that mention your interests as background, or ask you to think about a factual classification, are not automatically treated as opinions. Opinion responses and fallback guesses still perform the required Research visit when a research link is present, before the thinking cooldown and filling. This lets the site enable Submit normally. A page-disabled Submit control is reported as disabled rather than as covered by a popup.

Blocked or moving answer controls recover automatically: the mouse uses a visible associated label or an exposed part of the control, closes recognized achievement popups, and retries temporary blockers for up to about six seconds. Each retry checks the original question and selections. If controls remain stuck, the activity refreshes once and resumes from the site's saved progress. Persistent blockers still save the module as **Needs attention** instead of looping indefinitely. Stop cancels recovery.

Extra fail-safes confirm that each answer selection actually registered, allowing up to 1.5 seconds for delayed custom controls. Before Submit or Next, the app revalidates the question and selections and waits for the control to become enabled. A still-locked Submit gets one normal Research revisit and restores the same chosen answers if the page cleared them. The app never force-enables controls. A changed question cancels the old action.

If a Submit or Next response is interrupted, the app scans for confirmed advancement before continuing and does not replay the click. Blank loading screens do not count as confirmation. Transient initial scan errors get two retries. A page that remains blank or does not advance within 15 seconds can refresh once per module and resume the site's saved progress. Repeated failures preserve the unfinished queue, and Stop or account verification interrupts recovery.

The app automatically handles common recoverable issues: it maps A-and-B responses to the explicit **Both A & B** choice, repairs invalid model responses with up to two additional attempts, and rescans loading pages for up to 15 seconds. Research-button bonus text and scroll-position changes do not change a question's identity. Native completion wording such as **You have completed all the questions for this module** is recognized as success. These recoveries do not require pressing Continue. Format retries reuse the already-read sources; evidence or confidence failures trigger one fresh research pass that expands article disclosures and rereads the page. Recovery retries retain the evidence/confidence requirements; the separately labeled guess fallback can then proceed when enabled. An unchanged question is never resubmitted.

Research reading includes collapsed accordions, tabs, and details sections. Sections matching the question's hint are prioritized, so a hint such as **How I affect people’s lives** leads to that section's actual content instead of only its heading. The fresh research pass also handles content loaded after opening a disclosure. Unrelated navigation and account controls are excluded.

True/False questions with extra **N/A** placeholders are treated as a single True/False choice, including pages styled with checkboxes. The model receives only True and False, with their original page IDs; placeholders cannot be submitted. For these questions it explains the evidence before selecting the answer and explicitly checks negations and qualifiers. Other question types keep their normal choices.

## Run settings

**Cross-check factual answers against sources** is on by default in Bolt. A second local AI pass independently answers the same question from its source excerpts without seeing the first answer. Both passes must choose the same options and provide exact source quotes; the second pass must report full support, and the lower of the two confidence estimates is used. Disagreement triggers bounded repair with the specific points of disagreement and one fresh source read. If evidence or agreement remains insufficient, the activity is left for review when guessing is off. The shared legacy extension keeps its existing single-pass default unless explicitly configured.

Cross-checking uses extra model time and is a second pass from the same model, not an external fact-check or a correctness guarantee. Confidence is a model estimate, not measured accuracy. **Run progress** separates cross-checked factual answers, guesses, and activities needing review, using the recent event history. These counters do not report the site's actual correct/incorrect scores. Answer details show the exact source quote and a foldout for the second check. Long queue errors are expandable.

The research reader prioritizes relevant prompt terms, numbers, and source sections, including focused disclosure panels on the first read. Quotes can be copied from any cited source excerpt rather than a small fixed list of candidate sentences. Factual blanks, numeric tasks, and final factual questions remain factual even when the introduction asks whether you like a career. Random opinion answers are reserved for personal questions; model-identified opinions still pass the factual-task checks.

Settings offers a larger already-installed model when one is available. Selecting it is optional, saves your model preference, and may require more memory and time. It does not download a new model.

Open the **Settings** tab to change the local model, survey preferences, and minimum confidence. Specific activity links and page selectors are under **Advanced page controls**. Only loopback HTTP inference addresses are accepted.

**Random answers for opinion questions** is enabled in the local app. Recognized opinion wording gets a random displayed choice immediately, and a model result identifying a question as personal also uses a random choice. These entries are labeled **random opinion response**, with zero evidence confidence and no claim to reflect your actual preference. Existing **No / 1 – Not Interesting** survey presets take priority when enabled. This works independently of **Guess when stuck**. Review mode fills the choice without submitting it; Stop and stale-page checks still apply. Contact/marketing consent is handled manually. The shared runner/API requires `randomOpinions: true` explicitly.

**Guess when stuck** is off by default in the local app. Existing settings without the new cross-check option are upgraded to guesses off with a minimum 90% model-confidence threshold; your other saved settings are retained. You can explicitly re-enable guesses in Run preferences. Normal research and verification run first. After recovery attempts fail, or research/answer generation reaches its limit (180 seconds with cross-checking, 90 seconds without it), the bot reuses a structurally valid low-confidence answer or asks the local model for an unverified best guess. That extra model call has a 20-second limit. If the model is unavailable or still cannot return a valid choice, the bot randomly selects one valid displayed option. True/False N/A placeholders are excluded. Guesses are labeled **unverified guess** or **unverified random guess**, retain their actual confidence, and are not added to the verified-answer library. Minimum confidence applies to verified answers, while this explicit fallback permits guesses below it. **Submit answers automatically** still controls submission; review mode only fills the guess. Stop, session failures, CAPTCHA, stale-page checks, and navigation errors do not trigger guessing. Personal questions follow the separate opinion setting. The API/shared runner defaults to guessing disabled unless its settings explicitly enable it.

**Answer speed** is a 0–30 second minimum delay starting after Research opens. Source loading, reading, and local AI generation run during that delay. Answers are filled when both the delay and the answer are ready, so model time is not automatically added after the full delay. A slower website or model can still take longer. The delay runs once per question page, including repairs and a required Research recheck. Surveys have no research page, so they start their delay before filling. Manual review mode uses the same timing. **Fastest** (the default) adds no pause. Save the setting to keep it across restarts; changes apply on **Start** or **Resume remaining queue**, and **Stop** cancels the timer and pending actions.

The normal path uses shorter curved mouse movements and checks ready pages immediately. Mouse motion accounts for browser-command time instead of adding a full animation wait on top of it. Safety checks still run, but repeated readiness scans are combined. Polling backs off only while the page is actually loading or blocked. In the controlled local question-plus-survey timing fixture, a one-second selected delay took about 2.4 seconds overall versus 5.8 seconds before this optimization; real site and model times vary.

**Interest question cooldown** is a separate 0–30 second slider, defaulting to **No pause**. Interest questions and combined awareness/interest survey pages use this pause before filling, in place of Answer speed. Awareness-only pages keep their existing Answer speed pause. A form mixing factual and interest questions uses the research pause and then the interest pause before filling. The setting is saved independently and applies to preset or randomized interest answers. **Stop** cancels it immediately.

Uncheck **Submit answers automatically** to fill the current page for review. Paste a specific quiz/module URL from the connected site into **Activity link** if automatic navigation cannot find it. Advanced CSS selectors adapt the question and navigation controls to a different page layout.

## Account handling

Saved passwords and sessions are encrypted with **Windows DPAPI, CurrentUser scope**, in `.app-runtime/accounts.json`. They can be decrypted only in the same Windows user context. Secrets travel through the encryption helper's stdin, never its command-line arguments, and plaintext passwords/cookies are not written to files, logs, browser local storage, or the app's state API. Uncheck **Save this login on this PC** for a one-time login. See [Microsoft's data-protection documentation](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope).

Each account uses an isolated browser process and off-the-record context. Switching accounts refreshes its saved session, closes the previous browser, and removes the temporary browser profile. The app does not use your everyday browser cookies. The app window has its own profile for nonsecret preferences.

**Chrome’s normal privacy defaults are restored.** Custom tracker/request blocking, forced third-party cookie restrictions, blanket site-permission denial, and the extra WebRTC restriction are disabled. Pages and popups are no longer paused for privacy setup. Chrome uses its own normal cookie settings and permission prompts; its private-window defaults may still restrict third-party cookies. Chrome selection, separate account sessions, temporary profiles, encrypted saved logins, and background-networking/sync restrictions remain. No custom `DNT` or `Sec-GPC` headers are added by default.

The bot leaves cookie consent panels to you in compatibility mode. The manual research tool’s **Decline optional cookies** checkbox is off by default; enable it explicitly if wanted. To restore the stronger controls later, set `CHATTERHIGH_STRICT_PRIVACY=1` before launching the app. That opt-in mode blocks the built-in tracker host list and third-party cookies, denies site permissions, restricts non-proxied WebRTC UDP, and clicks explicit **Reject all**, **Decline**, or **Necessary/Essential only** choices. It pauses new targets until privacy setup finishes and stops on unsupported controls. Ambiguous consent panels always require manual handling.

These controls reduce tracking; they do not make signed-in use anonymous. The website still sees your IP address, browser characteristics, account identity, and quiz/activity requests. This built-in host list is intentionally bounded and cannot block all tracking or first-party analytics. Chrome's own explanation of [Incognito limits](https://support.google.com/chrome/answer/95464) applies. Brave can provide its own additional [Shields protections](https://brave.com/shields/); set `CHATTERHIGH_BROWSER` to its executable to select it explicitly. Browser discovery otherwise prefers installed Chrome, then Brave.

Module selections, queue state, and completion history are saved per account in `.app-runtime/progress.json`. They are reconciled with the connected site's answered/total progress, so a reset or changed module is not incorrectly skipped. The ZIP contains no saved accounts, browser profiles, or activity history.

Question text and research sources go to local Ollama. Login credentials are used only on the connected site. The app binds to `127.0.0.1`, validates Host/Origin headers, and protects its API with a random session token.

## Verification and limits

The real public sign-in page was checked: its visible `user[email]` and `user[password]` fields are detected. Automated browser tests cover login, account isolation, Daily Quiz, module selection, stopping, resuming, and the standalone interface using simulated accounts and a simulated solver. The downloaded `qwen3:4b` model also passed a real local-inference test against a controlled question and source excerpt.

The signed-in catalog was verified against the real site and returned 188 modules. The current question's normal Research button was verified to open its rendered source page. Tests also cover all 25 questions in a simulated activity, survey completion, catalog loading errors, and the simplified dark interface. **A complete live quiz/module run and overall answer accuracy have not been verified.** The app may need an activity URL or selectors for other layouts.

## Development

Run the commands below from the project root. Build a clean distribution with `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Build-Bolt.ps1` (or `npm run package:windows`). The builder includes the bundled runtime and dependency license notices and writes **releases/Bolt.zip**, a SHA-256 checksum, and an internal file manifest. Older builds remain in **releases/previous/**. Tests and backups are kept out of the distribution. Test the built package with `node tests/package-smoke.cjs`.

```text
node app/server.cjs --open
node --test tests/*.test.cjs
node tests/app-browser.cjs
node tests/run-browser.cjs
node tests/check-public-login.cjs
node tests/local-model-smoke.cjs
node tests/research-browser.cjs
node tests/mouse-browser.cjs
node tests/achievement-browser.cjs
node tests/recovery-browser.cjs
node tests/recovery-browser.cjs --headed
node tests/precision-browser.cjs
node tests/precision-browser.cjs --headed
node tests/calibration-browser.cjs
node tests/calibration-browser.cjs --headed
node tests/research-required-browser.cjs
node tests/research-required-browser.cjs --headed
node tests/failsafe-browser.cjs
node tests/failsafe-browser.cjs --headed
node tests/speed-browser.cjs
node tests/tour-browser.cjs
node tests/accuracy-model-smoke.cjs
node tests/privacy-browser.cjs
node tests/privacy-browser.cjs --compatible
node tests/session-browser.cjs
node tests/study-browser.cjs
node tests/study-model-smoke.cjs
```

Most tests use simulated local-model responses and fake credentials. `check-public-login.cjs` only reads field names from the public sign-in page; `local-model-smoke.cjs` runs an actual local Ollama generation against controlled source text. `privacy-browser.cjs` uses local mock trackers to verify cookie/request blocking. Set `CHATTERHIGH_BROWSER` to select a Chrome/Brave executable.

Source: `app/server.cjs` serves the app; `manager.cjs` manages accounts and runs; `browser.cjs` drives the browser; `activities.cjs` discovers activities; `ollama.cjs` runs local inference; `sources.cjs` reads research pages; `app/public/` contains the interface. The original quiz engine is reused from `extension/core.js`, `runner.js`, and `content.js`. The app does not install or load the extension. Its earlier implementation remains separately in `extension/`.

The local inference integration follows [Ollama's Chat API](https://docs.ollama.com/api/chat), [model-list API](https://docs.ollama.com/api/tags), and [structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs).
