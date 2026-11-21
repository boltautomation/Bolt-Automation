globalThis.chrome = { runtime: { id: 'test-extension', onMessage: { addListener(listener) { globalThis.contentListener = listener; } } } };
