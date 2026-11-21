(() => {
  const C = globalThis.ChatterCore;
  const $ = id => document.getElementById(id);
  let controller = null;
  let busy = false;
  const rows = new Map();
  function status(message, error = false) {
    $("status").textContent = message;
    $("status").dataset.error = String(error);
  }
  function readSettings() {
    return C.settings({
      model: $("model").value, autoSubmit: $("autoSubmit").checked,
      confidence: Number($("confidence").value) / 100, maxQuestions: $("maxQuestions").value,
      ...Object.fromEntries(["questionSelector", "optionSelector", "submitSelector", "nextSelector"].map(name => [name, $(name).value]))
    });
  }
  function lock(value) {
    busy = value;
    $("fields").disabled = value;
    for (const id of ["start", "inspect", "forget", "clear"]) $(id).disabled = value;
    $("stop").disabled = !value;
    $("badge").textContent = value ? "Working" : "Ready";
    $("badge").dataset.state = value ? "running" : "idle";
  }
  async function refresh() {
    const selected = $("tab").value;
    const tabs = await chrome.tabs.query({ url: ["https://chatterhigh.com/*", "https://www.chatterhigh.com/*"] });
    $("tab").replaceChildren();
    for (const tab of tabs) {
      const option = document.createElement("option");
      option.value = tab.id; option.textContent = tab.title || tab.url;
      $("tab").append(option);
    }
    if (!tabs.length) {
      const option = document.createElement("option");
      option.value = ""; option.textContent = "Open a ChatterHigh quiz tab first";
      $("tab").append(option);
    } else if (tabs.some(tab => String(tab.id) === selected)) $("tab").value = selected;
  }
  function tabId() {
    if (!$("tab").value) throw new Error("Open ChatterHigh, sign in, and open a quiz question. Then press Refresh.");
    return Number($("tab").value);
  }
  async function transport(id, message) {
    const tab = await chrome.tabs.get(id);
    if (!C.isChatterHigh(tab.url)) throw new Error("The selected tab is no longer on ChatterHigh.");
    let response;
    try { response = await chrome.tabs.sendMessage(id, message); }
    catch { throw new Error("Could not reach the quiz. Refresh the ChatterHigh page after loading the extension, then try again."); }
    if (!response?.ok) throw new Error(response?.error || "The quiz did not respond.");
    return response.result;
  }
  function rowFor(question) {
    const key = C.fingerprint(question);
    if (rows.has(key)) return rows.get(key);
    $("log").querySelector(".empty")?.remove();
    const row = document.createElement("li"); row.className = "entry";
    const title = document.createElement("h3"); title.textContent = question.text;
    row.append(title); $("log").prepend(row); rows.set(key, row);
    return row;
  }
  function addSources(row, sources) {
    row.querySelector(".sources")?.remove();
    const list = document.createElement("ul"); list.className = "sources";
    for (const source of sources || []) {
      const url = C.safeUrl(source.url); if (!url) continue;
      const li = document.createElement("li"); const anchor = document.createElement("a");
      anchor.href = url; anchor.textContent = source.title || url; anchor.target = "_blank"; anchor.rel = "noreferrer noopener";
      li.append(anchor); list.append(li);
    }
    if (list.childNodes.length) row.append(list);
  }
  function event(detail) {
    if(detail.type==='recovering'){status(detail.message);return;}
    if (detail.type === "submitted") { status(`Submitted ${detail.count} answer(s). Waiting for the next question…`); return; }
    const row = rowFor(detail.question);
    if (detail.type === "research") {
      status(`Researching question ${detail.count + 1}…`);
      const paragraph = document.createElement("p"); paragraph.textContent = "Researching official sources…"; paragraph.className = "researching"; row.append(paragraph);
    }
    if (detail.type === "evidence") {
      row.querySelector(".researching")?.remove();
      const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = "Research notes";
      const pre = document.createElement("pre"); pre.textContent = detail.evidence.replace(/\uE200[^\uE201]*\uE201/g, " [source]");
      details.append(summary, pre); row.append(details); addSources(row, detail.sources);
    }
    if (detail.type === "answer") {
      const selected = detail.question.options.filter(option => detail.answer.optionIds?.includes(option.id)).map(option => option.text).join("; ");
      const p = document.createElement("p"); p.className = "answer";
      p.textContent = `${selected || "Needs your input"} · ${Math.round(detail.answer.confidence * 100)}% confidence`;
      const explanation = document.createElement("p"); explanation.textContent = detail.answer.explanation;
      row.append(p, explanation); addSources(row, detail.answer.sources);
    }
  }
  $("refresh").addEventListener("click", () => refresh().catch(error => status(error.message, true)));
  $("confidence").addEventListener("input", () => { $("confidenceValue").value = `${$("confidence").value}%`; });
  $("clear").addEventListener("click", () => { $("log").replaceChildren(); rows.clear(); });
  $("forget").addEventListener("click", async () => {
    await chrome.storage.session.remove("apiKey"); $("apiKey").value = ""; status("API key removed from session memory.");
  });
  $("stop").addEventListener("click", () => {
    controller?.abort(new DOMException("Stopped by you.", "AbortError"));
    status("Stopping…");
  });
  $("inspect").addEventListener("click", async () => {
    if (busy) return;
    lock(true);
    try {
      const config = readSettings();
      const page = await transport(tabId(), { type: "chatter-bot", action: "scan", config });
      status(`${page.message} Submit buttons: ${page.submitCount}. Next buttons: ${page.nextCount}. No API calls made.`);
      for (const question of page.questions) {
        const row = rowFor(question); const p = document.createElement("p");
        p.textContent = question.options.map((option, i) => `${i + 1}. ${option.text}`).join(" | "); row.append(p);
      }
    } catch (error) { status(error.message, true); }
    finally { lock(false); }
  });
  $("settings").addEventListener("submit", async e => {
    e.preventDefault(); if (busy) return;
    lock(true); rows.clear(); $("log").replaceChildren();
    controller = new AbortController();
    try {
      const config = readSettings(); const id = tabId(); const apiKey = $("apiKey").value.trim();
      if (!apiKey) throw new Error("Enter an OpenAI API key first.");
      await chrome.storage.session.set({ apiKey });
      await chrome.storage.local.set({ settings: config });
      const solver = new globalThis.ChatterSolver({ apiKey, model: config.model });
      const runner = new globalThis.ChatterRunner({ transport: message => transport(id, message), solve: (...args) => solver.solve(...args), onEvent: event });
      const result = await runner.run(config, controller.signal);
      status(`${result.message} ${result.count} answer(s) submitted in this run.`);
    } catch (error) {
      status(controller.signal.aborted ? "Stopped. No further answers will be submitted." : error.message, !controller.signal.aborted);
      $("badge").dataset.state = "paused";
    } finally {
      const wasError = $("status").dataset.error === "true";
      lock(false); controller = null;
      if (wasError) { $("badge").textContent = "Paused"; $("badge").dataset.state = "paused"; }
    }
  });
  Promise.all([chrome.storage.local.get("settings"), chrome.storage.session.get("apiKey")]).then(async ([local, session]) => {
    const config = C.settings(local.settings);
    for (const [key, value] of Object.entries(config)) {
      if (!$(key)) continue;
      if (key === "autoSubmit") $(key).checked = value;
      else if (key === "confidence") $(key).value = value * 100;
      else $(key).value = value;
    }
    $("confidenceValue").value = `${$("confidence").value}%`;
    $("apiKey").value = session.apiKey || "";
    await refresh();
  }).catch(error => status(error.message, true));
})();
