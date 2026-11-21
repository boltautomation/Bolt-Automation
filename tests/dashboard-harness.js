(() => {
  const state = globalThis.testState = { session: {}, local: {}, calls: [], actions: [], complete: false, pending: false };
  const area = name => ({
    get: async key => ({ [key]: state[name][key] }),
    set: async values => Object.assign(state[name], values),
    remove: async key => { delete state[name][key]; }
  });
  globalThis.chrome = {
    storage: { local: area('local'), session: area('session') },
    tabs: {
      query: async () => [{ id: 1, title: 'Sample Daily Quiz', url: 'https://chatterhigh.com/en/quiz' }],
      get: async () => ({ url: 'https://chatterhigh.com/en/quiz' }),
      sendMessage: async (id, message) => {
        state.actions.push(message.action);
        if (message.action === 'scan') return { ok: true, result: {
          fingerprint: state.complete ? 'complete' : 'sample-question', complete: state.complete,
          nextCount: 0, submitCount: 1, message: state.complete ? 'Quiz completed.' : '1 question found.',
          questions: state.complete ? [] : [{ id: 'q0', text: 'Which city is the capital of Canada?', multiple: false,
            options: [{ id: 'o0', text: 'Toronto' }, { id: 'o1', text: 'Ottawa' }], links: [] }]
        } };
        if (message.action === 'submit') state.complete = true;
        return { ok: true, result: { ok: true } };
      }
    }
  };
  globalThis.fetch = async (url, request) => {
    const body = JSON.parse(request.body); state.calls.push(body);
    if (state.pending) return new Promise((resolve, reject) => {
      if (request.signal.aborted) reject(request.signal.reason);
      else request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
    });
    const text = body.tools ? 'The Government of Canada identifies Ottawa as the national capital.' : JSON.stringify({ optionIds: ['o1'], confidence: .98, personal: false, explanation: 'The official Canadian government source identifies Ottawa as the capital.' });
    const annotations = body.tools ? [{ type: 'url_citation', url: 'https://www.canada.ca/', title: 'Government of Canada' }] : [];
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations }] }] }) };
  };
})();
