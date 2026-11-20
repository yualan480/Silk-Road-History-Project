// Supabase owns the expiry; this timer only displays the server's remaining time.
export async function signupWindowPanel({sb,toast}) {
  const initial=await sb.rpc('admin_signup_window_status');
  return {
    html:`<section class="maintcard" data-signup-window>
      <b>Temporary sign-ups without approval</b>
      <p class="muted">Let eligible students create an account without request approval for two minutes. Approval returns automatically, even if you close this page. Email and device rules still apply.</p>
      <p data-window-status role="status" aria-live="off"></p>
      <div class="inline-actions"><button type="button" class="btn" data-window-toggle>Open sign-ups for 2 minutes</button></div>
      <p class="muted" data-window-error hidden></p>
    </section>`,
    bind(el) {
      const card=el.querySelector('[data-signup-window]');
      const button=card.querySelector('[data-window-toggle]'),status=card.querySelector('[data-window-status]'),error=card.querySelector('[data-window-error]');
      let state=null,receivedAt=performance.now(),remainingAtReceipt=0,busy=false,stopped=false,refreshing=false,revision=0;
      function apply(result) {
        if(stopped)return;
        if(result.error){
          error.hidden=false;
          const missing=['PGRST202','42883'].includes(result.error.code)||/could not find.*function|does not exist/i.test(result.error.message||'');
          error.textContent=missing?'Set up this button by running migration-signup-approval-window.sql in the Orbit Chat Supabase SQL Editor.':result.error.message||'Could not load the signup window. Refresh to retry.';
          if(!state){button.disabled=true;status.textContent='Signup window unavailable.';}return;
        }
        state=result.data;receivedAt=performance.now();
        remainingAtReceipt=state?.open?Math.max(0,Date.parse(state.open_until)-Date.parse(state.server_now)):0;
        if(!Number.isFinite(remainingAtReceipt))remainingAtReceipt=0;
        error.hidden=true;paint();
      }
      function remaining(){return Math.max(0,remainingAtReceipt-(performance.now()-receivedAt));}
      function paint(){
        if(!state||stopped)return;
        const seconds=Math.ceil(remaining()/1000),open=seconds>0;
        status.textContent=open?`Approval paused · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`:'Approval required for new school accounts.';
        button.textContent=open?'Require approval now':'Open sign-ups for 2 minutes';
        button.disabled=busy;card.classList.toggle('on',open);
      }
      async function refresh(){
        if(stopped||refreshing||busy)return;refreshing=true;const version=revision;
        try{const result=await sb.rpc('admin_signup_window_status');if(version===revision)apply(result);}
        catch(e){if(version===revision)apply({error:{message:e.message}});}finally{refreshing=false;}
      }
      button.onclick=async()=>{
        if(busy||!state)return;
        const open=remaining()<=0;revision++;busy=true;paint();
        try{
          const result=await sb.rpc('admin_set_signup_window',{p_open:open});
          apply(result);if(!result.error)toast(open?'Sign-ups opened for two minutes.':'Signup approval restored.');
        }catch(e){apply({error:{message:e.message}});}finally{busy=false;paint();}
      };
      apply(initial);
      const tick=setInterval(()=>{
        const wasOpen=remainingAtReceipt>0;paint();
        if(wasOpen&&remaining()===0){remainingAtReceipt=0;void refresh();}
      },1000);
      const poll=setInterval(refresh,15000);
      const observer=new MutationObserver(()=>{if(!card.isConnected){stopped=true;clearInterval(tick);clearInterval(poll);observer.disconnect();}});
      observer.observe(document.body,{childList:true,subtree:true});
    }
  };
}
