export const HOME_THEMES = [
  {id:'home_aurora',name:'Aurora',price:10000,look:'aurora',description:'Emerald skies and cool mint accents.'},
  {id:'home_sunset',name:'Solar Sunset',price:12000,look:'sunset',description:'Warm amber light and coral highlights.'},
  {id:'home_rose',name:'Rose Nebula',price:15000,look:'rose',description:'Pink nebula clouds and violet panels.'},
  {id:'home_arctic',name:'Arctic',price:10000,look:'arctic',description:'Icy blue light with soft silver accents.'}
];
export function createHomeThemes({S,sb,toast,modal,setOrbits}) {
  let catalog=[...HOME_THEMES];
  const hex=v=>/^#[0-9a-f]{6}$/i.test(v||'');
  let owned=new Set(),equipped=null,available=new Map(),loaded=false,loading=null,busy=false,host=null,preview=null,generation=0;
  const root=document.documentElement;
  function apply(look,colors){if(look)root.dataset.orbitHomeTheme=look;else delete root.dataset.orbitHomeTheme;if(look==='custom'&&colors&&hex(colors.c1)&&hex(colors.c2)){root.style.setProperty('--oh-primary',colors.c1);root.style.setProperty('--oh-secondary',colors.c2);}else{root.style.removeProperty('--oh-primary');root.style.removeProperty('--oh-secondary');}}
  const selected=()=>catalog.find(t=>t.id===equipped)?.look;
  function restore(){preview=null;apply(selected(),catalog.find(t=>t.id===equipped));}
  async function load(){
    if(loading)return loading;
    const requestGeneration=generation;
    loading=(async()=>{try{
      const [items,inventory]=await Promise.all([
        sb.from('shop_items').select('id,price,active,kind,art').eq('kind','orbit_theme'),
        sb.from('shop_inventory').select('item_id,equipped').eq('user_id',S.me.id)
      ]);
      if(requestGeneration!==generation)return;
      if(items.error||inventory.error)throw Error('Could not load your themes.');
      available=new Map((items.data||[]).filter(t=>t.active&&Number.isInteger(t.price)&&t.price>=10000).map(t=>[t.id,t]));
      owned=new Set((inventory.data||[]).map(t=>t.item_id));
      catalog=[...HOME_THEMES,...(items.data||[]).filter(t=>owned.has(t.id)&&/^hc_[a-f0-9]{21}$/.test(t.id)&&t.art?.home==='custom'&&hex(t.art.c1)&&hex(t.art.c2)).map(t=>({id:t.id,name:'My custom colors',price:20000,look:'custom',description:'Your saved color palette.',c1:t.art.c1,c2:t.art.c2}))];
      equipped=(inventory.data||[]).find(t=>t.equipped&&catalog.some(x=>x.id===t.item_id))?.item_id||null;
      loaded=true;if(!preview)apply(selected(),catalog.find(t=>t.id===equipped));draw();
    }catch{loaded=false;draw();}finally{loading=null;}})();return loading;
  }
  async function equip(id){
    if(busy)return;busy=true;draw();
    try{const {error}=await sb.rpc('equip_shop_item',{p_item:id||equipped,p_on:!!id});if(error)throw error;equipped=id;restore();draw();}
    catch(e){toast(e.message||'Could not apply theme.',true);}finally{busy=false;draw();}
  }
  function buy(t){
    const item=available.get(t.id);if(!item||busy)return;
    modal('Buy '+t.name+'?',`<p>This Orbit theme costs <b>${item.price.toLocaleString()} Orbits</b>. It will be saved to your account.</p>`,[
      {label:'Cancel',cls:'ghost'}, {label:'Buy theme',fn:async()=>{
        if(busy)return false;
        if((S.orbits||0)<item.price){toast('You need '+(item.price-(S.orbits||0)).toLocaleString()+' more Orbits.',true);return false;}
        busy=true;draw();
        try{const {data,error}=await sb.rpc('buy_shop_item',{p_item:t.id});if(error)throw error;setOrbits(data);owned.add(t.id);toast(t.name+' is yours!');}
        catch(e){toast(e.message||'Purchase failed.',true);return false;}
        finally{busy=false;draw();}
        await equip(t.id);
      }}]);
  }
  function customColors(){
    const body='<p>Choose your own Orbit palette. Saving a new palette costs <b>20,000 Orbits</b>. Reapplying a palette you own is free.</p><div class="home-color-inputs"><label>Primary color<input id="home-primary" type="color" value="#35d6c4"></label><label>Secondary color<input id="home-secondary" type="color" value="#5430aa"></label></div><div id="home-color-preview" class="home-color-preview">Orbit · your colors</div>';
    modal('Customize Orbit colors',body,[{label:'Cancel',cls:'ghost'},{label:'Save · 20,000 Orbits',fn:async bg=>{
      if(busy)return false;
      const c1=bg.querySelector('#home-primary').value,c2=bg.querySelector('#home-secondary').value;
      if(!hex(c1)||!hex(c2)){toast('Choose valid colors.',true);return false;}
      if((S.orbits||0)<20000){toast('You need '+(20000-(S.orbits||0)).toLocaleString()+' more Orbits.',true);return false;}
      busy=true;draw();
      try{
        const {data,error}=await sb.rpc('buy_home_color_theme',{p_primary:c1,p_secondary:c2});
        if(error)throw error;
        setOrbits(data.balance);loaded=false;await load();restore();toast('Your custom Orbit colors are ready.');
      }catch(e){toast(e.message||'Could not save colors. Please try again.',true);return false;}
      finally{busy=false;draw();}
    }}],bg=>{
      const update=()=>{bg.querySelector('#home-color-preview').style.background=`linear-gradient(125deg,${bg.querySelector('#home-primary').value},${bg.querySelector('#home-secondary').value})`;};
      bg.querySelectorAll('input').forEach(input=>input.addEventListener('input',update));update();
    });
  }
  function draw(){
    if(!host?.isConnected)return;
    const panel=host.querySelector('.home-theme-panel');if(!panel)return;
    const defaultButton=`<button type="button" data-theme-default ${busy||!loaded?'disabled':''}>${equipped?'Use original Orbit':'Original Orbit · current'}</button>`;
    panel.innerHTML=`<h3>Make Orbit yours</h3><p>Preview a look. Purchased themes are saved to your account.</p>${!loaded?'<p role="status">Loading unavailable. You can still preview themes.</p><button type="button" data-theme-retry>Retry loading</button>':''}${defaultButton}<button type="button" data-theme-custom ${busy?'disabled':''}>Customize colors · 20,000 Orbits</button><div class="home-theme-grid">${catalog.map(t=>{
      const item=available.get(t.id),price=item?.price||t.price,mine=owned.has(t.id);
      return `<article><div class="home-theme-swatch" ${t.look==='custom'?`style="background:linear-gradient(125deg,${t.c1},${t.c2})"`:''} data-look="${t.look}" aria-hidden="true"><span>orbit</span></div><h4>${t.name}</h4><p>${t.description}</p><small>${mine?'Owned':price.toLocaleString()+' Orbits'}</small><div class="home-theme-actions"><button type="button" data-theme-preview="${t.id}" aria-pressed="${preview===t.look}">Preview</button><button type="button" data-theme-use="${t.id}" ${busy||!loaded||(!mine&&!item)?'disabled':''}>${equipped===t.id?'Equipped':mine?'Apply':'Buy'}</button></div></article>`;
    }).join('')}</div><p class="home-theme-preview" role="status">${preview?'Preview only — not purchased. Close to restore your theme.':!available.size&&loaded?'Purchases will be available once the theme catalog is enabled.':'Themes start at 10,000 Orbits.'}</p>`;
    panel.querySelector('[data-theme-custom]').onclick=customColors;
    panel.querySelector('[data-theme-retry]')?.addEventListener('click',load);
    panel.querySelector('[data-theme-default]').onclick=()=>{restore();if(equipped)equip(null);else draw();};
    panel.querySelectorAll('[data-theme-preview]').forEach(b=>b.onclick=()=>{const t=catalog.find(t=>t.id===b.dataset.themePreview);preview=t.look;apply(preview,t);draw();});
    panel.querySelectorAll('[data-theme-use]').forEach(b=>b.onclick=()=>{const t=catalog.find(t=>t.id===b.dataset.themeUse);if(owned.has(t.id))equip(t.id);else buy(t);});
  }
  function mount(container){
    const wasOpen=!!host?.querySelector('details')?.open;
    host=container;host.innerHTML='<details class="home-theme-picker"><summary>Themes <span aria-hidden="true">⌄</span></summary><section class="home-theme-panel" aria-label="Orbit themes"></section></details>';
    const details=host.querySelector('details');details.open=wasOpen;if(!wasOpen)restore();details.addEventListener('toggle',()=>{if(!details.open)restore();else draw();});
    host.onkeydown=e=>{if(e.key==='Escape'){details.open=false;restore();host.querySelector('summary').focus();}};
    draw();if(!loaded)load();else if(!preview)apply(selected(),catalog.find(t=>t.id===equipped));
  }
  const outside=e=>{if(host?.isConnected&&!e.composedPath().includes(host)){host.querySelector('details').open=false;restore();}};
  document.addEventListener('click',outside);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&host?.isConnected&&host.querySelector('details').open){host.querySelector('details').open=false;restore();host.querySelector('summary').focus();}});
  return {mount,close:()=>{if(host?.isConnected)host.querySelector('details').open=false;restore();},reset:()=>{generation++;catalog=[...HOME_THEMES];owned.clear();equipped=null;available.clear();loaded=false;restore();}};
}
