/** Mobile-friendly sequential field entry with immediate save on Next. */
const MobileEntry = {
  active:null,
  fields() {
    if(!['daily','new-inspection'].includes(App.currentPage)) return [];
    const root=document.querySelector(App.currentPage==='daily'?'#daily-form':'#main-content');
    return root ? [...root.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]),textarea,select')].filter(el=>el.offsetParent!==null && !el.disabled && !el.readOnly) : [];
  },
  move(direction) {
    const input=this.active;if(!input?.isConnected) return;
    // Required blank draft fields can be filled later; malformed numeric values cannot.
    if(input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow || input.validity.stepMismatch) {input.reportValidity();return;}
    const fields=this.fields(),index=fields.indexOf(input),next=fields[index+direction];
    input.dispatchEvent(new Event('change',{bubbles:true}));
    if(next){next.focus();next.scrollIntoView({behavior:'smooth',block:'center'});}else{input.blur();this.bar.hidden=true;}
  },
  init() {
    const bar=document.createElement('div');this.bar=bar;bar.className='mobile-entry-bar';bar.hidden=true;
    bar.innerHTML='<span id="mobile-field-label"></span><span id="mobile-save-status" role="status"></span><div><button type="button" data-prev aria-label="Previous field">Back</button><button type="button" data-next>Save & Next →</button></div>';
    document.body.append(bar);
    bar.querySelectorAll('button').forEach(button=>button.addEventListener('pointerdown',e=>e.preventDefault()));
    bar.querySelector('[data-prev]').addEventListener('click',()=>this.move(-1));bar.querySelector('[data-next]').addEventListener('click',()=>this.move(1));
    document.addEventListener('focusin',e=>{
      const fields=this.fields();const index=fields.indexOf(e.target);
      if(index<0){if(!bar.contains(e.target))bar.hidden=true;return;}
      this.active=e.target;bar.hidden=false;
      e.target.scrollIntoView({behavior:'smooth',block:'center'});
      bar.querySelector('#mobile-field-label').textContent=`${index+1} / ${fields.length} · ${e.target.closest('.form-group')?.querySelector('label')?.textContent.trim() || e.target.getAttribute('aria-label') || 'Field'}`;
      bar.querySelector('[data-next]').textContent=index===fields.length-1 ? 'Done ✓' : 'Save & Next →';bar.querySelector('[data-prev]').disabled=index===0;
    });
    const enhance=()=>{
      bar.querySelector('#mobile-save-status').textContent=document.getElementById(App.currentPage==='daily'?'daily-auto-state':'inspection-save-state')?.textContent || '';
      this.fields().forEach(el=>{
      if(el.dataset.mobileEnhanced)return;el.dataset.mobileEnhanced='true';el.enterKeyHint='next';
      el.addEventListener('keydown',e=>{if(e.key==='Enter' && el.tagName!=='TEXTAREA' && el.tagName!=='SELECT'){e.preventDefault();this.active=el;this.move(1);}});
    });
    };
    window.visualViewport?.addEventListener('resize',()=>{if(!bar.hidden && this.active?.isConnected)this.active.scrollIntoView({block:'center'});});
    const main=document.getElementById('main-content');enhance();new MutationObserver(enhance).observe(main,{childList:true,subtree:true});
    window.addEventListener('scroll',()=>{if(this.active?.isConnected && document.activeElement===this.active){const rect=this.active.getBoundingClientRect();this.bar.hidden=rect.bottom<80 || rect.top>window.innerHeight-100;}},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(App.currentPage==='daily')Daily.flush?.();if(App.currentPage==='new-inspection')Forms.flush?.();}});
  }
};
document.addEventListener('DOMContentLoaded',()=>MobileEntry.init());
