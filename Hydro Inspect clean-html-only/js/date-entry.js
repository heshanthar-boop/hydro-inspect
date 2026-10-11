/** Shared date/time entry tools for inspection, history and settings. */
const DateEntry = {
  localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  },
  localTime(date = new Date()) { return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; },
  enhance(container) {
    const types = {'general.timeOfInspection':'time', 'cebMeter.meterTime':'datetime-local', 'cebMeter.importedMaxDemandDate':'datetime-local', 'cebMeter.exportMaxDemandDate':'datetime-local'};
    container.querySelectorAll('input').forEach(original => {
      if (original.dataset.dateEnhanced) return;
      const kind = types[original.dataset.field] || (original.id.startsWith('evt-time-') ? 'time' : original.type);
      if (!['date','time','datetime-local'].includes(kind)) return;
      original.dataset.dateEnhanced = 'true';
      let input = original;
      const valid = kind === 'time' ? /^\d{2}:\d{2}(:\d{2})?$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
      const legacy = original.type === 'text' && original.value && !valid.test(original.value);
      if (legacy) {
        input = document.createElement('input'); input.type = kind; input.className = 'form-input'; input.dataset.dateEnhanced = 'true';
        input.setAttribute('aria-label','Choose a replacement date or time');
        original.insertAdjacentElement('afterend',input);
        input.addEventListener('change',() => { original.value = input.value; original.dispatchEvent(new Event('change',{bubbles:true})); });
        const hint = document.createElement('small'); hint.className='form-hint'; hint.textContent='Existing text kept above. Choose a new value below to replace it.'; original.insertAdjacentElement('afterend',hint);
      } else if (original.type === 'text') { original.type=kind; }
      if (kind === 'time') input.step = input.getAttribute('step') || (original.id.startsWith('evt-time-') ? '1' : '60');
      if (!input.getAttribute('aria-label') && !input.closest('label')) input.setAttribute('aria-label',original.closest('.form-group')?.querySelector('label')?.textContent.trim() || (kind==='date' ? 'Date' : 'Time'));
      const tools=document.createElement('div'); tools.className='date-entry-tools';
      const set = value => { if(input.readOnly || input.disabled) return; input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); };
      const button = (label, action) => { const b=document.createElement('button'); b.type='button'; b.className='date-entry-btn'; b.textContent=label; b.disabled=input.readOnly || input.disabled; b.addEventListener('click',action); tools.append(b); };
      button(kind==='time' ? 'Pick time' : 'Calendar',()=>{ try { if(input.showPicker) input.showPicker(); else input.focus(); } catch { input.focus(); } });
      if(kind==='date') {
        button('Today',()=>set(this.localDate()));
        button('Yesterday',()=>{const d=new Date();d.setDate(d.getDate()-1);set(this.localDate(d));});
        if(original.id.startsWith('evt-date-')) button('Visit date',()=>set(Forms.currentInspection.general.date));
      } else button('Now',()=>set(kind==='datetime-local' ? `${this.localDate()}T${this.localTime()}` : this.localTime()));
      if(original.dataset.field==='general.timeOfInspection') button('Use session',()=>{
        const start=container.querySelector('[data-field="session.startTime"]').value;
        const end=container.querySelector('[data-field="session.endTime"]').value;
        if(!start) return;
        original.type='text'; original.value=end ? `${start} - ${end}` : start;
        original.dispatchEvent(new Event('change',{bubbles:true}));
      });
      input.insertAdjacentElement('afterend',tools);
    });
  },
  init() {
    const main=document.getElementById('main-content');
    this.enhance(main);
    new MutationObserver(()=>this.enhance(main)).observe(main,{childList:true,subtree:true});
  }
};
document.addEventListener('DOMContentLoaded',()=>DateEntry.init());
