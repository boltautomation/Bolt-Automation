(async () => {
  const $ = id => document.getElementById(id);
  const state = globalThis.testState;
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  async function until(predicate) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Timed out waiting for dashboard');
  }
  try {
    await until(() => $('tab').value === '1');
    assert($('apiKey').value === '', 'unexpected initial key');
    results.push('PASS dashboard initializes settings and quiz tabs');
    $('inspect').click();
    await until(() => !$('start').disabled);
    assert(state.calls.length === 0 && state.actions.join() === 'scan', 'inspect changed page or called API');
    assert($('log').textContent.includes('Ottawa'), 'inspection options missing');
    results.push('PASS inspection displays quiz choices without API or DOM mutations');
    $('apiKey').value = 'fake-test-key'; $('autoSubmit').checked = false;
    $('settings').requestSubmit();
    await until(() => !$('start').disabled);
    assert($('status').textContent.includes('Answers filled'), 'review did not finish');
    assert(state.calls.length === 2, 'expected research and decision requests');
    assert(!state.actions.includes('submit'), 'review submitted answers');
    assert(state.session.apiKey === 'fake-test-key' && !JSON.stringify(state.local).includes('fake-test-key'), 'key persisted to disk settings');
    assert($('log').querySelector('a').href === 'https://www.canada.ca/', 'citation not rendered');
    results.push('PASS review fills answers, shows citations, and keeps API key in session memory');
    $('autoSubmit').checked = true;
    $('settings').requestSubmit();
    await until(() => !$('start').disabled);
    assert($('status').textContent.includes('Quiz completed') && state.actions.filter(action => action === 'submit').length === 1, 'automatic run did not submit exactly once');
    results.push('PASS automatic run submits once and reports completion');
    state.complete = false; state.pending = true;
    const before = state.calls.length, mutations = state.actions.filter(action => action !== 'scan').length;
    $('settings').requestSubmit();
    await until(() => state.calls.length > before);
    $('stop').click();
    await until(() => !$('start').disabled);
    assert($('status').textContent.startsWith('Stopped.'), 'stop status missing');
    assert(state.actions.filter(action => action !== 'scan').length === mutations, 'stop allowed a mutation');
    results.push('PASS dashboard Stop aborts active research before page changes');
    $('forget').click();
    await until(() => $('apiKey').value === '');
    assert(!state.session.apiKey, 'key not forgotten');
    results.push('PASS Forget API key clears memory and the input');
    // Leave a successful sample run visible for screenshot inspection.
    state.pending = false; $('apiKey').value = 'fake-test-key';
    $('settings').requestSubmit();
    await until(() => !$('start').disabled);
  } catch (error) { results.push(`FAIL ${error.message}`); }
  const pre = document.createElement('pre'); pre.id = 'results'; pre.textContent = results.join('\n'); pre.hidden = true;
  document.body.append(pre);
  document.documentElement.dataset.testResult = results.some(line => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
})();
