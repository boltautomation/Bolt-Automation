const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../extension/core.js'); require('../extension/runner.js');
const C = globalThis.ChatterCore;
const awareness = { id: 'q0', text: "Have you heard of Let's Talk Science - Parlons Sciences before?", multiple: false, options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }] };
const interest = { id: 'q1', text: "How interesting is Let's Talk Science - Parlons Sciences to you?", multiple: false, options: [{ id: 'four', text: '4 - Very Interesting' }, { id: 'three', text: '3 - Interesting' }, { id: 'two', text: '2 - Somewhat Interesting' }, { id: 'one', text: '1 - Not Interesting' }] };
const survey = { fingerprint: 'survey', questions: [awareness, interest, { ...awareness, id: 'q2', text: 'Did you know you could study business administration and management, general or do this as a job?' }, { ...interest, id: 'q3', text: 'How interesting is business administration and management, general to you?' }], submitCount: 0, nextCount: 1, complete: false };
test('screenshot survey chooses No and the lowest interest rating for all four prompts', () => {
  assert.deepEqual(survey.questions.map(question => C.surveyAnswer(question).optionIds[0]), ['no', 'one', 'no', 'one']);
});

test('random survey mode chooses Yes/No and all meaningful interest ratings, excluding placeholders',()=>{
  assert.equal(C.settings().surveyMode,'preset');assert.equal(C.settings({surveyMode:'random'}).surveyMode,'random');
  assert.throws(()=>C.settings({surveyMode:'unknown'}),/surveys/);
  assert.deepEqual(C.surveyAnswer(awareness,'random',()=>0).optionIds,['yes']);
  assert.deepEqual(C.surveyAnswer(awareness,'random',()=>.99).optionIds,['no']);
  const question={...interest,options:[...interest.options,{id:'placeholder',text:'N/A'}]};
  for(let i=0;i<4;i++){
    const answer=C.surveyAnswer(question,'random',()=>(i+.5)/4);
    assert.equal(answer.optionIds[0],interest.options[i].id);assert.equal(answer.randomSurvey,true);assert.equal(answer.survey,true);
    assert.match(answer.explanation,/Random survey response/);
  }
  assert.equal(C.surveyAnswer({...awareness,text:'Is Ottawa the capital of Canada?'},'random'),null);
});
test('ordinary factual yes/no questions and unrelated personal questions never use survey presets', () => {
  assert.equal(C.surveyAnswer({ ...awareness, text: 'Is Ottawa the capital of Canada?' }), null);
  assert.equal(C.surveyAnswer({ ...awareness, text: 'Would you like to receive marketing emails?' }), null);
  assert.equal(C.surveyAnswer({ ...interest, text: 'Which rating did most participants select?' }), null);
  assert.equal(C.surveyAnswer({ ...awareness, multiple: true }), null);
});
test('a local prompt takes precedence over surrounding page text', () => {
  assert.equal(C.surveyAnswer({ ...awareness, text: `${awareness.text} Is this a factual question?`, prompt: 'Is this a factual question?' }), null);
});
function fixture(pages, settings = {}) {
  const actions = [], solved = [], delays=[]; let index = 0;
  const runner = new globalThis.ChatterRunner({
    transport: async message => { actions.push(message); return message.action === 'scan' ? pages[Math.min(index++, pages.length - 1)] : { ok: true }; },
    solve: async question => { solved.push(question.id); return { optionIds: [question.options[0].id], confidence: 1, personal: false, sources: [{ url: 'https://example.org' }] }; },
    sleep: async ms => {delays.push(ms);}
  });
  return { actions, solved, delays, run: () => runner.run(C.settings(settings), new AbortController().signal) };
}
const done = { fingerprint: 'done', questions: [], complete: true, nextCount: 0, submitCount: 0 };
test('survey-only page fills all four selections and clicks Next without model calls', async () => {
  const f = fixture([survey, done]); const result = await f.run();
  assert.equal(result.reason, 'complete'); assert.equal(result.count, 0); assert.equal(f.solved.length, 0);
  assert.deepEqual(f.actions.map(action => action.action), ['scan', 'fill', 'next', 'scan']);
  assert.deepEqual(f.actions[1].answers.map(answer => answer.optionIds[0]), ['no', 'one', 'no', 'one']);
});

test('random surveys still skip the model, respect the interest cooldown, and advance with Next',async()=>{
  const f=fixture([survey,done],{surveyMode:'random',randomOpinions:true,interestDelayMs:2000});
  assert.equal((await f.run()).reason,'complete');assert.equal(f.solved.length,0);
  const answers=f.actions.find(a=>a.action==='fill').answers;
  for(const answer of answers){const question=survey.questions.find(q=>q.id===answer.id);assert.ok(question.options.some(o=>o.id===answer.optionIds[0]));}
  assert.deepEqual(f.actions.map(a=>a.action),['scan','fill','next','scan']);
  assert.equal(f.delays.filter(ms=>ms===2000).length,1);
});
test('survey after the last permitted question is completed before the limit stops the next quiz question', async () => {
  const question = { ...awareness, id: 'fact', text: 'Is this statement true?' };
  const page = { ...survey, fingerprint: 'fact-one', questions: [question], submitCount: 1, nextCount: 0 };
  const f = fixture([page, survey, { ...page, fingerprint: 'fact-two' }], { maxQuestions: 1 });
  const result = await f.run(); assert.equal(result.reason, 'limit'); assert.equal(result.count, 1); assert.deepEqual(f.solved, ['fact']);
  assert.deepEqual(f.actions.filter(action => action.action !== 'scan').map(action => action.action), ['fill', 'submit', 'fill', 'next']);
});
test('review mode fills surveys without clicking Next and preset can be disabled', async () => {
  const review = fixture([survey], { autoSubmit: false });
  assert.equal((await review.run()).reason, 'review'); assert.deepEqual(review.actions.map(action => action.action), ['scan', 'fill']);
  const manual = fixture([survey, done], { autoSurvey: false });
  await manual.run(); assert.equal(manual.solved.length, 4);
});
test('mixed factual and survey groups only send factual questions to the model', async () => {
  const fact = { ...awareness, id: 'fact', text: 'Is this statement true?' };
  const f = fixture([{ ...survey, questions: [fact, ...survey.questions], submitCount: 1 }, done]);
  const result = await f.run(); assert.equal(result.count, 1); assert.deepEqual(f.solved, ['fact']);
});
test('finish-activity mode ignores question limits and continues until completion', async () => {
  const fact = { ...awareness, id: 'fact', text: 'Is this statement true?' };
  const pages = Array.from({ length: 25 }, (_, index) => ({ ...survey, fingerprint: `question-${index}`, questions: [fact], submitCount: 1, nextCount: 0 }));
  const f = fixture([...pages, done], { maxQuestions: 1, finishActivity: true });
  const result = await f.run(); assert.equal(result.reason, 'complete'); assert.equal(result.count, 25); assert.equal(f.solved.length, 25);
});
