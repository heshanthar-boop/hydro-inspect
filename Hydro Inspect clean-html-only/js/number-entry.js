/** Numeric entry helpers; values commit through existing form change events. */
const NumberEntry = {
  activeInput: null,
  draft: '',
  enhance(container) {
    container.querySelectorAll('input[type="number"]').forEach(input => {
      if (input.dataset.numberEnhanced) return;
      input.dataset.numberEnhanced = 'true';
      const step = input.getAttribute('step') || '1';
      input.inputMode = step === 'any' || Number(step) < 1 ? 'decimal' : 'numeric';
      input.addEventListener('wheel', () => { if(document.activeElement === input) input.blur(); });
      const tools = document.createElement('div'); tools.className = 'number-entry-tools';
      const add = (label, aria, action) => { const b=document.createElement('button'); b.type='button'; b.className='number-entry-btn'; b.textContent=label; b.setAttribute('aria-label',aria); b.disabled=input.disabled || input.readOnly; b.addEventListener('click',action); tools.append(b); };
      add('−','Decrease '+this.label(input),()=>this.adjust(input,-1));
      add('+','Increase '+this.label(input),()=>this.adjust(input,1));
      add('Keypad','Open keypad for '+this.label(input),()=>this.open(input));
      const anchor=input.closest('.input-with-unit') || input;
      anchor.insertAdjacentElement('afterend',tools);
      const preview=document.createElement('div');preview.className='number-value-preview';tools.insertAdjacentElement('afterend',preview);
      const updatePreview=()=>{const raw=input.value;preview.hidden=raw==='';const parts=raw.split('.');const grouped=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+(parts.length>1?'.'+parts[1]:'');const unit=anchor.querySelector?.('.input-unit')?.textContent || '';preview.textContent='Entered: '+grouped+(unit?' '+unit:'');};
      input.refreshNumberPreview=updatePreview;input.addEventListener('input',updatePreview);input.addEventListener('change',updatePreview);updatePreview();
    });
  },
  label(input) {
    return input.closest('.form-group')?.querySelector('label')?.textContent.trim()
      || [input.closest('.battery-card')?.querySelector('label')?.textContent.trim(), input.placeholder].filter(Boolean).join(' ')
      || input.getAttribute('aria-label') || 'Reading';
  },
  validate(input, value) {
    const probe = input.cloneNode(); probe.value=value;
    if (value !== '' && (!Number.isFinite(Number(value)) || !probe.checkValidity())) return probe.validationMessage || 'Enter a valid number.';
    return '';
  },
  commit(input, value) {
    if (!input.isConnected || input.disabled || input.readOnly) return false;
    const error=this.validate(input,value);
    if(error) { this.message(error); return false; }
    input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  },
  adjust(input, direction) {
    if(input.value === '') { this.open(input); return; }
    const step=input.step === 'any' ? 1 : Number(input.step || 1);
    const value=Number((Number(input.value)+direction*step).toFixed(10));
    const error=this.validate(input,String(value));
    if(error) { App.toast(error,'error'); return; }
    this.commit(input,String(value));
  },
  open(input) {
    if(input.disabled || input.readOnly) return;
    this.activeInput=input; this.draft=input.value;
    this.dialog.querySelector('#number-entry-label').textContent=this.label(input);
    const previous=input.dataset.daily ? input.dataset.previousValue : input.dataset.field && Forms.previousInspection ? Calc._valueAt(Forms.previousInspection,input.dataset.field) : null;
    this.dialog.querySelector('#number-entry-previous').textContent=previous != null && previous !== '' ? `Previous reading: ${Calc.formatNumber(previous)}${input.dataset.previousInfo?' · '+input.dataset.previousInfo:''}` : '';
    this.message(''); this.display();
    if(!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector('[data-key="1"]').focus();
  },
  message(text) { this.dialog.querySelector('#number-entry-error').textContent=text; },
  display() { this.dialog.querySelector('#number-entry-value').textContent=this.draft || 'Not entered'; },
  key(key) {
    this.message('');
    if(key==='clear') this.draft='';
    else if(key==='back') this.draft=this.draft.slice(0,-1);
    else if(key==='sign') this.draft=this.draft.startsWith('-') ? this.draft.slice(1) : '-'+this.draft;
    else if(key==='.') { if(!this.draft.includes('.')) this.draft += this.draft === '' || this.draft === '-' ? '0.' : '.'; }
    else if(/^\d$/.test(key)) this.draft+=key;
    this.display();
  },
  finish(next) {
    const input=this.activeInput;
    if(!this.commit(input,this.draft)) return;
    if(next) {
      const fields=[...document.querySelectorAll('#main-content input[type="number"]')].filter(el=>el.offsetParent!==null && !el.disabled && !el.readOnly);
      const following=fields[fields.indexOf(input)+1];
      if(following) { this.open(following); return; }
    }
    this.dialog.close(); input.focus();
  },
  init() {
    const dialog=document.createElement('dialog'); this.dialog=dialog; dialog.className='number-entry-dialog'; dialog.setAttribute('aria-labelledby','number-entry-label');
    dialog.innerHTML=`<div class="number-entry-heading"><h2 id="number-entry-label">Reading</h2><button type="button" data-close aria-label="Cancel number entry">×</button></div><p id="number-entry-previous"></p><output id="number-entry-value" aria-live="polite"></output><p id="number-entry-error" role="alert"></p><div class="number-key-grid">${['1','2','3','4','5','6','7','8','9','sign','0','.','clear','back'].map(key=>`<button type="button" data-key="${key}" aria-label="${key==='back'?'Backspace':key==='sign'?'Toggle negative':key==='clear'?'Clear value':key==='.'?'Decimal point':key}">${key==='back'?'⌫':key==='sign'?'±':key==='clear'?'Clear':key}</button>`).join('')}</div><div class="number-entry-actions"><button type="button" data-next>Save & Next</button><button type="button" data-done>Done</button></div><p class="number-entry-hint">Use your keyboard too. Enter saves; Escape cancels.</p>`;
    document.body.append(dialog);
    dialog.querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>this.key(b.dataset.key)));
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.querySelector('[data-next]').addEventListener('click',()=>this.finish(true));
    dialog.querySelector('[data-done]').addEventListener('click',()=>this.finish(false));
    dialog.addEventListener('keydown',e=>{
      if(/^\d$/.test(e.key)||e.key==='.') { e.preventDefault(); this.key(e.key); }
      else if(e.key==='Backspace') { e.preventDefault();this.key('back'); }
      else if(e.key==='-') { e.preventDefault();this.key('sign'); }
      else if(e.key==='Enter' && !e.target.matches('[data-next],[data-done],[data-close]')) { e.preventDefault();this.finish(false); }
    });
    const main=document.getElementById('main-content'); this.enhance(main);
    new MutationObserver(()=>this.enhance(main)).observe(main,{childList:true,subtree:true});
  }
};
document.addEventListener('DOMContentLoaded',()=>NumberEntry.init());
