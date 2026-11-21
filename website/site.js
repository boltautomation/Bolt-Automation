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
