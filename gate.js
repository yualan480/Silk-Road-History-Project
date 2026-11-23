// The explicit Orbit entry skips the history front page; account authentication
// still runs in chat/app.js. Other routes keep their existing Morse navigation.
try {
  const page=new URL(location.href);
  const directOrbit=page.searchParams.get('entry')==='orbit'&&/\/chat\/(?:index\.html)?$/.test(page.pathname);
  if(directOrbit) {
    localStorage.setItem('stg_ok','1');
  } else {
    const root=new URL('../',document.currentScript.src).href;
    if(localStorage.getItem('stg_ok')!=='1')location.replace(root);
    else if(top===self) {
      const view=location.pathname.includes('/chat/')?'chat':'games';
      sessionStorage.setItem('stg_fwd',JSON.stringify({v:view,u:location.pathname.split('/').pop()+location.search+location.hash}));
      location.replace(root+'#/'+view);
    }
  }
} catch {}
