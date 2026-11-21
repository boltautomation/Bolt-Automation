(async () => {
  const origin = 'http://127.0.0.1:43117';
  const html = await (await fetch(origin)).text();
  const token = html.match(/name="app-token" content="([^"]+)"/)?.[1];
  if (!token) throw new Error('Could not read the app session.');
  const headers = { 'X-App-Token': token, 'Content-Type': 'application/json' };
  const state = await (await fetch(`${origin}/api/state`, { headers })).json();
  if (state.busy || state.connected) throw new Error('The existing app is active; left it running.');
  await fetch(`${origin}/api/shutdown`, { method: 'POST', headers, body: '{}' });
  console.log('Idle app stopped for restart.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
