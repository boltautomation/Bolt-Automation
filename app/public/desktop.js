(()=>{
 const desktop=window.boltDesktop;if(!desktop)return;
 document.documentElement.classList.add('desktop','platform-'+desktop.platform);
 const bar=document.getElementById('window-chrome');bar.hidden=false;
 const minimize=document.getElementById('window-minimize'),maximize=document.getElementById('window-maximize'),close=document.getElementById('window-close');
 minimize.onclick=()=>desktop.minimize();maximize.onclick=()=>desktop.maximize();close.onclick=()=>desktop.close();
 document.getElementById('shutdown').onclick=()=>desktop.close();
 // Keep the native window controls usable while the onboarding dialog is modal.
 const tour=document.getElementById('quick-tour');
 const placeBar=()=>{if(tour.open)tour.append(bar);else document.body.prepend(bar);};
 new MutationObserver(placeBar).observe(tour,{attributes:true,attributeFilter:['open']});placeBar();
 desktop.onState(state=>{maximize.setAttribute('aria-label',state.maximized?'Restore window':'Maximize window');maximize.title=state.maximized?'Restore':'Maximize';document.documentElement.dataset.maximized=String(state.maximized);document.getElementById('window-title').textContent=state.title||'Bolt';});
 desktop.ready();
})();
