# ChatterHigh Quiz Bot

A local Chrome / Edge extension that researches and answers factual questions in **Daily Quiz and Mindful Modules** using your signed-in ChatterHigh tab. No install script, Node packages, or server are required to use it.

## Install

1. In Edge, open `edge://extensions`. In Chrome, open `chrome://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select the `extension` folder in this project.
3. Open [ChatterHigh](https://chatterhigh.com/en/users/sign_in), sign in normally, and navigate into a Daily Quiz or Mindful Module **question**. Refresh that page once after installing the extension.
4. Click **ChatterHigh Quiz Bot** in your browser's Extensions menu. Its dashboard opens in a separate tab.
5. Select your quiz tab and enter an [OpenAI API key](https://platform.openai.com/api-keys) with API credit and access to the configured model. The default is `gpt-5.4-mini`; the model field is editable.
6. Click **Inspect page** to check that questions, choices, and the submit button are detected. This makes no API calls and changes no answers.
7. Click **Start bot**. Leave the dashboard open. Use **Stop** to cancel research and prevent further quiz actions.

For review mode, uncheck **Submit answers and continue automatically**. The bot fills the current page and stops before submitting it. To switch quiz types or modules, open the other quiz in the site and start again. The bot does not enroll in modules or choose modules for you.

## Behavior

- Reads the current question, answer labels, and research links from the rendered quiz page.
- Uses web search to research the answer, then a separate structured decision request to return only valid answer IDs. Both requests use the [Responses API](https://developers.openai.com/api/docs/guides/tools-web-search).
- Displays its explanation and clickable sources. Requires cited evidence and at least 85% model confidence by default; confidence is the model's estimate, not a guarantee of correctness.
- Supports radio questions, checkbox questions, and accessible custom radio/checkbox widgets. It fills all questions on a page before clicking one unambiguous submit button, then follows a single Next / Continue button.
- Stops at completion, its question limit, an unsupported page, an API error, ambiguous controls, personal questions, or a page that does not advance. It does not fabricate interest ratings or personal reflections; complete those yourself and restart.
- Rechecks the page before changing it, and tracks submitted pages to avoid repeatedly submitting an unchanged question. Each new run starts fresh.

## Data and cost

The API key is kept in extension-only browser **session memory**, cleared by browser restart, extension reload, or **Forget API key**. Only nonsecret settings are saved to disk. ChatterHigh credentials remain in your normal signed-in tab; the extension does not read passwords or cookies. No API keys are embedded in this project.

Question text, choices, research URLs, and research notes are sent to OpenAI. Requests set `store: false`. Each factual question normally uses **two model requests plus web search**, charged to your API account. Begin with a small question limit. Stopping cancels local requests; a request already processed may still be billed. Keep this personal extension local; a shared or published product should keep API credentials on a backend.

## If the quiz layout differs

The authenticated quiz DOM cannot be verified without a signed-in account. Automatic detection supports standard form controls, but a site update or custom layout may need the **Advanced page selectors**:

| Setting | What it should match |
| --- | --- |
| Question container | Each card containing one question prompt and its choices |
| Answer choices | The actual clickable radio, checkbox, or accessible custom choices inside each card |
| Submit button | Exactly one visible submit/check-answer control for the current page |
| Next button | Exactly one visible next-question/continue control |

Use browser developer tools to find the page's real CSS selectors; examples in the dashboard are illustrative. Custom controls must expose selection through `checked`, `aria-checked`, or `aria-selected`. Free text, dropdowns, cross-origin embedded quizzes, timers that require visiting a research link, and CAPTCHA steps need manual input. The bot reports a pause rather than forcing those steps.

An API 401 means the key is invalid; 403 usually means model/project access is missing; 429 can mean insufficient credits or a rate limit. A stalled page often means a required interest rating, feedback, or timer needs attention. After manually completing that step, navigate to the next question and start again.

## Development and verification

Run `node --test tests/*.test.cjs` for the dependency-free validation, API, cancellation, and navigation tests. Run `node tests/run-browser.cjs` for DOM integration checks with simulated quiz pages, and `node tests/run-browser.cjs --dashboard` for dashboard integration checks and a screenshot. The browser script prefers Chrome on Windows, then Brave; set `CHATTERHIGH_TEST_BROWSER` to another Chromium executable if needed. You can also open `tests/browser-fixture.html` directly in a browser. These tests use fake AI responses and make no paid API calls. Live accuracy and selectors still need verification in a signed-in quiz.

Architecture: `content.js` handles quiz DOM reads/actions; `api.js` handles research and answer validation; `runner.js` coordinates bounded runs; `dashboard.js` holds the API key and displays progress. The dashboard stays open to avoid service-worker request time limits. The service worker only opens the dashboard.
