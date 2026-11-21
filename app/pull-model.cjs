const { pullModel, DEFAULT_MODEL } = require('./ollama.cjs');
const model = process.argv[2] || DEFAULT_MODEL;
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
let last = '';
pullModel(model, undefined, { signal: controller.signal, onProgress: item => {
  const percent = item.total ? `${Math.floor((item.completed || 0) / item.total * 100)}%` : '';
  const message = `${item.status} ${percent}`.trim();
  if (message !== last) { console.log(message); last = message; }
} }).catch(error => { console.error(error.message); process.exitCode = 1; });
