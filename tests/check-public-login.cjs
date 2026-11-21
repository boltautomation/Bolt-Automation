const { Browser } = require('../app/browser.cjs');
(async () => {
  const browser = new Browser({ headless: true });
  const signal = new AbortController().signal;
  try {
    await browser.launch(signal); await browser.navigate('https://chatterhigh.com/en/users/sign_in', signal);
    const info = await browser.evaluate(() => {
      const visible = element => element.getClientRects().length > 0;
      const forms = [...document.forms].filter(form => [...form.querySelectorAll('input[type=password]')].some(visible));
      return { title: document.title, signInForms: forms.length, emailFields: forms.flatMap(form => [...form.querySelectorAll('input[type=email],input[name*="email"]')].filter(visible).map(input => input.name)),
        passwordFields: forms.flatMap(form => [...form.querySelectorAll('input[type=password]')].filter(visible).map(input => input.name)) };
    });
    if (!info.signInForms || !info.emailFields.length || !info.passwordFields.length) throw new Error('The public login form was not detected.');
    console.log(JSON.stringify(info)); console.log('PASS detected real public login form; no credentials were entered or submitted');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
