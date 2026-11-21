const {Browser}=require('./browser.cjs');
const {publicUrl}=require('./sources.cjs');
function researchUrl(value){const url=publicUrl(value);if(/(^|\.)chatterhigh\.(com|io)$/i.test(url.hostname))throw new Error('This manual research browser is for independent source websites.');return url.href;}
function declineCookies({skipChoices=[],plan=false}={}){
  const visible=el=>el?.isConnected&&!el.disabled&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const label=el=>String(el.innerText||el.value||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().replace(/[.!]$/,'');
  const reject=/^(reject|decline|reject all(?: cookies)?|decline all(?: cookies)?|reject (?:optional|non-essential) cookies|(?:use |allow )?(?:only )?(?:necessary|essential)(?: cookies)?(?: only)?|continue without accepting|tout refuser|refuser (?:tous les cookies|les cookies non essentiels))$/i;
  const known=[...document.querySelectorAll('#onetrust-reject-all-handler,#CybotCookiebotDialogBodyButtonDecline')].filter(visible);
  const scopes=[...document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[role=dialog],[aria-modal=true]')].filter(el=>!el.matches('html,body')&&visible(el)&&/cookie|consent|tracking|privacy|témoins/i.test(el.innerText||el.id));
  const buttons=[...new Set([...known,...scopes.flatMap(scope=>[...scope.querySelectorAll('button,[role=button],input[type=button],input[type=submit]')])])];
  const button=buttons.find(button=>visible(button)&&reject.test(label(button))&&!skipChoices.includes(label(button)));
  if(!button)return {clicked:false};const choice=label(button);
  if(plan){globalThis.__boltCookieReject=button;return {available:true,choice};}
  button.click();return {clicked:true,choice};
}
class ResearchPrivacy{
  constructor({factory=()=>new Browser(),validate=researchUrl}={}){Object.assign(this,{factory,validate});this.count=0;this.message='No research browser open.';}
  snapshot(){return {open:Boolean(this.browser&&this.browser.alive!==false),rejected:this.count,message:this.message};}
  async open(value,reject=false){
    const url=this.validate(value);if(this.opening)throw new Error('The research browser is already opening.');this.opening=true;
    await this.close();const browser=this.factory();browser.origins=[new URL(url).origin];this.browser=browser;this.lastUrl='';this.choices=[];
    try{const signal=AbortSignal.timeout(30000);await browser.launch(signal);await browser.navigate(url,signal);this.count=0;this.reject=reject===true;this.message=this.reject?'Rejecting explicit optional-cookie prompts. Other browsing is manual.':'Manual research browser open.';this.tick();return this.snapshot();}
    catch(error){await this.close();throw error;}finally{this.opening=false;}
  }
  async tick(){
    const browser=this.browser;if(!browser||browser.alive===false)return;
    try{const url=this.validate(await browser.url());if(url!==this.lastUrl){this.lastUrl=url;this.choices=[];}if(this.reject){const result=await browser.evaluate(declineCookies,{skipChoices:this.choices||[]},{requireSite:false});if(result?.clicked&&this.browser===browser){this.choices.push(result.choice);this.count++;this.message=`Cookie choice: ${result.choice}.`;}}}catch{this.message='Automatic cookie choices are unavailable on this page. Handle its prompt manually.';}
    if(this.browser===browser){this.timer=setTimeout(()=>this.tick(),1500);this.timer.unref();}
  }
  async close(){clearTimeout(this.timer);const browser=this.browser;this.browser=null;if(browser)await browser.close();this.message='Research browser closed.';}
}
module.exports={ResearchPrivacy,declineCookies,researchUrl};
