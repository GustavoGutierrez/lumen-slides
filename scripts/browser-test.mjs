import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, writeJSON } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';
import { launchBrowser, loadPresentation } from '../src/export.mjs';

const dir=path.join(ROOT,'decks/demo');const built=await buildDeck(dir);const qa=path.join(ROOT,'.qa');await fs.mkdir(qa,{recursive:true});
const browser=await launchBrowser();
try{
  const {page,errors,requests}=await loadPresentation(browser,path.join(built.out,'index.html'));
  await page.context().setOffline(true);
  assert.equal(await page.evaluate(()=>window.__LUMEN__.deck.slides.length),10);
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>window.__LUMEN__.reveal.getIndices().h),1);
  const inkBackground=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  await page.selectOption('#theme-picker','paper');await page.waitForFunction(()=>document.documentElement.dataset.theme==='paper');
  // The attribute alone proves nothing: assert the palette actually repaints.
  const paperBackground=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  assert.notEqual(paperBackground,inkBackground,`theme switch did not repaint: still ${paperBackground}`);
  await page.selectOption('#font-picker','plex');await page.waitForFunction(()=>window.__LUMEN__.font.family==='IBM Plex Sans');
  await page.selectOption('#theme-picker','ink');await page.selectOption('#font-picker','inter');
  await page.evaluate(()=>window.__LUMEN__.settled());
  await page.evaluate(()=>window.__LUMEN__.reveal.slide(2));await page.locator('#flow [data-step="1"]').click();assert.equal(await page.locator('#flow .diagram-detail h3').textContent(),'Fuentes examinadas');
  await page.evaluate(()=>window.__LUMEN__.reveal.slide(3));await page.locator('#chart .chart-data-toggle').click();assert.ok(await page.locator('#data-chart').isVisible());await page.locator('#chart .chart-data-toggle').click();
  assert.ok(await page.locator('#chart .chart svg').count());
  await page.evaluate(()=>window.__LUMEN__.reveal.slide(5));
  const webgl=await page.locator('#network canvas').count();if(webgl){await page.locator('#network .scene-toggle').click();assert.equal(await page.locator('#network .scene-toggle').getAttribute('aria-pressed'),'true');}
  await page.click('#notes-toggle');assert.ok(await page.locator('#speaker-panel').isVisible());await page.click('#notes-close');
  await page.click('#overview');assert.equal(await page.evaluate(()=>window.__LUMEN__.reveal.isOverview()),true);await page.keyboard.press('Escape');
  // Icon-only redesign: the visible label is gone, so the accessible name has to come from aria-label.
  const controls=await page.$$eval('.toolbar button, #toolbar-handle',els=>els.map(e=>({id:e.id,label:e.getAttribute('aria-label'),title:e.getAttribute('title'),icons:e.querySelectorAll('svg.icon').length,marks:e.querySelectorAll('img').length,text:e.textContent.replace(/\s+/g,'')})));
  assert.ok(controls.length>=5,`expected the full toolbar control set, got ${controls.length}`);
  for(const c of controls){assert.ok(c.label&&c.label.trim(),`${c.id||'button'} has no aria-label`);assert.ok(c.title&&c.title.trim(),`${c.id||'button'} has no title`);assert.equal(c.icons+c.marks,1,`${c.id||'button'} needs exactly one graphic: svg.icon or the project mark`);assert.equal(c.text,'',`${c.id||'button'} still renders text: ${c.text}`);}
  for(const select of ['theme-picker','font-picker']){const name=await page.locator(`#${select}`).getAttribute('aria-label');assert.ok(name&&name.trim(),`#${select} has no aria-label`);assert.ok(await page.locator(`#${select}`).isVisible(),`#${select} must stay readable`);}
  for(const hint of [['overview','Esc'],['notes-toggle','N'],['fullscreen','F'],['toolbar-handle','T']])assert.match(await page.locator(`#${hint[0]}`).getAttribute('title')??'',new RegExp(`\\(${hint[1]}\\)`,'i'),`#${hint[0]} lost its shortcut hint`);
  const toolbarShown=()=>page.evaluate(()=>document.querySelector('.toolbar').checkVisibility());
  const revealBox=()=>page.evaluate(()=>{const r=document.querySelector('.reveal').getBoundingClientRect();return{top:r.top,bottom:r.bottom,viewport:innerHeight};});
  assert.equal(await toolbarShown(),true);
  await page.click('#toolbar-handle');await page.waitForFunction(()=>!document.querySelector('.toolbar').checkVisibility());
  assert.ok(await page.locator('#toolbar-handle').isVisible(),'the show affordance disappeared with the toolbar');
  assert.equal(await page.locator('#toolbar-handle').getAttribute('aria-expanded'),'false');
  // Reclaimed space: the slide area must own the whole viewport and stay inside it.
  const hidden=await revealBox();assert.ok(hidden.top<=1,`slide area still offset by ${hidden.top}px`);assert.ok(hidden.bottom>=hidden.viewport-1&&hidden.bottom<=hidden.viewport+1,`slide area clipped: bottom ${hidden.bottom} vs viewport ${hidden.viewport}`);
  await page.click('#toolbar-handle');await page.waitForFunction(()=>document.querySelector('.toolbar').checkVisibility());
  assert.equal(await page.locator('#toolbar-handle').getAttribute('aria-expanded'),'true');
  const shown=await revealBox();assert.ok(shown.top>0&&shown.bottom<=shown.viewport+1,`restored slide area clipped: ${JSON.stringify(shown)}`);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('t');await page.waitForFunction(()=>!document.querySelector('.toolbar').checkVisibility());
  assert.equal(await page.locator('#toolbar-handle').getAttribute('aria-expanded'),'false');
  await page.keyboard.press('t');await page.waitForFunction(()=>document.querySelector('.toolbar').checkVisibility());
  assert.equal(await page.locator('#toolbar-handle').getAttribute('aria-expanded'),'true');
  // The mark is a control, not a decorative image with a handler: it needs a role, a name and a tooltip.
  const mark=await page.$eval('#credits',e=>({tag:e.tagName,title:e.getAttribute('title'),label:e.getAttribute('aria-label'),img:e.querySelector('img')?.getAttribute('alt')}));
  assert.equal(mark.tag,'BUTTON','the toolbar mark must be a real button');
  assert.ok(mark.title&&mark.title.trim(),'#credits has no title');
  assert.ok(mark.label&&mark.label.trim(),'#credits has no aria-label');
  assert.equal(mark.img,'','the mark image stays decorative; the button carries the accessible name');
  const dialog=page.locator('#credits-dialog');
  await page.click('#credits');await dialog.waitFor({state:'visible'});
  assert.ok(await page.evaluate(()=>document.getElementById('credits-dialog').matches(':modal')),'the credits must open as a modal dialog');
  assert.match(await dialog.textContent(),/Gustavo Guti[eé]rrez/,'the credits do not name the author');
  const links=await dialog.locator('a').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
  assert.deepEqual(links,['https://github.com/GustavoGutierrez/lumen-slides'],'the repository must be one real link, listed exactly once');
  // Both languages at once, with the English block tagged so a screen reader stops reading it as Spanish.
  const blocks=await dialog.locator('[lang]').evaluateAll(els=>els.map(e=>({lang:e.getAttribute('lang'),text:e.textContent.replace(/\s+/g,' ').trim()})));
  const spanish=blocks.findIndex(b=>b.lang==='es'),english=blocks.findIndex(b=>b.lang==='en');
  assert.ok(spanish>=0&&blocks[spanish].text,'the Spanish credits block is missing');
  assert.ok(english>=0&&blocks[english].text,'the English credits block is missing or not marked lang="en"');
  assert.ok(spanish<english,'Spanish must come first; the deck language is es');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__LUMEN__.reveal.isOverview()),false,'Escape inside the credits leaked to Reveal');
  assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY','focus was dropped on the body after closing the credits');
  await page.click('#credits');await dialog.waitFor({state:'visible'});
  await page.click('#credits-close');await dialog.waitFor({state:'hidden'});
  assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY','focus was dropped on the body after the close button');
  await page.click('#credits');await dialog.waitFor({state:'visible'});
  const box=await dialog.boundingBox();
  // A backdrop click reports the dialog itself as the target, so a naive target check closes the dialog
  // when the pointer lands on its own padding. This click is inside the box and must not close anything.
  await page.mouse.click(box.x+3,box.y+3);
  assert.ok(await dialog.isVisible(),'a click on the dialog edge closed it; the backdrop check is targeting the padding');
  await page.mouse.click(Math.round(box.x/2),Math.round(box.y/2));
  await dialog.waitFor({state:'hidden'});
  // Fullscreen gate. Real fullscreen works in this headless Chrome; the stub drives the same
  // fullscreenchange handler where it does not, and the report records which path ran.
  let fullscreenMode='native';
  const stubFullscreen=on=>page.evaluate(full=>{Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>full?document.documentElement:null});document.dispatchEvent(new Event('fullscreenchange'));},on);
  const exitFullscreen=async()=>{
    if(fullscreenMode==='native')await page.evaluate(()=>document.exitFullscreen());else await stubFullscreen(false);
    await page.waitForFunction(()=>!document.getElementById('credits').disabled);
  };
  await page.click('#fullscreen');
  if(!await page.evaluate(()=>!!document.fullscreenElement)){fullscreenMode='stubbed-fullscreenchange';await stubFullscreen(true);}
  assert.ok(await page.evaluate(()=>!!document.fullscreenElement),'the fullscreen state could not be driven at all');
  await page.waitForFunction(()=>document.getElementById('credits').disabled).catch(()=>{throw new Error('the credits control stays operable in fullscreen');});
  assert.equal(await page.locator('#credits').isDisabled(),true,'the credits control stays operable in fullscreen');
  await page.click('#credits',{force:true});
  assert.equal(await dialog.isVisible(),false,'clicking the mark in fullscreen still opened the credits');
  await exitFullscreen();
  // Going fullscreen with the credits already open must close them; F is the presenter's own route in.
  await page.click('#credits');await dialog.waitFor({state:'visible'});
  if(fullscreenMode==='native')await page.keyboard.press('f');else await stubFullscreen(true);
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await dialog.waitFor({state:'hidden'});
  await exitFullscreen();
  for(let i=0;i<10;i++){await page.evaluate(n=>window.__LUMEN__.reveal.slide(n),i);await page.screenshot({path:path.join(qa,`slide-${String(i+1).padStart(2,'0')}.png`)});}
  const mobile=await loadPresentation(browser,path.join(built.out,'index.html'),{context:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}});
  await mobile.page.context().setOffline(true);await mobile.page.locator('.navigate-right').tap();assert.equal(await mobile.page.evaluate(()=>window.__LUMEN__.reveal.getIndices().h),1);await mobile.page.screenshot({path:path.join(qa,'mobile.png')});
  // Reveal marks non-present slides [hidden] but keeps them rendered so they can animate.
  // A global [hidden]{display:none!important} removes them from the render tree and every
  // transition becomes a hard cut, with the CSS still reporting a duration.
  // This page opts out of reduced motion on purpose: the default context forces none.
  const motion=await loadPresentation(browser,path.join(built.out,'index.html'),{context:{reducedMotion:'no-preference'}});
  const midTransition=await motion.page.evaluate(async()=>{
    const s=[...document.querySelectorAll('.slides>section')];
    if(getComputedStyle(s[1]).display==='none')return {display:'none',running:0,opacity:0};
    window.__LUMEN__.reveal.slide(1);
    await new Promise(r=>setTimeout(r,140));
    return {display:'block',running:document.getAnimations().filter(a=>a.effect?.target?.tagName==='SECTION').length,opacity:+getComputedStyle(s[0]).opacity};
  });
  assert.equal(midTransition.display,'block','non-present slides must stay rendered or transitions cannot run');
  assert.ok(midTransition.running>0,`no slide transition was running: ${JSON.stringify(midTransition)}`);
  assert.ok(midTransition.opacity>0.02&&midTransition.opacity<0.98,`slide change was a hard cut, opacity ${midTransition.opacity}`);
  await motion.page.close();
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);assert.deepEqual(mobile.errors,[]);assert.deepEqual(mobile.requests,[]);
  const report={passed:true,browser:await browser.version(),os:process.platform,desktop:'1360x820',mobile:'390x844, touch emulation',offline:true,externalRequests:requests,webgl:!!webgl,checks:['navigation','theme','font','diagram-step','chart-data','notes','overview','mobile-tap','reduced-motion','transition-actually-animates','toolbar-icon-only','toolbar-accessible-names','toolbar-hide-toggle','toolbar-shortcut','toolbar-hidden-layout','credits-control','credits-dialog','credits-bilingual','credits-link','credits-escape','credits-close-button','credits-focus-return','credits-backdrop-click','credits-inside-click-keeps-open','credits-fullscreen-gate'],providerLiveTests:false,fullscreenSimulation:fullscreenMode};await writeJSON(path.join(qa,'browser-report.json'),report);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
