// Capture Chrome's install event before the app's module graph loads.
(() => {
  const key='orbit-app-installed-v1';
  let installed=false;
  try { installed=localStorage.getItem(key)==='1'; } catch {}
  if(typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches){installed=true;try{localStorage.setItem(key,'1');}catch{}};
  const state=window.OrbitInstallPrompt={event:null,installed};
  state.setInstalled=value=>{
    state.installed=value;
    try{if(value)localStorage.setItem(key,'1');else localStorage.removeItem(key);}catch{}
    dispatchEvent(new Event('orbit-install-change'));
  };
  addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();state.event=event;
    // Chrome offering installation again is evidence that it was uninstalled.
    state.setInstalled(false);
  });
  addEventListener('appinstalled',()=>{state.event=null;state.setInstalled(true);});
})();
