(() => {
  const C = globalThis.ChatterCore;
  const choiceSelector = 'input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]';
  const questionSelector = 'fieldset,[data-question],.quiz-question,.question-container,.question-card,.question';
  let latest = null;
  let mouseTarget = null;
  const text = element => C.normalize(element.innerText || element.textContent || (element.matches('input[type="submit"],input[type="button"]') ? element.value : ''));
  function visible(element) {
    if (!element?.isConnected || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
  }
  function enabled(element) { return !element.matches(":disabled") && !element.closest('[aria-disabled="true"]'); }
  function controlReady(element){return Boolean(element?.isConnected&&element.getClientRects().length&&!element.matches(':disabled,.disabled,.no-pointer-event')&&!element.closest('[inert],[aria-disabled=true],[aria-busy=true]')&&getComputedStyle(element).pointerEvents!=='none');}
  function labelFor(element) {
    const labels = [...(element.labels || [])].map(text).filter(Boolean).join(" ");
    const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(text).join(" ");
    return C.normalize(labels || element.getAttribute("aria-label") || labelledBy || (element.matches("input") ? "" : text(element)) || element.parentElement?.textContent);
  }
  function selectable(element) {
    if (!enabled(element)) return false;
    if (visible(element)) return true;
    // Styled native inputs may be hidden; their visible label remains clickable.
    return element.matches("input") && [...(element.labels || [])].some(visible) && !element.closest('[hidden],[aria-hidden="true"]');
  }
  function getChoices(root, selector) {
    return [...root.querySelectorAll(selector)].filter(selectable).filter(element =>
      !element.querySelector(choiceSelector) // avoid collecting a custom wrapper and its native input twice
    );
  }
  function containerFor(elements) {
    let common = elements[0].parentElement;
    while (common && !elements.every(element => common.contains(element))) common = common.parentElement;
    const explicit = elements[0].closest(questionSelector);
    if (explicit && elements.every(element => explicit.contains(element))) return explicit;
    const optionLength = elements.reduce((sum, element) => sum + labelFor(element).length, 0);
    while (common && common !== document.body) {
      if (text(common).length > optionLength + 15) return common;
      common = common.parentElement;
    }
    return null;
  }
  function controls(root, selector, regex, includeDisabled=false) {
    const candidates = [...root.querySelectorAll(selector || 'button,input[type="submit"],input[type="button"],a,[role="button"]')];
    return candidates.filter(element => visible(element) && (includeDisabled||enabled(element)) && (selector || regex.test(text(element))));
  }
  function researchLinks(root) {
    const useful = anchor => {
      if (!visible(anchor) || !C.safeUrl(anchor.href)) return false;
      const url = new URL(anchor.href);
      return !(url.origin === location.origin && url.pathname === location.pathname && url.search === location.search);
    };
    let anchors = [...root.querySelectorAll('a[href]')].filter(useful);
    if (!anchors.length) {
      const surrounding = root.closest('form,.question-card,.quiz-question') || root.parentElement;
      anchors = [...(surrounding?.querySelectorAll('a[href]') || [])].filter(anchor => useful(anchor) && (/research|resource|website|visit|find.*answer|learn more|recherche/i.test(text(anchor)) || !C.isChatterHigh(anchor.href)));
    }
    const scope = root.closest('form') || root;
    const buttons = [...scope.querySelectorAll('button[data-ref],button[data-url],a[data-ref]')].filter(element => visible(element) && /research|resource|recherche/i.test(text(element)));
    const research = buttons.flatMap(element => {
      try {
        const value = element.dataset.ref ? atob(element.dataset.ref) : element.dataset.url;
        const url = C.safeUrl(new URL(value, location.href).href);
        return url ? [{ title: 'Research', url }] : [];
      } catch { return []; }
    });
    const links = [...research, ...anchors.map(anchor => ({ title: text(anchor), url: C.safeUrl(anchor.href) }))];
    return [...new Map(links.filter(link => link.url).map(link => [link.url, link])).values()].slice(0, 12);
  }
  function promptFor(group) {
    // Survey prompts often sit just before the answer row, without a fieldset.
    // Use that row's own prompt rather than the text of the whole survey form.
    for (let element = group.elements[0]; element && group.root.contains(element); element = element.parentElement) {
      for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (sibling.matches(choiceSelector) || sibling.querySelector(choiceSelector)) break;
        if (!visible(sibling) || sibling.matches('input,select,textarea,script,style')) continue;
        const value = text(sibling);
        if (value.length > 12 && !/^(hint|tip):/i.test(value)) return value;
      }
      if (element === group.root) break;
    }
    return text(group.root);
  }
  function scan(config = {},includeDisabledControls=false) {
    const groups = [];
    if (config.questionSelector) {
      for (const root of document.querySelectorAll(config.questionSelector)) {
        const elements = getChoices(root, config.optionSelector || choiceSelector);
        if (elements.length) groups.push({ root, elements });
      }
    } else {
      const named = new Map();
      for (const element of getChoices(document, config.optionSelector || choiceSelector)) {
        const scope = element.form || element.closest('[role="radiogroup"],[role="group"],fieldset') || document;
        const name = element.getAttribute("name") || "__unnamed__";
        let group = [...named.values()].find(item => item.scope === scope && item.name === name);
        if (!group) { group = { scope, name, elements: [] }; named.set(named.size, group); }
        group.elements.push(element);
      }
      for (const group of named.values()) {
        const root = containerFor(group.elements);
        if (root) groups.push({ root, elements: group.elements });
      }
    }
    const mapped = groups.filter(group => group.elements.length >= 2 && group.elements.length <= 20).map((group, i) => {
      const options = group.elements.map((element, j) => ({ id: `o${j}`, text: labelFor(element).slice(0, 1500) }));
      const prompt = promptFor(group).slice(0, 5000), context = text(group.root);
      return {
        ...group, id: `q${i}`, question: {
          id: `q${i}`, text: (context.includes(prompt) ? context : `${prompt}\n${context}`).slice(0, 10000), prompt,
          multiple: !C.trueFalseOptions({options}) && group.elements.every(element => element.matches('input[type="checkbox"],[role="checkbox"]')),
          options,
          links: researchLinks(group.root)
        }
      };
    }).filter(group => group.question.options.every(option => option.text));
    const roots = [...new Set(mapped.map(group => group.root.closest("form") || group.root))];
    // A selector override is explicitly chosen by the user, so it can target controls outside the question card.
    let submit = config.submitSelector ? controls(document, config.submitSelector,null,includeDisabledControls) : [...new Set(roots.flatMap(root => controls(root, "", /^(submit( answer(s)?)?|check( my)? answer(s)?|answer|valider|soumettre|vérifier)$/i,includeDisabledControls)))];
    if (!submit.length && mapped.length) submit = controls(document, "", /^(submit( answer(s)?)?|check( my)? answer(s)?|valider|soumettre|vérifier)$/i,includeDisabledControls);
    const next = controls(document, config.nextSelector, /^(next( question| page)?|continue|suivant(e)?|continuer)(\s*[→›»])?$/i,includeDisabledControls);
    const body = text(document.querySelector("main") || document.body);
    const complete = !mapped.length && /quiz complete|completed (the |your |this )?(daily )?quiz|finished (the |your )?quiz|come back tomorrow|module complete|course complete|you have completed (all (the )?questions (for|in) this |the |your |this )?(daily )?module|quiz terminé|module terminé/i.test(body);
    const feedback = !mapped.length && /(^|\n)\s*(correct!|incorrect!|your answer (is|was)|that's correct)/i.test((document.querySelector('main') || document.body).innerText);
    const questions = mapped.map(group => group.question);
    const result = {
      url: location.href, title: document.title, questions,
      fingerprint: C.fingerprint([location.origin + location.pathname + location.search, questions.map(({id,prompt,multiple,options,links})=>({id,prompt,multiple,options,links:links.map(link=>link.url)}))]),
      submitCount: submit.length, nextCount: next.length, complete, feedback,score:complete?C.siteScore(body):null,
      message: complete ? "Quiz completed." : questions.length ? `${questions.length} question(s) found.` : "No supported multiple-choice questions found. Open a question, or adjust the advanced selectors."
    };
    latest = { ...result, mapped, submit, next };
    return result;
  }
  function selected(element) {
    return element.matches("input") ? element.checked : element.getAttribute("aria-checked") === "true" || element.getAttribute("aria-selected") === "true";
  }
  function clickChoice(element) {
    const label = [...(element.labels || [])].find(visible);
    (visible(element) ? element : label || element).click();
  }
  function dispatch(message) {
    const current = scan(message.config,Boolean(message.plan||message.verifyOnly));
    if (message.action === "scan") return current;
    if (message.fingerprint !== current.fingerprint) throw new Error("The quiz changed. Scan it again before answering.");
    if (message.action === "fill") {
      if (!Array.isArray(message.answers) || message.answers.length !== latest.mapped.length) throw new Error("An answer is required for every question on this page.");
      // Validate the entire batch before making the first DOM change.
      if (new Set(message.answers.map(answer => answer.id)).size !== message.answers.length) throw new Error("Duplicate question IDs.");
      for (const answer of message.answers) {
        const group = latest.mapped.find(item => item.id === answer.id);
        if (!group) throw new Error("Question no longer exists.");
        C.validateDecision({ ...answer, confidence: 1, personal: false }, group.question, 0.5);
      }
      const mapped = latest.mapped;
      for (const answer of message.answers) {
        const group = mapped.find(item => item.id === answer.id);
        for (let i = 0; i < group.elements.length; i++) {
          const element = group.elements[i];
          if (!element.isConnected) throw new Error("The quiz changed while selecting answers. Review the page.");
          const desired = answer.optionIds.includes(`o${i}`);
          if (desired !== selected(element) && (element.matches('input[type="checkbox"],[role="checkbox"]') || desired)) {
            if (message.verifyOnly) continue;
            if (message.plan) { mouseTarget=element;return {target:true,desired}; }
            clickChoice(element);
          }
        }
        if (!message.verifyOnly && group.elements.some((element, i) => selected(element) !== answer.optionIds.includes(`o${i}`))) throw new Error("An answer could not be selected. Review the page or configure the choice selector.");
      }
      return { ok: true };
    }
    if (["submit", "next"].includes(message.action) && message.answers) {
      for (const answer of message.answers) {
        const group = latest.mapped.find(item => item.id === answer.id);
        if (!group || group.elements.some((element, i) => selected(element) !== answer.optionIds.includes(`o${i}`))) throw new Error("The selected answers changed before submission. Review the quiz tab.");
      }
    }
    const candidates = message.action === "submit" ? latest.submit : message.action === "next" ? latest.next : [];
    if (candidates.length !== 1) throw new Error(`Expected one ${message.action} button; found ${candidates.length}. Review the page or set an advanced selector.`);
    if (message.verifyOnly) return {ok:true,ready:controlReady(candidates[0])};
    if (message.plan) { mouseTarget=candidates[0];return {target:true,ready:controlReady(candidates[0])}; }
    candidates[0].click();
    return { ok: true };
  }
  globalThis.ChatterDOM = { dispatch, mouseTarget:()=>mouseTarget };
  if (globalThis.chrome?.runtime?.onMessage) chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "chatter-bot") return;
    try { sendResponse({ ok: true, result: dispatch(message) }); }
    catch (error) { sendResponse({ ok: false, error: error.message }); }
  });
})();
