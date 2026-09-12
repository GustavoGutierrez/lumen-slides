import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';
import { build as bundle } from 'esbuild';
import katex from 'katex';
import { ROOT, json, stable, hash, escape, assetData, iconSVG, id, validateDeck, writeJSON, listFiles } from './core.mjs';

Handlebars.registerHelper('inc', x => Number(x) + 1);
// Six authored names over three Reveal mechanisms: fade and crossfade share the cross-dissolve and
// differ only in duration and intent; morph and fade-dark ride the same dissolve plus their own layer.
const REVEAL_TRANSITION={fade:'fade',crossfade:'fade',slide:'slide',morph:'fade','fade-dark':'fade',none:'none'};
const MORPH_SECONDS='0.4';
export const transitionOf=(deck,index)=>deck.slides[index].transition??deck.transition??'fade';
async function fontCSS() {
  const fonts = await json(path.join(ROOT, 'config/fonts.json')); let css = '';
  for (const font of Object.values(fonts)) {
    if (!/^[\w -]+$/.test(font.family)) throw new Error('Invalid font family');
    for (const f of font.files) css += `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${Number(f.weight)};font-display:block;src:url("${await assetData(ROOT, f.path, true)}")}\n`;
  }
  return { fonts, css };
}
// WCAG 2.1 relative luminance. The threshold is the point where a colour contrasts equally with black
// and with white, sqrt(1.05*0.05)-0.05: above it black ink reads better, so the field counts as light.
const channel = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export const luminance = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16 & 255) + 0.7152 * channel(n >> 8 & 255) + 0.0722 * channel(n & 255); };
export const LIGHT_THRESHOLD = Math.sqrt(1.05 * 0.05) - 0.05;
export const isLight = hex => luminance(hex) > LIGHT_THRESHOLD;
// Every mark that follows the field: each name pairs with a `-on-light` twin the light themes reveal.
const THEME_SWAPPED = ['brand-logo', 'content-image'];
async function themeCSS() {
  const themes = {}; let css = '';
  for (const name of (await fs.readdir(path.join(ROOT, 'themes'))).filter(n=>n.endsWith('.json')).sort()) {
    const t = await json(path.join(ROOT, 'themes', name)); id(t.id);
    for (const value of [...Object.values(t.colors), ...t.chart]) if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Theme requires hex colors: ${t.id}`);
    themes[t.id] = t;
    css += `[data-theme="${t.id}"]{${Object.entries(t.colors).map(([k,v])=>`--${id(k)}:${v}`).join(';')}}\n`;
    // Which mark is visible is decided here, not at runtime: the theme picker only flips data-theme.
    // The dark mark is the default, so only a light background emits an override, and it hides that mark
    // only where the light twin actually follows it: a lone mark has no replacement and must stay visible.
    if (isLight(t.colors.background)) css += THEME_SWAPPED.map(c=>`[data-theme="${t.id}"] .${c}:has(+.${c}-on-light){display:none}\n[data-theme="${t.id}"] .${c}-on-light{display:inline}\n`).join('');
  }
  return { themes, css };
}
function table(chart) {
  return `<table><caption>${escape(chart.unit)}</caption><thead><tr><th>${escape(chart.xLabel || 'Categoría')}</th>${chart.series.map(s=>`<th>${escape(s.name)}</th>`).join('')}</tr></thead><tbody>${chart.labels.map((label,i)=>`<tr><th>${escape(label)}</th>${chart.series.map(s=>`<td>${s.values[i]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
export async function buildDeck(dir, out = path.join(dir, 'output')) {
  dir = path.resolve(dir); out = path.resolve(out);
  const deck = await validateDeck(dir);
  const [fontPack, themePack] = await Promise.all([fontCSS(), themeCSS()]);
  // A brand may ship its own mark; otherwise every deck carries the project owl.
  const favicon = await assetData(ROOT, (await json(path.join(ROOT, `brands/${id(deck.brand)}.json`))).favicon ?? 'assets/brand/favicon.png');
  let sections = '', extraCSS = '';
  const templateSet = new Set();
  const transitions = deck.slides.map((_, i) => transitionOf(deck, i));
  // Auto-animate only tweens a consecutive pair, so a morph slide also arms the slide it comes from.
  const autoAnimate = transitions.map((name, i) => name === 'morph' || transitions[i+1] === 'morph');
  for (const [index, s] of deck.slides.entries()) {
    const templateDir = path.join(ROOT, 'templates', s.layout);
    const manifest = await json(path.join(templateDir, 'manifest.json'));
    const brand = await json(path.join(ROOT, 'brands', `${s.brand ?? manifest.brand ?? deck.brand}.json`));
    // A brand may ship a second mark for light fields; CSS picks one, so only the first carries the name.
    const logo = brand.logo ? `<img src="${await assetData(ROOT, brand.logo)}" alt="${escape(brand.name)}" class="brand-logo">${brand.logoOnLight ? `<img src="${await assetData(ROOT, brand.logoOnLight)}" alt="" class="brand-logo-on-light">` : ''}` : `<span>${escape(brand.name)}</span>`;
    const refs = s.sourceIds.map(ref=>deck.sources.find(x=>x.id===ref));
    // Handlebars cannot await, so every icon resolves before the context is handed to the template.
    const items = s.items ? await Promise.all(s.items.map(async item => ({ ...item, iconSVG:item.icon ? await iconSVG(item.icon) : '' }))) : s.items;
    const ctx = { ...s, items, iconSVG:s.icon ? await iconSVG(s.icon) : '', author:deck.author, references:refs, dataTable:s.chart ? table(s.chart) : '', imageData:s.image ? await assetData(dir, s.image) : '', imageOnLightData:s.imageOnLight ? await assetData(dir, s.imageOnLight) : '', formula:s.math ? katex.renderToString(s.math, { throwOnError:true, trust:false, displayMode:true, output:'htmlAndMathml' }) : '' };
    const content = Handlebars.compile(await fs.readFile(path.join(templateDir, 'slide.hbs'), 'utf8'), { strict:false })(ctx);
    sections += `<section id="${s.id}" class="layout-${s.layout}" data-slide-id="${s.id}" data-transition="${REVEAL_TRANSITION[transitions[index]]}" data-transition-speed="fast" data-lumen-transition="${transitions[index]}"${autoAnimate[index]?` data-auto-animate data-auto-animate-duration="${MORPH_SECONDS}"`:''} aria-label="${index+1}. ${escape(s.title)}"><div class="slide-content">${content}</div><footer><span class="brand">${logo}</span><div class="citations">${s.basis==='demo'?'<span class="disclosure">Ejemplo ilustrativo</span>':s.basis==='analysis'?'<span class="disclosure">Propuesta de diseño</span>':''}${refs.map(r=>`<a href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.publisher)}</a>`).join(' · ')}</div><span class="page-number">${String(index+1).padStart(2,'0')} / ${String(deck.slides.length).padStart(2,'0')}</span></footer><aside class="notes">${escape(s.notes || '')}</aside></section>\n`;
    if (!templateSet.has(s.layout)) {
      templateSet.add(s.layout);
      try {
        const css = await fs.readFile(path.join(templateDir, 'style.css'), 'utf8');
        if (/@import|url\s*\(/i.test(css)) throw new Error('Template CSS must not load external resources');
        extraCSS += css;
      } catch(e) { if(e.code !== 'ENOENT') throw e; }
    }
  }
  // Runtime features load a browser module; icons are static markup and only ever get reported.
  const runtime = ['chart','diagram','scene'].filter(k=>deck.slides.some(s=>s[k]));
  const features = deck.slides.some(s=>s.icon || (s.items??[]).some(i=>i.icon)) ? [...runtime,'icons'] : runtime;
  const entry = `import { start } from './src/runtime.mjs';\n${runtime.map(k=>`import { init as ${k} } from './src/features/${k}.mjs';`).join('\n')}\nstart({${runtime.join(',')}});`;
  const bundled = await bundle({ stdin:{ contents:entry, resolveDir:ROOT, sourcefile:'lumen-entry.mjs' }, bundle:true, format:'iife', platform:'browser', target:['es2022'], minify:true, write:false, legalComments:'inline', logLevel:'silent' });
  const script = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  let katexCSS = '';
  if (deck.slides.some(s=>s.math)) {
    katexCSS = await fs.readFile(path.join(ROOT, 'node_modules/katex/dist/katex.min.css'), 'utf8');
    // Keep just the WOFF2 source in each @font-face; embed every font used by KaTeX.
    const matches = [...new Set([...katexCSS.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map(m=>m[1]))];
    for (const f of matches) katexCSS = katexCSS.replaceAll(`url(${f})`, `url("${await assetData(path.join(ROOT,'node_modules/katex/dist'), f, true)}")`);
    katexCSS = katexCSS.replace(/,url\(fonts\/[^)]+\) format\("(?:woff|truetype)"\)/g, '');
  }
  const css = [await fs.readFile(path.join(ROOT,'node_modules/reveal.js/dist/reveal.css'),'utf8'), fontPack.css, katexCSS, themePack.css, await fs.readFile(path.join(ROOT,'src/style.css'),'utf8'), extraCSS].join('\n');
  // Icons resolve before the template literal because iconSVG is async and the toolbar is icon-only.
  const ui = Object.fromEntries(await Promise.all(['palette','typography','layout-grid','notes','maximize','file-type-pdf','layout-navbar-collapse'].map(async n=>[n, await iconSVG(`tabler:${n}`)])));
  const toolbar = `<nav class="toolbar" id="toolbar" aria-label="Controles de presentación"><button id="credits" class="toolbar-mark" type="button" title="Créditos de Lumen Slides" aria-label="Créditos de Lumen Slides"><img src="${favicon}" alt=""></button><span class="toolbar-title">${escape(deck.title)}</span><label>${ui.palette}<select id="theme-picker" aria-label="Tema">${Object.values(themePack.themes).map(t=>`<option value="${t.id}" ${t.id===deck.theme?'selected':''}>${escape(t.name)}</option>`).join('')}</select></label><label>${ui.typography}<select id="font-picker" aria-label="Fuente">${Object.entries(fontPack.fonts).map(([k,f])=>`<option value="${k}" ${k===deck.font?'selected':''}>${escape(f.name)}</option>`).join('')}</select></label><button id="overview" title="Vista general (Esc)" aria-label="Vista general (Esc)">${ui['layout-grid']}</button><button id="notes-toggle" aria-expanded="false" title="Notas (N)" aria-label="Notas (N)">${ui.notes}</button><button id="fullscreen" title="Pantalla completa (F)" aria-label="Pantalla completa (F)">${ui.maximize}</button><button id="print" title="Exportar a PDF" aria-label="Exportar a PDF">${ui['file-type-pdf']}</button></nav><button id="toolbar-handle" class="toolbar-handle" type="button" aria-controls="toolbar" aria-expanded="true" title="Ocultar la barra (T)" aria-label="Ocultar la barra (T)">${ui['layout-navbar-collapse']}</button>`;
  // Zero padding on the dialog itself, all of it on the inner box: a backdrop click reports the dialog as
  // its own target, so padding on the dialog would read as a backdrop click and close it from the inside.
  const credits = `<dialog id="credits-dialog" aria-labelledby="credits-heading"><div class="credits-body"><h2 id="credits-heading">Lumen Slides</h2><p class="credits-author">Gustavo Gutiérrez</p><p lang="es">Creador de Lumen Slides, el generador de esta presentación portable.</p><p lang="en" class="credits-alt">Creator of Lumen Slides, the generator behind this portable presentation.</p><p class="credits-repo"><a href="https://github.com/GustavoGutierrez/lumen-slides" target="_blank" rel="noopener noreferrer">https://github.com/GustavoGutierrez/lumen-slides</a></p><button id="credits-close" type="button" autofocus>Cerrar</button></div></dialog>`;
  const payload = JSON.stringify({ deck, themes:themePack.themes, fonts:fontPack.fonts }).replace(/</g,'\\u003c');
  const html = `<!doctype html><html lang="${escape(deck.lang)}" data-theme="${deck.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(deck.title)}</title><link rel="icon" href="${favicon}"><style>${css.replace(/<\/style/gi,'')}</style></head><body><a class="skip-link" href="#deck">Ir a la presentación</a>${toolbar}<div id="transition-veil" aria-hidden="true"></div><main id="deck" class="reveal"><div class="slides">${sections}</div></main><aside id="speaker-panel" hidden><button id="notes-close">Cerrar</button><h2>Notas del presentador</h2><div id="speaker-copy"></div></aside><div id="slide-status" class="sr-only" aria-live="polite"></div><div id="runtime-error" hidden role="alert"></div>${credits}<script type="application/json" id="lumen-data">${payload}</script><script>${script}</script></body></html>`;
  await fs.mkdir(out, { recursive:true });
  await fs.writeFile(path.join(out, 'index.html'), html);
  await fs.writeFile(path.join(out, 'deck.json'), stable(deck));
  await fs.writeFile(path.join(out, 'sources.json'), stable(deck.sources));
  await fs.writeFile(path.join(out, 'LEEME.txt'), 'Abre index.html en un navegador moderno. No necesitas Node.js ni internet.\nFlechas o deslizar: navegar. Esc: índice. N: notas. F: pantalla completa. T: ocultar o mostrar la barra.\nEn teléfonos, descarga y extrae la carpeta y abre el HTML con un navegador; el visor de archivos puede bloquear JavaScript. También puedes alojar index.html en un servidor estático.\nPDF: usa el botón PDF y guarda desde Chrome/Edge con fondos y sin márgenes. El PDF conserva un estado estático; no reproduce controles ni animaciones.\nLos enlaces a fuentes requieren conexión.\n');
  const licenses = [];
  const lock = await json(path.join(ROOT,'package-lock.json'));
  for (const pkg of Object.keys(lock.packages).filter(p=>p.startsWith('node_modules/')).sort()) {
    const p=path.join(ROOT,pkg);let entries;
    try{entries=await fs.readdir(p);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const file of entries.filter(f=>/^(licen[sc]e|copying|ofl|notice)(?:[.-].*)?$/i.test(f)).sort()) {
      if((await fs.stat(path.join(p,file))).isFile())licenses.push(`${pkg.replace(/^node_modules\//,'')} ${lock.packages[pkg].version}\n${file}\n${await fs.readFile(path.join(p,file),'utf8')}`);
    }
  }
  await fs.writeFile(path.join(out,'THIRD-PARTY-LICENSES.txt'), licenses.join('\n\n'+'='.repeat(60)+'\n\n'));
  const files = {};
  for (const f of ['index.html','deck.json','sources.json','LEEME.txt','THIRD-PARTY-LICENSES.txt']) files[f] = hash(await fs.readFile(path.join(out,f)));
  const lockHash = hash(await fs.readFile(path.join(ROOT,'package-lock.json')));
  await writeJSON(path.join(out,'manifest.json'), { format:'lumen-portable-v1', version:(await json(path.join(ROOT,'package.json'))).version, slides:deck.slides.length, features, lockHash, files });
  return { out, slides:deck.slides.length, features, sha256:files['index.html'], bytes:Buffer.byteLength(html) };
}
