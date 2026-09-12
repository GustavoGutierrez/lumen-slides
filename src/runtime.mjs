import Reveal from 'reveal.js';

export async function start(features) {
  const data = JSON.parse(document.getElementById('lumen-data').textContent);
  const { deck, fonts, themes } = data;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const printing = new URLSearchParams(location.search).has('static');
  const state = { deck, themes, fonts, reduced, printing, instances:[], warnings:[], theme:themes[deck.theme], font:fonts[deck.font], ready:false };
  window.__LUMEN__ = state;
  try {
    document.documentElement.style.setProperty('--font', `"${state.font.family}"`);
    if (printing) document.body.classList.add('static');
    await document.fonts.ready;
    let reveal = null;
    if (!printing) {
      reveal = new Reveal(document.querySelector('.reveal'), { width:1280, height:720, margin:0.055, minScale:0.05, maxScale:2.5, center:false, hash:true, controls:true, progress:true, transition:reduced?'none':'fade', transitionSpeed:'fast', backgroundTransition:'none', slideNumber:false, keyboard:true, touch:true, overview:true, disableLayout:false, scrollActivationWidth:0, viewDistance:60 });
      await reveal.initialize();
    }
    state.reveal = reveal;
    for (const [name, init] of Object.entries(features)) {
      for (const slide of deck.slides.filter(s=>s[name])) {
        const el = document.querySelector(`[data-${name}="${slide.id}"]`);
        state.instances.push(await init(el, slide, state));
      }
    }
    const updateNotes = () => {
      const index = reveal?.getIndices().h ?? 0;
      document.getElementById('speaker-copy').textContent = deck.slides[index].notes || 'Esta diapositiva no tiene notas.';
      document.getElementById('slide-status').textContent = `${index+1} de ${deck.slides.length}: ${deck.slides[index].title}`;
      state.instances.forEach(i=>i?.onSlide?.(deck.slides[index].id));
    };
    reveal?.on('slidechanged',updateNotes); updateNotes();
    let repaintQueue = Promise.resolve();
    const repaint = () => {
      const selectedTheme=document.getElementById('theme-picker').value;
      const selectedFont=document.getElementById('font-picker').value;
      repaintQueue = repaintQueue.then(async () => {
      state.theme = themes[selectedTheme];
      state.font = fonts[selectedFont];
      document.documentElement.dataset.theme = state.theme.id;
      document.documentElement.style.setProperty('--font', `"${state.font.family}"`);
      await document.fonts.ready;
      for (const instance of state.instances) await instance?.update?.();
      reveal?.layout();
      });
      return repaintQueue;
    };
    state.settled=()=>repaintQueue;
    document.getElementById('theme-picker').onchange = repaint;
    document.getElementById('font-picker').onchange = repaint;
    document.getElementById('overview').onclick = () => reveal?.toggleOverview();
    const toggleNotes = () => {
      const panel = document.getElementById('speaker-panel'); panel.hidden = !panel.hidden;
      document.getElementById('notes-toggle').setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) document.getElementById('notes-close').focus();
      else document.getElementById('notes-toggle').focus();
    };
    document.getElementById('notes-toggle').onclick = toggleNotes;
    document.getElementById('notes-close').onclick = toggleNotes;
    document.getElementById('fullscreen').onclick = async () => {
      try { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { state.warnings.push('Fullscreen unavailable in this viewer'); }
    };
    document.addEventListener('keydown',e=> {
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if(e.key.toLowerCase()==='n') toggleNotes();
      if(e.key.toLowerCase()==='f') document.getElementById('fullscreen').click();
    });
    for(const button of document.querySelectorAll('.chart-data-toggle')) button.onclick=()=>{
      const table=document.getElementById(`data-${button.dataset.for}`);table.hidden=!table.hidden;
      button.setAttribute('aria-expanded',String(!table.hidden));button.textContent=table.hidden?'Ver datos':'Cerrar datos';
    };
    state.preparePrint = async () => {
      document.body.classList.add('printing');
      // Opt out of Reveal's generic paper stylesheet; Lumen owns the fixed page layout.
      document.documentElement.classList.add('print-pdf');
      const frozen = state.instances.map(i=>i?.freeze?.());
      await Promise.all(frozen);
      document.querySelectorAll('.data-table').forEach(e=>e.hidden=true);
      await document.fonts.ready;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    };
    state.restore = () => { document.body.classList.remove('printing'); document.documentElement.classList.remove('print-pdf'); state.instances.forEach(i=>i?.restore?.()); reveal?.layout(); };
    addEventListener('beforeprint', () => { state.preparePrint(); });
    addEventListener('afterprint',state.restore);
    document.getElementById('print').onclick = async()=>{ await repaintQueue; await state.preparePrint(); window.print(); };
    state.ready=true;
  } catch(e) {
    state.error = e.stack || e.message;
    const el=document.getElementById('runtime-error');el.hidden=false;el.textContent=`No se pudo renderizar la presentación: ${e.message}`;
    console.error(e);
  }
}
