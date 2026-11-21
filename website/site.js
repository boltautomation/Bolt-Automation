const menuButton=document.querySelector('.menu-toggle');
const navigation=document.getElementById('navigation');
function closeMenu(){navigation.dataset.open='false';menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';navigation.dataset.open=String(open);menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus();}});
document.addEventListener('pointerdown',event=>{if(!navigation.contains(event.target)&&!menuButton.contains(event.target))closeMenu();});
const tabs=[...document.querySelectorAll('[role=tab]')];
function selectTab(tab,{focus=false}={}){for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;}if(focus)tab.focus();}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];if(event.key==='Home')next=tabs[0];if(event.key==='End')next=tabs.at(-1);if(next){event.preventDefault();selectTab(next,{focus:true});}});});
const pace=document.getElementById('demo-pace'),paceValue=document.getElementById('demo-pace-value');
function updatePace(){paceValue.value=Number(pace.value)===0?'No pause':pace.value+' seconds';pace.setAttribute('aria-valuetext',paceValue.value);}
pace.addEventListener('input',updatePace);updatePace();
document.getElementById('year').textContent=String(new Date().getFullYear());

// One animation frame loop per visible card, only while its tilt is settling.
const hoverMotion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
document.querySelectorAll('[data-parallax]').forEach(surface => {
  const card = surface.querySelector('.screenshot-window');
  let frame = 0, previousTime = 0;
  let currentX = 0, currentY = 0, targetX = 0, targetY = 0;

  function paint() {
    card.style.setProperty('--tilt-x', currentX.toFixed(3) + 'deg');
    card.style.setProperty('--tilt-y', currentY.toFixed(3) + 'deg');
  }
  function animate(time) {
    frame = 0;
    const elapsed = Math.min(40, time - previousTime || 16);
    previousTime = time;
    const easing = 1 - Math.exp(-elapsed / 70);
    currentX += (targetX - currentX) * easing;
    currentY += (targetY - currentY) * easing;
    const moving = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .01;
    if (!moving) { currentX = targetX; currentY = targetY; }
    paint();
    if (moving) frame = requestAnimationFrame(animate);
  }
  function schedule() {
    if (!frame) { previousTime = performance.now(); frame = requestAnimationFrame(animate); }
  }
  function reset() {
    targetX = targetY = 0;
    if (hoverMotion.matches) schedule();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
      currentX = currentY = 0;
      paint();
    }
  }
  surface.addEventListener('pointermove', event => {
    if (!hoverMotion.matches || event.pointerType === 'touch') return;
    const box = surface.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
    targetX = -y * 1.6;
    targetY = x * 2.2;
    schedule();
  }, { passive: true });
  surface.addEventListener('pointerleave', reset);
  surface.addEventListener('pointercancel', reset);
  window.addEventListener('blur', reset);
  hoverMotion.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
});
