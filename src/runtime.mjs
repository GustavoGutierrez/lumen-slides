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
    // The motion preference outranks every authored transition, so the attributes are stripped before
    // Reveal ever reads them: a per-slide data-transition would otherwise beat the global config.
    if (reduced) for (const section of document.querySelectorAll('.slides>section')) {
      section.dataset.transition = 'none'; section.dataset.lumenTransition = 'none';
      delete section.dataset.autoAnimate; delete section.dataset.autoAnimateDuration;
    }
    let reveal = null;
    if (!printing) {
      reveal = new Reveal(document.querySelector('.reveal'), { width:1280, height:720, margin:0.055, minScale:0.05, maxScale:2.5, center:false, hash:true, controls:true, progress:true, transition:reduced?'none':'fade', transitionSpeed:'fast', backgroundTransition:'none', slideNumber:false, keyboard:true, touch:true, overview:true, disableLayout:false, scrollActivationWidth:0, viewDistance:60, autoAnimate:!reduced });
      await reveal.initialize();
    }
    state.reveal = reveal;
    for (const [name, init] of Object.entries(features)) {
      for (const slide of deck.slides.filter(s=>s[name])) {
        const el = document.querySelector(`[data-${name}="${slide.id}"]`);
        state.instances.push(await init(el, slide, state));
      }
    }
    const veil = document.getElementById('transition-veil');
    const luminance = color => { const [r,g,b] = color.match(/[\d.]+/g).map(n => { n /= 255; return n <= 0.03928 ? n/12.92 : ((n+0.055)/1.055)**2.4; }); return 0.2126*r + 0.7152*g + 0.0722*b; };
    // "Through dark" must stay dark on paper and prisma-claro, where --background is the lightest tone,
    // so the veil takes whichever of the two document tones actually is the darker one.
    const setVeil = () => {
      const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden';
      document.body.appendChild(probe);
      const read = name => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
      const background = read('--background'), foreground = read('--foreground');
      probe.remove();
      document.documentElement.style.setProperty('--veil', luminance(background) <= luminance(foreground) ? background : foreground);
    };
    setVeil();
    let veilTimer = null;
    const flashVeil = () => {
      // Half the authored duration in and half out; the slide change itself never waits on the overlay.
      const total = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--transition-fade-dark')) || 0;
      clearTimeout(veilTimer); veil.classList.add('on');
      veilTimer = setTimeout(()=>veil.classList.remove('on'), total/2);
    };
    const updateNotes = () => {
      const index = reveal?.getIndices().h ?? 0;
      document.getElementById('speaker-copy').textContent = deck.slides[index].notes || 'Esta diapositiva no tiene notas.';
      document.getElementById('slide-status').textContent = `${index+1} de ${deck.slides.length}: ${deck.slides[index].title}`;
      state.instances.forEach(i=>i?.onSlide?.(deck.slides[index].id));
    };
    reveal?.on('slidechanged',updateNotes); updateNotes();
    reveal?.on('slidechanged', e => {
      // Never let the overlay break navigation: the slide has already changed when this runs.
      try { if (!reduced && veil && e.currentSlide?.dataset.lumenTransition === 'fade-dark') flashVeil(); }
      catch { veil?.classList.remove('on'); state.warnings.push('Fade-through-dark unavailable in this viewer'); }
    });
    let repaintQueue = Promise.resolve();
    const repaint = () => {
      const selectedTheme=document.getElementById('theme-picker').value;
      const selectedFont=document.getElementById('font-picker').value;
      repaintQueue = repaintQueue.then(async () => {
      state.theme = themes[selectedTheme];
      state.font = fonts[selectedFont];
      document.documentElement.dataset.theme = state.theme.id;
      document.documentElement.style.setProperty('--font', `"${state.font.family}"`);
      setVeil();
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
    const credits = document.getElementById('credits'), creditsDialog = document.getElementById('credits-dialog');
    credits.onclick = () => creditsDialog.showModal();
    document.getElementById('credits-close').onclick = () => creditsDialog.close();
    // The backdrop is the dialog's own box and names the dialog as the target, so the padding lives on the
    // inner div: a click on the dialog chrome then lands on that child and never reads as a click outside.
    creditsDialog.onclick = e => { if (e.target === creditsDialog) creditsDialog.close(); };
    // The dialog closes itself on Escape; stop the key there so Reveal does not also leave the overview.
    creditsDialog.onkeydown = e => { if (e.key === 'Escape') e.stopPropagation(); };
    creditsDialog.onclose = () => { if (!credits.disabled) credits.focus(); };
    // Gate on the event, never on the button: F11 and Escape change fullscreen without the toolbar.
    const syncCredits = () => {
      const presenting = !!document.fullscreenElement;
      credits.disabled = presenting;
      if (presenting && creditsDialog.open) creditsDialog.close();
    };
    document.addEventListener('fullscreenchange', syncCredits); syncCredits();
    const handle = document.getElementById('toolbar-handle');
    // The handle lives outside the toolbar so hiding the bar never takes its own restore control away.
    const toggleToolbar = () => {
      const hidden = document.body.classList.toggle('toolbar-hidden');
      const label = hidden ? 'Mostrar la barra (T)' : 'Ocultar la barra (T)';
      handle.setAttribute('aria-expanded', String(!hidden));
      handle.setAttribute('aria-label', label); handle.title = label;
      reveal?.layout();
    };
    handle.onclick = toggleToolbar;
    document.addEventListener('keydown',e=> {
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if(e.key.toLowerCase()==='n') toggleNotes();
      if(e.key.toLowerCase()==='f') document.getElementById('fullscreen').click();
      if(e.key.toLowerCase()==='t') toggleToolbar();
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
