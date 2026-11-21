const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../extension/core.js');
require('../extension/api.js');
const Solver = globalThis.ChatterSolver;
function output(text, annotations = []) { return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations }] }] }; }
const question = { id: 'q0', text: 'Which?', options: [{ id: 'o0', text: 'A' }, { id: 'o1', text: 'B' }], multiple: false, links: [] };
test('solver researches then extracts an exact structured decision', async () => {
  const requests = [];
  const mock = [output('B is supported.', [{ type: 'url_citation', url: 'https://example.org', title: 'Source' }]), output(JSON.stringify({ optionIds: ['o1'], confidence: .95, personal: false, explanation: 'Verified B.' }))];
  const solver = new Solver({ apiKey: 'test-secret', model: 'test-model', fetcher: async (url, request) => {
    requests.push({ url, request, body: JSON.parse(request.body) });
    return { ok: true, json: async () => mock.shift() };
  } });
  let research;
  const answer = await solver.solve(question, new AbortController().signal, value => { research = value; });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].request.headers.Authorization, 'Bearer test-secret');
  for (const { body } of requests) { assert.equal(body.store, false); assert.equal(body.model, 'test-model'); assert.ok(!JSON.stringify(body).includes('test-secret')); }
  assert.equal(requests[0].body.tool_choice, 'required');
  assert.equal(requests[0].body.tools[0].type, 'web_search');
  assert.equal(requests[1].body.text.format.strict, true);
  assert.deepEqual(requests[1].body.text.format.schema.properties.optionIds.items.enum, ['o0', 'o1']);
  assert.equal(answer.optionIds[0], 'o1'); assert.equal(answer.sources.length, 1); assert.equal(research.evidence, 'B is supported.');
});
test('API errors do not expose arbitrary response data', async () => {
  const solver = new Solver({ apiKey: 'secret', model: 'test', fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'secret' } }) }) });
  await assert.rejects(solver.solve(question, new AbortController().signal), error => /401/.test(error.message) && !error.message.includes('secret'));
});
test('solver rejects incomplete research before making a decision request', async () => {
  let calls = 0;
  const solver = new Solver({ apiKey: 'test', model: 'test', fetcher: async () => { calls++; return { ok: true, json: async () => ({ status: 'incomplete', output: [] }) }; } });
  await assert.rejects(solver.solve(question, new AbortController().signal), /did not complete/); assert.equal(calls, 1);
});
test('cancelling interrupts the API request', async () => {
  const controller = new AbortController();
  const solver = new Solver({ apiKey: 'test', model: 'test', fetcher: async (url, { signal }) => {
    controller.abort(new DOMException('Stop', 'AbortError')); signal.throwIfAborted();
  } });
  await assert.rejects(solver.solve(question, controller.signal), { name: 'AbortError' });
});
