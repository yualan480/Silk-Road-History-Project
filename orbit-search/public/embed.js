const button=document.querySelector('#fullscreen');
const sync=()=>{button.textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';button.setAttribute('aria-pressed',String(!!document.fullscreenElement));};
button.onclick=()=>{try{const result=document.fullscreenElement?document.exitFullscreen?.():document.documentElement.requestFullscreen?.();result?.catch(()=>{});}catch{}};
document.addEventListener('fullscreenchange',sync);sync();
