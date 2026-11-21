// Page-side helpers for ChatterHigh's earned-badge overlay, not arbitrary modals.
function achievementCloseTarget({inspect=false,key}={}){
  const visible=element=>element?.isConnected&&!element.closest('[hidden],[inert],[aria-hidden="true"]')&&element.getClientRects().length&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden'&&Number(getComputedStyle(element).opacity)!==0;
  for(const badge of document.querySelectorAll('.unseen-badges .unseen-badge')){
    if(!visible(badge)||badge.classList.contains('seen')||key&&badge.dataset.link!==key)continue;
    let link;
    try{link=new URL(badge.dataset.link,location.href);}catch{continue;}
    if(link.origin!==location.origin||!/\/student_badges\/\d+\/seen\/?$/.test(link.pathname))continue;
    const title=(badge.querySelector(':scope > .header')?.textContent||'').replace(/\s+/g,' ').trim();
    if(!/^(?:Level|Niveau)\s*\d+\b/i.test(title)||!badge.querySelector('.zbadge,[class*="badge-large-"]'))continue;
    const close=badge.querySelector(':scope > .exit');
    if(!visible(close))continue;
    const rect=close.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    if(hit!==close&&!close.contains(hit))continue;
    return inspect?{key:badge.dataset.link,title}:close;
  }
  return null;
}
function achievementStillOpen(key){
  return [...document.querySelectorAll('.unseen-badges .unseen-badge')].some(badge=>badge.dataset.link===key&&badge.getClientRects().length&&getComputedStyle(badge).visibility!=='hidden'&&getComputedStyle(badge).display!=='none'&&Number(getComputedStyle(badge).opacity)!==0);
}
module.exports={achievementCloseTarget,achievementStillOpen};
