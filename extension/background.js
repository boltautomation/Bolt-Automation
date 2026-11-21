chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("dashboard.html");
  const existing = (await chrome.tabs.query({})).find(tab => tab.url === url);
  if (existing) await chrome.tabs.update(existing.id, { active: true });
  else await chrome.tabs.create({ url });
});
