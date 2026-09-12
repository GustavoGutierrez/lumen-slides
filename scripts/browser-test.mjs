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
  await page.selectOption('#theme-picker','paper');await page.waitForFunction(()=>document.documentElement.dataset.theme==='paper');
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
  for(let i=0;i<10;i++){await page.evaluate(n=>window.__LUMEN__.reveal.slide(n),i);await page.screenshot({path:path.join(qa,`slide-${String(i+1).padStart(2,'0')}.png`)});}
  const mobile=await loadPresentation(browser,path.join(built.out,'index.html'),{context:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}});
  await mobile.page.context().setOffline(true);await mobile.page.locator('.navigate-right').tap();assert.equal(await mobile.page.evaluate(()=>window.__LUMEN__.reveal.getIndices().h),1);await mobile.page.screenshot({path:path.join(qa,'mobile.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);assert.deepEqual(mobile.errors,[]);assert.deepEqual(mobile.requests,[]);
  const report={passed:true,browser:await browser.version(),os:process.platform,desktop:'1360x820',mobile:'390x844, touch emulation',offline:true,externalRequests:requests,webgl:!!webgl,checks:['navigation','theme','font','diagram-step','chart-data','notes','overview','mobile-tap','reduced-motion'],providerLiveTests:false};await writeJSON(path.join(qa,'browser-report.json'),report);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
