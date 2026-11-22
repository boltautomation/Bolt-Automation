(() => {
  const C = globalThis.ChatterCore;
  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  async function bounded(work,ms,signal,message) {
    signal.throwIfAborted();
    const controller=new AbortController(),working=AbortSignal.any([signal,controller.signal]);
    let onAbort;
    const interrupted=new Promise((resolve,reject)=>{onAbort=()=>reject(working.reason);working.addEventListener('abort',onAbort,{once:true});if(working.aborted)onAbort();});
    const timer=setTimeout(()=>{const error=new Error(message);error.code='ANSWER_TIMEOUT';controller.abort(error);},ms);
    try{return await Promise.race([Promise.resolve().then(()=>work(working)),interrupted]);}
    finally{clearTimeout(timer);working.removeEventListener('abort',onAbort);}
  }
  const guessAllowed=error=>!['SESSION_EXPIRED','SESSION_RECOVERY_REQUIRED'].includes(error.code)&&!/captcha|verify you are human|verification (?:step|code)|two.factor|account.*(?:disabled|suspended)|^This question asks.*(?:opinion|experience)|^The quiz changed|^The browser is outside ChatterHigh/i.test(error.message);
  const personalQuestionError=error=>error.code==='PERSONAL_QUESTION'||/^This question asks.*(?:opinion|experience)/i.test(error.message);
  class Runner {
    constructor({ transport, solve, guess, prepareResearch, onEvent = () => {}, sleep = delay, questionTimeoutMs=90000, guessTimeoutMs=20000 }) { Object.assign(this, { transport, solve, guess, prepareResearch, onEvent, sleep, questionTimeoutMs, guessTimeoutMs }); }
    async run(config, signal) {
      let pacingController;
      try{
      let count = 0;
      const submitted = new Set();
      const transitions = new Set();
      const send = async (action, data = {}) => {
        signal.throwIfAborted();
        return this.transport({ type: "chatter-bot", action, config, ...data });
      };
      const recover = message => this.onEvent({type:'recovering',message,count});
      const pollDelay=attempt=>Math.min(500,50*2**Math.min(attempt,4));
      const fatal=error=>['SESSION_EXPIRED','SESSION_RECOVERY_REQUIRED'].includes(error.code)||/captcha|verify you are human|verification (?:step|code)|two.factor|account.*(?:disabled|suspended)|^The browser is outside ChatterHigh/i.test(error.message);
      const initialScan=async()=>{
        for(let attempt=0;;attempt++){
          try{return await send('scan');}
          catch(error){signal.throwIfAborted();if(fatal(error)||attempt>=2)throw error;recover('The page is reconnecting. Retrying the scan…');await this.sleep(300,signal);}
        }
      };
      const commit=async(action,data)=>{
        try{return await send(action,data);}
        catch(error){
          signal.throwIfAborted();if(fatal(error))throw error;
          // An interrupted response does not prove a click failed. Reconcile
          // against a meaningful page state, without replaying the action.
          for(let attempt=0;attempt<3;attempt++){
            await this.sleep(300,signal);
            let current;
            try{current=await send('scan');}catch(scanError){signal.throwIfAborted();if(fatal(scanError))throw scanError;continue;}
            if(current.complete||current.fingerprint!==data.fingerprint&&(current.questions.length>0||current.nextCount===1&&current.feedback)){
              recover('The click response was interrupted, but the page advanced. Continuing without repeating it.');return {ok:true};
            }
          }
          throw error;
        }
      };
      const settle = async initial => {
        let current = initial;const deadline=Date.now()+15000;
        for (let attempt=0; attempt<33; attempt++) {
          if (current.complete || current.questions.length || current.nextCount===1 && (count>0 || submitted.size>0 || current.feedback)) return current;
          if (attempt===0) recover('Waiting for the question to finish loading. Rescanning automatically…');
          const remaining=deadline-Date.now();if(remaining<=0)break;
          await this.sleep(Math.min(pollDelay(attempt),remaining),signal);
          try { current = await send('scan'); } catch (error) { signal.throwIfAborted(); if((error.code==='SESSION_EXPIRED'||error.code==='SESSION_RECOVERY_REQUIRED')||attempt===32)throw error; }
        }
        return current;
      };
      let page = await initialScan();
      for (let step = 0; step < (config.finishActivity ? 10000 : 250); step++) {
        signal.throwIfAborted();
        page = await settle(page);
        if (page.complete) return { reason: "complete", count, message: "Quiz completed.",score:C.validSiteScore(page.score)?page.score:null };
        if(page.questions.some(question=>C.isCompletionTask(question)&&!C.completionAnswer(question))){
          const error=new Error('Needs your input: complete the linked worksheet or reflection, then answer its completion question yourself.');
          error.code='USER_TASK_REQUIRED';error.details={reason:'external-task-completion'};throw error;
        }
        const presets = page.questions.map(question => C.completionAnswer(question)||(config.autoSurvey ? C.surveyAnswer(question,config.surveyMode) : null)||(config.randomOpinions&&C.isOpinionQuestion(question)?C.randomOpinionAnswer(question):null));
        const factualCount = presets.filter(answer => !answer||answer.completionAcknowledgement).length;
        const hasInterest=page.questions.some(question=>C.isInterestQuestion(question));
        const interestPage=hasInterest&&page.questions.every(question=>C.isInterestQuestion(question)||C.surveyAnswer(question));
        let advancedWithNext = false;
        // Finish the survey following the last allowed quiz answer before stopping.
        if (!config.finishActivity && count >= config.maxQuestions && factualCount) return { reason: "limit", count, message: "Question limit reached. Start again to continue." };
        if (page.questions.length && !submitted.has(page.fingerprint)) {
          if (!config.finishActivity && count + factualCount > config.maxQuestions) return { reason: "limit", count, message: "This page would exceed the question limit. Increase the limit to continue." };
          const answers = [];let guessed=false,randomOpinion=false;
          let paced = false,pacingPromise=Promise.resolve();
          const startPacing = () => {
            signal.throwIfAborted();
            if (paced) return;
            paced = true;
            const delayMs=interestPage?config.interestDelayMs:config.answerDelayMs;
            if (delayMs > 0) {
              this.onEvent({ type: "pacing", delayMs, count, interest:interestPage });
              pacingController=new AbortController();
              pacingPromise=Promise.resolve(this.sleep(delayMs,AbortSignal.any([signal,pacingController.signal])));
              // Stop or a failed solve may reject this while generation is
              // still unwinding. Await it before filling, and handle it now too.
              pacingPromise.catch(()=>{});
            }
          };
          const pauseAfterResearch=async()=>{startPacing();await pacingPromise;signal.throwIfAborted();};
          for (let index = 0; index < page.questions.length; index++) {
            const question = page.questions[index], preset = presets[index];
            const prepareForAnswer=async workingSignal=>{if(this.prepareResearch&&question.links?.length)await this.prepareResearch(question,workingSignal,startPacing);};
            if(preset?.randomOpinion)this.onEvent({type:'random-opinion',question,count});
            else if (!preset) this.onEvent({ type: "research", question, count });
            if(preset?.randomOpinion||preset?.completionAcknowledgement)await prepareForAnswer(signal);
            let answer, repair = null;
            const research=async workingSignal=>{
            for(let attempt=0; attempt<3; attempt++) {
              workingSignal.throwIfAborted();
              try {
                answer = preset || await this.solve(question,workingSignal,detail=>{workingSignal.throwIfAborted();this.onEvent({type:'evidence',question,...detail});},repair,startPacing);
                workingSignal.throwIfAborted();
                answer = C.normalizeCombinedAnswer(answer,question);
                C.validateDecision(answer,question,preset?.randomOpinion?0:config.confidence);
                if(!preset && !answer.sources?.length)throw new Error('No cited evidence was returned. Review this question manually.');
                return answer;
              } catch(error) {
                workingSignal.throwIfAborted();
                if(error.code==='LOW_CONFIDENCE')this.onEvent({type:'answer-review',question,count,attempt:attempt+1,details:error.details});
                if(config.randomOpinions&&personalQuestionError(error)&&C.isOpinionQuestion(question,true)){
                  this.onEvent({type:'random-opinion',question,count});
                  await prepareForAnswer(workingSignal);
                  return C.randomOpinionAnswer(question);
                }
                const retryable = /multiple answers|valid answer|option|JSON|quote|cited|source|evidence|research page|did not finish|generation failed|not enough|needs review/i.test(error.message) && !/own opinion|experience|personal|not installed|API key/i.test(error.message);
                if(preset || attempt===2 || !retryable || error.code==='LOW_CONFIDENCE'&&attempt>=1)throw error;
                // A confidence miss gets one fresh evidence read. Do not tell
                // the model a target score or anchor it to the earlier answer.
                repair = error.code==='LOW_CONFIDENCE'?{code:error.code,error:'Re-evaluate whether the source establishes the exact question. Do not raise confidence merely to pass a threshold.',previous:null}:{error:error.message,previous:answer ? {optionIds:answer.optionIds,confidence:answer.confidence,personal:answer.personal,explanation:answer.explanation} : null,...(error.review?{review:error.review}:{})};
                recover(/needs review|not enough|quote|source|evidence|research page/i.test(error.message)?`Reading more research and checking the answer (${attempt+1}/2)…`:`Rechecking the answer automatically (${attempt+1}/2)…`);
                await this.sleep(400,workingSignal);
              }
            }
            };
            try{
              const budget=this.questionTimeoutMs*(config.doubleCheck?2:1)+(config.visionResearch&&/\b(?:images?|comic|diagram|picture|map|chart|figure)\b/i.test(question.prompt||question.text)?120000:0);
              answer=!preset?await bounded(research,budget,signal,`Research or answer generation exceeded the ${budget/1000}-second limit.`):await research(signal);
            }catch(error){
              signal.throwIfAborted();
              if(preset||!config.guessWhenStuck||!guessAllowed(error)||answer?.personal)throw error;
              this.onEvent({type:'guessing',question,count,message:error.message});
              await prepareForAnswer(signal);
              startPacing();
              let best,guessFailure;
              if(error.code==='LOW_CONFIDENCE'&&answer?.crossChecked&&answer.sources?.length&&answer.evidenceQuote?.length>=12)try{best=C.educatedGuess({...answer,canAnswer:true,basis:'source-context'},question,error.message);}catch{}
              if(!best&&this.guess){
                try{
                  const candidate=await bounded(guessSignal=>this.guess(question,guessSignal,error.message),this.guessTimeoutMs,signal,'Best-effort guess generation timed out.');
                  best=C.educatedGuess(C.normalizeCombinedAnswer(candidate,question),question,error.message);
                }catch(guessError){signal.throwIfAborted();if(config.randomOpinions&&personalQuestionError(guessError)&&C.isOpinionQuestion(question,true)){this.onEvent({type:'random-opinion',question,count});best=C.randomOpinionAnswer(question);}else if(!guessAllowed(guessError))throw guessError;else guessFailure=guessError;}
              }
              if(!best){const review=new Error('No educated guess was available. Review this question.');review.code='NO_EDUCATED_GUESS';review.details={reason:'educated-guess-unavailable',researchError:error.message,guessError:guessFailure?.message||'No local guess model available.',...(guessFailure?.details?{guessDetails:guessFailure.details}:{})};throw review;}
              answer=best;
              signal.throwIfAborted();guessed=true;
            }
            guessed ||= Boolean(answer.guessed);randomOpinion ||= Boolean(answer.randomOpinion);
            this.onEvent({ type: "answer", question, answer });
            answers.push({ id: question.id, optionIds: answer.optionIds });
          }
          // Research loading and generation overlap the minimum chosen delay.
          // Survey-only pages start their delay here, before any filling.
          await pauseAfterResearch();
          // A mixed factual/interest form gets its interest pause before filling.
          if(hasInterest&&!interestPage&&config.interestDelayMs>0){
            this.onEvent({type:'pacing',delayMs:config.interestDelayMs,count,interest:true});
            await this.sleep(config.interestDelayMs,signal);signal.throwIfAborted();
          }
          await send("fill", { fingerprint: page.fingerprint, answers, pacingComplete:true });
          if (!config.autoSubmit) return { reason: "review", count, message: "Answers filled. Review and submit them in the quiz tab." };
          const surveyOnly = factualCount === 0;
          const action = surveyOnly && page.submitCount === 0 && page.nextCount === 1 ? "next" : "submit";
          await commit(action, { fingerprint: page.fingerprint, answers, pacingComplete:true });
          advancedWithNext = action === "next";
          submitted.add(page.fingerprint);
          count += factualCount;
          this.onEvent({ type: "submitted", count, questionCount:page.questions.filter(question=>!C.surveyAnswer(question)).length, fingerprint:page.fingerprint, survey: surveyOnly, guessed, randomOpinion });
        } else if (page.nextCount === 1 && (count > 0 || submitted.size > 0 || page.feedback)) {
          const key = page.fingerprint;
          if (transitions.has(key)) throw new Error("The Next button did not advance the quiz. Review the quiz tab.");
          transitions.add(key);
          await commit("next", { fingerprint: page.fingerprint });
          advancedWithNext = true;
        } else {
          const error=new Error(page.questions.length ? "The submitted question is still visible. Complete any feedback or personal rating in the quiz tab, then start again." : page.message);if(!page.questions.length)error.code='PAGE_NOT_READY';throw error;
        }
        const previous = page;
        let changed = false;const deadline=Date.now()+15000;
        for (let attempt = 0; attempt < 33; attempt++) {
          if(attempt){const remaining=deadline-Date.now();if(remaining<=0)break;await this.sleep(Math.min(pollDelay(attempt-1),remaining),signal);}
          try { page = await send("scan"); }
          catch (error) {
            signal.throwIfAborted();
            if((error.code==='SESSION_EXPIRED'||error.code==='SESSION_RECOVERY_REQUIRED'))throw error;
            if (attempt === 32) throw error;
            continue; // content script may be reloading during a full navigation
          }
          if (page.complete || page.fingerprint !== previous.fingerprint || (!advancedWithNext && submitted.has(page.fingerprint) && page.nextCount === 1)) {
            changed = true; break;
          }
        }
        if (!changed){const error=new Error("The quiz did not advance within 15 seconds. Refreshing once from saved progress is required.");error.code='PAGE_TRANSITION_STALLED';throw error;}
      }
      throw new Error("Navigation limit reached. Review the quiz tab.");
      }finally{pacingController?.abort(new DOMException('Run finished.','AbortError'));}
    }
  }
  globalThis.ChatterRunner = Runner;
})();
