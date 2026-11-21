/* Shared, dependency-free validation. Also used by the Node test suite. */
(() => {
  const defaults = Object.freeze({
    model: "gpt-5.4-mini", autoSubmit: true, autoSurvey: true, surveyMode: 'preset', guessWhenStuck: false, randomOpinions: false, finishActivity: false, confidence: 0.85, maxQuestions: 20, answerDelayMs: 0, interestDelayMs: 0,
    doubleCheck: false, questionSelector: "", optionSelector: "", submitSelector: "", nextSelector: ""
  });
  const normalize = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const fingerprint = value => JSON.stringify(value);
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function isChatterHigh(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["chatterhigh.com", "www.chatterhigh.com"].includes(url.hostname);
    } catch { return false; }
  }
  function settings(input = {}) {
    const value = { ...defaults, ...input };
    value.model = normalize(value.model);
    if (!value.model || value.model.length > 100) throw new Error("Enter a valid model ID.");
    value.confidence = Number(value.confidence);
    value.maxQuestions = Number(value.maxQuestions);
    value.answerDelayMs = Number(value.answerDelayMs);
    if (!Number.isInteger(value.answerDelayMs) || value.answerDelayMs < 0 || value.answerDelayMs > 30000) throw new Error("Answer delay must be between 0 and 30 seconds.");
    value.interestDelayMs=Number(value.interestDelayMs);
    if(!Number.isInteger(value.interestDelayMs)||value.interestDelayMs<0||value.interestDelayMs>30000)throw new Error('Interest cooldown must be between 0 and 30 seconds.');
    if (!(value.confidence >= 0.5 && value.confidence <= 1)) throw new Error("Confidence must be between 50% and 100%.");
    if (!Number.isInteger(value.maxQuestions) || value.maxQuestions < 1 || value.maxQuestions > 100) throw new Error("Question limit must be 1–100.");
    value.autoSubmit = Boolean(value.autoSubmit);
    value.autoSurvey = Boolean(value.autoSurvey);
    if(!['preset','random'].includes(value.surveyMode))throw new Error('Choose No / lowest interest or Random responses for surveys.');
    value.guessWhenStuck = Boolean(value.guessWhenStuck);
    value.doubleCheck = Boolean(value.doubleCheck);
    value.randomOpinions = Boolean(value.randomOpinions);
    value.finishActivity = Boolean(value.finishActivity);
    for (const name of ["questionSelector", "optionSelector", "submitSelector", "nextSelector"]) value[name] = normalize(value[name]);
    return value;
  }
  function trueFalseOptions(question) {
    const options = question.options || [];
    const labels = options.map(option => normalize(option.text).replace(/^(?:\([a-z]\)|[a-z][).:])\s*/i, '').replace(/[.!]$/, '').toLowerCase());
    if (labels.filter(label => label === 'true').length !== 1 || labels.filter(label => label === 'false').length !== 1) return null;
    if (!labels.every(label => /^(true|false|n\s*\/\s*a|n\.?a\.?|not applicable)$/.test(label))) return null;
    // Keep the page's original IDs: removing placeholders must never shift a click.
    return options.filter((option, index) => labels[index] === 'true' || labels[index] === 'false');
  }
  function validateDecision(decision, question, threshold) {
    if (!decision || typeof decision !== "object") throw new Error("The solver returned an invalid answer.");
    if (decision.personal) { const error=new Error("This question asks for your own opinion or experience. Answer it in the quiz, then start again.");error.code='PERSONAL_QUESTION';throw error; }
    if (!Number.isFinite(decision.confidence) || decision.confidence < threshold || decision.confidence > 1) {
      throw new Error(`Answer needs review: ${decision.explanation || "not enough evidence"}`);
    }
    if (!Array.isArray(decision.optionIds) || !decision.optionIds.length || new Set(decision.optionIds).size !== decision.optionIds.length) {
      throw new Error("The solver did not select a valid answer.");
    }
    const booleanOptions = trueFalseOptions(question);
    if ((!question.multiple || booleanOptions) && decision.optionIds.length !== 1) throw new Error("Multiple answers returned for a single-choice question.");
    if (booleanOptions && !decision.optionIds.every(id => booleanOptions.some(option => option.id === id))) throw new Error("Invalid True/False option: N/A is a placeholder. Re-evaluate the statement and choose True or False using the source evidence.");
    const valid = new Set(question.options.map(option => option.id));
    if (!decision.optionIds.every(id => valid.has(id))) throw new Error("The solver selected an option that is not on the page.");
    return decision;
  }
  function markGuess(decision,question,reason,method='model') {
    validateDecision(decision,question,0);
    return {...decision,guessed:true,verified:false,supported:false,guessMethod:method,guessReason:normalize(reason),sources:Array.isArray(decision.sources)?decision.sources:[],explanation:`Unverified guess${method==='random'?' (random choice)':''}. ${normalize(decision.explanation)}`.trim()};
  }
  function randomGuess(question,reason,random=Math.random) {
    const options=trueFalseOptions(question)||question.options||[];
    if(!options.length)throw new Error('No valid choices are available for a guess.');
    const selected=options[Math.floor(random()*options.length)];
    return markGuess({optionIds:[selected.id],confidence:0,personal:false,explanation:'Research and model recovery were unavailable; selected one of the displayed choices.',sources:[]},question,reason,'random');
  }
  function isOpinionQuestion(question,identified=false) {
    const prompt=normalize(question.prompt||question.text);
    // A personal-sounding introduction does not change a factual task at the end.
    if(/_{2,}|\b(?:true\s*(?:or|\/)\s*false|fill (?:in )?the blank)\b/i.test(prompt)||trueFalseOptions(question))return false;
    const sentences=prompt.split(/(?<=[?!.])\s+/).filter(Boolean),task=sentences.at(-1)||prompt;
    if(/\b(?:what (?:amount|salary|number|year)|how many|how much)\b/i.test(task)&&!/\bin your (?:own )?opinion\b/i.test(task))return false;
    if(sentences.length>1&&/^(?:what|which|how many|how much|when|where|who|why|name|identify)\b/i.test(task)&&!/\b(?:your (?:own )?(?:opinion|preference|favo[u]?rite)|you (?:think|feel|prefer|like|enjoy|choose|find|want)|to you|interests you|appeals to you|would you)\b/i.test(task))return false;
    if(/\b(?:how many|how much|what (?:is|are|was|were)|which (?:year|number|salary|course)|projected|salary|credit hours)\b/i.test(task)&&/\d/.test(task)&&!/\bin your (?:own )?opinion\b/i.test(task))return false;
    // Account/contact consent is separate from an opinion in an activity.
    if(/\b(?:consent|opt[ -]?in|subscribe|newsletter|marketing|privacy policy|terms of (?:use|service)|receive (?:emails?|texts?|sms|messages)|contact (?:you|me)|share (?:my|your) (?:data|information))\b/i.test(prompt)&&!/\bin your (?:own )?opinion\b|\bwhat (?:do|would) you think\b|\bhow (?:do|would) you feel\b/i.test(prompt))return false;
    return identified||/\bwhat(?:'s| is) your (?:favo[u]?rite|opinion|preference)\b|\b(?:which|what)\b.{0,100}\bwould you\b.{0,60}\b(?:like|prefer|enjoy|choose|interested)\b|\bin your (?:own )?opinion\b|\bwhat (?:do|would) you think\b|\bhow (?:do|would) you feel\b|\bdo you (?:agree|disagree|prefer|believe|feel|enjoy|like)\b|\bwould you (?:prefer|enjoy|like to (?:study|learn|work|pursue|become))\b|^(?:which|what)\b.{0,100}\b(?:interests you|appeals to you|do you prefer|would you (?:choose|prefer)|you (?:prefer|find interesting|enjoy))\b|\b(?:rate|describe) your (?:interest|opinion|feelings|experience)\b|\bhow (?:interested|interesting)\b.{0,100}\b(?:you|to you)\b/i.test(prompt);
  }
  function randomOpinionAnswer(question,random=Math.random) {
    const answer=randomGuess(question,'User-authorized random opinion response.',random);
    return {...answer,randomOpinion:true,guessMethod:'random-opinion',explanation:'Random opinion response selected at your request from the displayed options.'};
  }
  function isInterestQuestion(question){return /^(how (interesting|interested)|rate your interest|what is your (level of )?interest)\b/i.test(normalize(question.prompt||question.text));}
  function surveyAnswer(question,mode='preset',random=Math.random) {
    if (question.multiple) return null;
    const prompt = normalize(question.prompt || question.text);
    const options = question.options.map(option => ({ ...option, label: normalize(option.text) }));
    const no = options.filter(option => /^(no|non)$/i.test(option.label));
    const yes = options.filter(option => /^(yes|oui)$/i.test(option.label));
    const awareness = /^(have you (heard|ever heard)|did you know|were you aware|are you aware|had you heard)\b/i.test(prompt);
    const interest = isInterestQuestion(question);
    let chosen;
    if (awareness && options.length === 2 && no.length === 1 && yes.length === 1) chosen = no[0];
    if (interest) {
      const lowest = options.filter(option => /^(1\s*[-–—:.]?\s*)?(not interesting|not interested|pas intéressant(e)?)$/i.test(option.label));
      if (lowest.length === 1) chosen = lowest[0];
    }
    if (!chosen) return null;
    if(mode==='random'){
      const choices=options.filter(option=>!/^(?:n\s*\/\s*a|n\.?a\.?|not applicable|select(?: an? option)?|choose(?: an? option)?)$/i.test(option.label));
      chosen=choices[Math.floor(random()*choices.length)];
    }
    return { optionIds: [chosen.id], confidence: 1, personal: false, survey: true, ...(mode==='random'?{randomSurvey:true}:{}),
      explanation: mode==='random'?`Random survey response selected at your request: ${chosen.text}.`:`Your survey preset: ${chosen.text}.`, sources: [] };
  }
  function normalizeCombinedAnswer(answer, question) {
    if (!Array.isArray(answer?.optionIds) || answer.optionIds.length < 2 || new Set(answer.optionIds).size !== answer.optionIds.length) return answer;
    const ids = new Set(answer.optionIds), options = question.options;
    if (![...ids].every(id => options.some(option => option.id === id))) return answer;
    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      const label = normalize(option.text).replace(/^[a-z][).:]\s*/i, '').replace(/[.!]$/, '');
      const pair = label.match(/^(?:both\s+)?\(?([a-z])\)?\s*(?:&|and|\+)\s*\(?([a-z])\)?(?:\s+are (?:correct|true))?$/i);
      let parts;
      if (pair) parts = [pair[1],pair[2]].map(letter => options[letter.toUpperCase().charCodeAt(0)-65]?.id);
      else if (/^all (?:of )?(?:the )?above$|^all of these$/i.test(label)) parts = options.slice(0,index).map(item=>item.id);
      if (!parts?.length || parts.some(id=>!id || id===option.id)) continue;
      const components = new Set(parts);
      const withoutCombined = [...ids].filter(id=>id!==option.id);
      if (withoutCombined.length === components.size && withoutCombined.every(id=>components.has(id))) {
        return {...answer, optionIds:[option.id], explanation:`${answer.explanation || ''} Selected the combined “${option.text}” option.`.trim()};
      }
    }
    return answer;
  }
  function outputText(response) {
    if (response.status !== "completed") throw new Error(`AI request did not complete (${response.status || "unknown status"}).`);
    const parts = (response.output || []).flatMap(item => item.type === "message" ? item.content || [] : []);
    const refusal = parts.find(part => part.type === "refusal");
    if (refusal) throw new Error(refusal.refusal || "The model declined this question.");
    const text = parts.filter(part => part.type === "output_text").map(part => part.text).join("\n");
    if (!text.trim()) throw new Error("The AI returned no answer.");
    return text;
  }
  function citations(response) {
    const found = new Map();
    for (const item of response.output || []) for (const part of item.content || []) for (const note of part.annotations || []) {
      if (note.type === "url_citation" && safeUrl(note.url)) found.set(note.url, { url: note.url, title: note.title || note.url });
    }
    return [...found.values()];
  }
  globalThis.ChatterCore = { defaults, normalize, fingerprint, safeUrl, isChatterHigh, settings, trueFalseOptions, validateDecision, markGuess, randomGuess, isOpinionQuestion, randomOpinionAnswer, isInterestQuestion, surveyAnswer, normalizeCombinedAnswer, outputText, citations };
})();
