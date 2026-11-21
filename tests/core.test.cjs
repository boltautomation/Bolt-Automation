const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../extension/core.js');
const C = globalThis.ChatterCore;
const q = { multiple: false, options: [{ id: 'o0' }, { id: 'o1' }] };
const good = { optionIds: ['o1'], confidence: .95, personal: false, explanation: 'Verified.' };

test('settings bound paid work and confidence', () => {
  assert.equal(C.settings().model, 'gpt-5.4-mini');
  assert.equal(C.settings({ maxQuestions: '3' }).maxQuestions, 3);
  for (const maxQuestions of [0, 101, 1.5, 'nope']) assert.throws(() => C.settings({ maxQuestions }));
  for (const confidence of [.49, 1.01, NaN]) assert.throws(() => C.settings({ confidence }));
  assert.throws(() => C.settings({ model: ' ' }));
});
test('only the exact HTTPS site is trusted', () => {
  assert.ok(C.isChatterHigh('https://chatterhigh.com/en/quizzes'));
  assert.ok(C.isChatterHigh('https://www.chatterhigh.com/'));
  for (const url of ['http://chatterhigh.com', 'https://chatterhigh.com.evil.test', 'https://evil.test/chatterhigh.com', 'javascript:alert(1)']) assert.equal(C.isChatterHigh(url), false);
});

test('answer delay defaults to fastest and validates bounded milliseconds', () => {
  assert.equal(C.settings().answerDelayMs, 0);
  assert.equal(C.settings({answerDelayMs:'2000'}).answerDelayMs, 2000);
  assert.equal(C.settings({answerDelayMs:30000}).answerDelayMs, 30000);
  for (const answerDelayMs of [-1, 30001, 1.5, 'nope', Infinity, NaN]) assert.throws(() => C.settings({answerDelayMs}), /Answer delay/);
});
test('citation links reject executable schemes and credentials', () => {
  assert.equal(C.safeUrl('javascript:alert(1)'), null);
  assert.equal(C.safeUrl('data:text/html,test'), null);
  assert.equal(C.safeUrl('https://user:pass@example.org'), null);
  assert.equal(C.safeUrl('https://example.org/a'), 'https://example.org/a');
});
test('decisions reject hallucinated IDs, duplicates, personal and uncertain answers', () => {
  assert.equal(C.validateDecision(good, q, .85), good);
  for (const change of [
    { personal: true }, { confidence: .5 }, { confidence: NaN }, { confidence: 1.2 },
    { optionIds: [] }, { optionIds: ['o2'] }, { optionIds: ['o1', 'o1'] }, { optionIds: ['o0', 'o1'] }
  ]) assert.throws(() => C.validateDecision({ ...good, ...change }, q, .85));
  assert.doesNotThrow(() => C.validateDecision({ ...good, optionIds: ['o0', 'o1'] }, { ...q, multiple: true }, .85));
});
test('Responses text handles tool output, refusals and truncation', () => {
  const response = { status: 'completed', output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'answer' }] }] };
  assert.equal(C.outputText(response), 'answer');
  assert.throws(() => C.outputText({ ...response, status: 'incomplete' }), /did not complete/);
  assert.throws(() => C.outputText({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Declined' }] }] }), /Declined/);
  assert.throws(() => C.outputText({ status: 'completed', output: [] }), /no answer/);
});

test('confidence review explains the actual threshold and preserves independent check scores',()=>{
  const value={...good,confidence:.9,crossChecked:true,verification:{primaryConfidence:.98,independentConfidence:.9}};
  assert.throws(()=>C.validateDecision(value,q,.95),error=>{
    assert.equal(error.code,'LOW_CONFIDENCE');assert.match(error.message,/90%.*95%/);
    assert.equal(error.details.minimumConfidence,.95);assert.equal(error.details.verification.independentConfidence,.9);
    assert.ok(!error.message.includes(good.explanation));return true;
  });
  assert.doesNotThrow(()=>C.validateDecision(value,q,.9));
});
test('citations are deduplicated and sanitized', () => {
  const note = { type: 'url_citation', url: 'https://example.org', title: 'Official source' };
  assert.deepEqual(C.citations({ output: [{ content: [{ annotations: [note, note, { ...note, url: 'javascript:void(0)' }] }] }] }), [{ url: note.url, title: note.title }]);
});
