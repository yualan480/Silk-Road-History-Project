export const HOME_THEMES = [
  {id:'home_aurora',name:'Aurora',price:10000,look:'aurora',description:'Emerald skies and cool mint accents.'},
  {id:'home_sunset',name:'Solar Sunset',price:12000,look:'sunset',description:'Warm amber light and coral highlights.'},
  {id:'home_rose',name:'Rose Nebula',price:15000,look:'rose',description:'Pink nebula clouds and violet panels.'},
  {id:'home_arctic',name:'Arctic',price:10000,look:'arctic',description:'Icy blue light with soft silver accents.'}
];
export function createHomeThemes({S,sb,toast,modal,setOrbits}) {
  let owned=new Set(),equipped=null,available=new Map(),loaded=false,loading=null,busy=false,host=null,preview=null;
  const root=document.documentElement;
  function apply(look){if(look)root.dataset.orbitHomeTheme=look;else delete root.dataset.orbitHomeTheme;}
  const selected=()=>HOME_THEMES.find(t=>t.id===equipped)?.look;
  function restore(){preview=null;apply(selected());}
  async function load(){
    if(loading)return loading;
    loading=(async()=>{try{
      const [items,inventory]=await Promise.all([
        sb.from('shop_items').select('id,price,active').in('id',HOME_THEMES.map(t=>t.id)),
        sb.from('shop_inventory').select('item_id,equipped').eq('user_id',S.me.id)
      ]);
      if(items.error||inventory.error)throw Error('Could not load your themes.');
      available=new Map((items.data||[]).filter(t=>t.active&&Number.isInteger(t.price)&&t.price>=10000).map(t=>[t.id,t]));
      owned=new Set((inventory.data||[]).map(t=>t.item_id));
      equipped=(inventory.data||[]).find(t=>t.equipped&&HOME_THEMES.some(x=>x.id===t.item_id))?.item_id||null;
      loaded=true;if(!preview)apply(selected());draw();
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
  function draw(){
    if(!host?.isConnected)return;
    const panel=host.querySelector('.home-theme-panel');if(!panel)return;
    const defaultButton=`<button type="button" data-theme-default ${busy||!loaded?'disabled':''}>${equipped?'Use original Orbit':'Original Orbit · current'}</button>`;
    panel.innerHTML=`<h3>Make Orbit yours</h3><p>Preview a look. Purchased themes are saved to your account.</p>${!loaded?'<p role="status">Loading unavailable. You can still preview themes.</p><button type="button" data-theme-retry>Retry loading</button>':''}${defaultButton}<div class="home-theme-grid">${HOME_THEMES.map(t=>{
      const item=available.get(t.id),price=item?.price||t.price,mine=owned.has(t.id);
      return `<article><div class="home-theme-swatch" data-look="${t.look}" aria-hidden="true"><span>orbit</span></div><h4>${t.name}</h4><p>${t.description}</p><small>${mine?'Owned':price.toLocaleString()+' Orbits'}</small><div class="home-theme-actions"><button type="button" data-theme-preview="${t.id}" aria-pressed="${preview===t.look}">Preview</button><button type="button" data-theme-use="${t.id}" ${busy||!loaded||(!mine&&!item)?'disabled':''}>${equipped===t.id?'Equipped':mine?'Apply':'Buy'}</button></div></article>`;
    }).join('')}</div><p class="home-theme-preview" role="status">${preview?'Preview only — not purchased. Close to restore your theme.':!available.size&&loaded?'Purchases will be available once the theme catalog is enabled.':'Themes start at 10,000 Orbits.'}</p>`;
    panel.querySelector('[data-theme-retry]')?.addEventListener('click',load);
    panel.querySelector('[data-theme-default]').onclick=()=>{restore();if(equipped)equip(null);else draw();};
    panel.querySelectorAll('[data-theme-preview]').forEach(b=>b.onclick=()=>{preview=HOME_THEMES.find(t=>t.id===b.dataset.themePreview).look;apply(preview);draw();});
    panel.querySelectorAll('[data-theme-use]').forEach(b=>b.onclick=()=>{const t=HOME_THEMES.find(t=>t.id===b.dataset.themeUse);if(owned.has(t.id))equip(t.id);else buy(t);});
  }
  function mount(container){
    const wasOpen=!!host?.querySelector('details')?.open;
    host=container;host.innerHTML='<details class="home-theme-picker"><summary>Themes <span aria-hidden="true">⌄</span></summary><section class="home-theme-panel" aria-label="Orbit themes"></section></details>';
    const details=host.querySelector('details');details.open=wasOpen;if(!wasOpen)restore();details.addEventListener('toggle',()=>{if(!details.open)restore();else draw();});
    host.onkeydown=e=>{if(e.key==='Escape'){details.open=false;restore();host.querySelector('summary').focus();}};
    draw();if(!loaded)load();else if(!preview)apply(selected());
  }
  const outside=e=>{if(host?.isConnected&&!e.composedPath().includes(host)){host.querySelector('details').open=false;restore();}};
  document.addEventListener('click',outside);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&host?.isConnected&&host.querySelector('details').open){host.querySelector('details').open=false;restore();host.querySelector('summary').focus();}});
  return {mount,close:()=>{if(host?.isConnected)host.querySelector('details').open=false;restore();},reset:()=>{owned.clear();equipped=null;available.clear();loaded=false;restore();}};
}
