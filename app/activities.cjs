const { setTimeout: wait } = require('node:timers/promises');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
function activityUrl(browser, value) {
  if (!browser.allowed(value) || /sign_out|logout|sign_in|sign_up/i.test(new URL(value).pathname)) throw new Error('Enter a ChatterHigh quiz or module link.');
  return value;
}
function navigationLink(info, mode, browser) {
  const candidates = info.links.filter(link => browser.allowed(link.url) && !/sign_out|logout/i.test(link.url));
  const pattern = mode === 'daily' ? /daily\s*quiz|quiz\s*quotidien|^quiz$|^continue quiz$/i : /mindful\s*modules|^modules$|modules\s*(de pleine conscience)?$/i;
  return candidates.filter(link => pattern.test(link.text)).sort((a, b) => {
    const score = link => (/^(take|start|resume|begin|do)\b/i.test(link.text) ? 10 : 0) + (/campaign_quiz/.test(link.url) ? 5 : 0) + (/quiz|module/i.test(new URL(link.url).pathname) ? 2 : 0);
    return score(b) - score(a);
  })[0];
}
function moduleLinks(info, browser) {
  const unique = new Map();
  for (const link of info.links) {
    if (!browser.allowed(link.url)) continue;
    const route = new URL(link.url).pathname;
    const title = clean(/^(start|begin|resume|continue|view)( module| course| lesson)?$/i.test(link.text) ? link.heading || link.text : link.text);
    if (!/(module|course|lesson|learning_path)/i.test(route) || !title || /^(mindful modules?|modules?|learn more|home|back|next|previous|log out)$/i.test(title)) continue;
    if (/\/(mindful_modules|modules|courses)\/?$/.test(route)) continue;
    if (/sign_out|sign_in|sign_up|logout/.test(route)) continue;
    if (!unique.has(link.url)) unique.set(link.url, { id: link.url, title, url: link.url, completed: /\bcompleted?\b/i.test(link.card) });
  }
  return [...unique.values()].slice(0, 200);
}
async function modules(browser, signal) {
  if (browser.catalog) return browser.catalog(signal);
  let info = await browser.info();
  const link = navigationLink(info, 'modules', browser);
  if (link && link.url !== info.url) { await browser.navigate(link.url, signal); info = await browser.info(); }
  return moduleLinks(info, browser);
}
async function openActivity(browser, { mode, module, url, config }, signal) {
  if (url) await browser.navigate(activityUrl(browser, url), signal);
  else if (mode === 'modules') {
    if (!module) throw new Error('Choose a module from the list, or paste its ChatterHigh link.');
    const target=activityUrl(browser,module.url);
    if(browser.followLink)await browser.followLink(target,signal);else await browser.navigate(target,signal);
  } else {
    const info = await browser.info(); const link = navigationLink(info, 'daily', browser);
    if (link && link.url !== info.url) { if(browser.followLink)await browser.followLink(link.url,signal);else await browser.navigate(link.url,signal); }
  }
  const visited = new Set();
  for (let attempt = 0; attempt < 30; attempt++) {
    signal.throwIfAborted();
    const page = await browser.quiz({ action: 'scan', config },signal);
    if (page.questions.length || page.complete) return page;
    const info = await browser.info();
    const button = info.buttons.find(label => /^(start|begin|resume|continue)( (the|my|this))?( (daily )?quiz| module| lesson| activity)?[.!→›»]*$/i.test(label));
    const startLinks = info.links.filter(link => browser.allowed(link.url) && link.url !== info.url && !link.url.startsWith(info.url.split('#')[0] + '#') && /^(take|start|begin|resume|continue)( (the|my|this))?( (daily )?quiz| module| lesson| activity)?[.!→›»]*$/i.test(link.text));
    const key = `${info.url}|${button || startLinks[0]?.url || ''}`;
    if (!visited.has(key)) {
      visited.add(key);
      if (button) await browser.clickButton(button, signal);
      else if (startLinks.length === 1) { if(browser.followLink)await browser.followLink(startLinks[0].url,signal);else await browser.navigate(startLinks[0].url,signal); }
    }
    await wait(500, undefined, { signal });
  }
  throw new Error('Open the selected quiz/module question in the automation browser, then click Continue in app. You can also provide its activity link.');
}
module.exports = { activityUrl, navigationLink, moduleLinks, modules, openActivity };
