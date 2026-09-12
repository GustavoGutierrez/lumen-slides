import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { buildDeck } from './build.mjs';
import { json, hash, writeJSON } from './core.mjs';

export async function launchBrowser(kind=chromium) {
  return kind.launch({headless:true,...(kind===chromium&&process.env.LUMEN_CHROMIUM_PATH?{executablePath:process.env.LUMEN_CHROMIUM_PATH}:{}),...(kind===chromium?{args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
}
export async function loadPresentation(browser, html, options={}) {
  const page=await browser.newPage({viewport:{width:1360,height:820},reducedMotion:'reduce',...options.context});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const url=pathToFileURL(html);if(options.static)url.searchParams.set('static','1');
  await page.goto(url.href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__LUMEN__?.ready||window.__LUMEN__?.error,{},{timeout:90000});
  const error=await page.evaluate(()=>window.__LUMEN__.error);if(error)throw new Error(error);
  return {page,errors,requests};
}
export async function exportPDF(dir,out=path.join(dir,'output','presentation.pdf')) {
  const built=await buildDeck(dir);
  const browser=await launchBrowser();
  try{
    const {page,errors,requests}=await loadPresentation(browser,path.join(built.out,'index.html'),{static:true});
    await page.evaluate(()=>window.__LUMEN__.preparePrint());
    if(errors.length||requests.length)throw new Error(`PDF renderer errors: ${errors.join('; ')}; external requests: ${requests.length}`);
    await page.emulateMedia({media:'print'});
    await fs.mkdir(path.dirname(path.resolve(out)),{recursive:true});
    await page.pdf({path:out,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,tagged:true});
    const pdf = await PDFDocument.load(await fs.readFile(out));
    if(pdf.getPageCount()!==built.slides)throw new Error(`PDF page count ${pdf.getPageCount()} differs from slide count ${built.slides}`);
    if(path.resolve(out)===path.join(built.out,'presentation.pdf'))await writeJSON(path.join(built.out,'pdf-manifest.json'),{htmlHash:built.sha256,pdfHash:hash(await fs.readFile(out))});
    return {out:path.resolve(out),slides:built.slides,warnings:await page.evaluate(()=>window.__LUMEN__.warnings)};
  }finally{await browser.close();}
}
export async function verifyDeck(dir) {
  const built=await buildDeck(dir);const browser=await launchBrowser();
  try{
    const {page,errors,requests}=await loadPresentation(browser,path.join(built.out,'index.html'),{static:true});
    const measure=()=>[...document.querySelectorAll('.slides>section')].flatMap(s=>{
      const r=s.getBoundingClientRect();
      return [...s.querySelectorAll('h1,h2,h3,p,.chart,.diagram,.scene,.columns,.reference-list')].filter(e=>{
        if(e.closest('.notes')||!e.getClientRects().length)return false;
        const b=e.getBoundingClientRect();return b.left<r.left-2||b.right>r.right+2||b.bottom>r.bottom-62||b.top<r.top-2;
      }).map(e=>({slide:s.id,element:e.className||e.tagName,text:e.textContent.slice(0,90)}));
    });
    const overflow=await page.evaluate(measure);
    const screenHeading=await page.locator('.slides h1,.slides h2').first().evaluate(e=>({font:getComputedStyle(e).fontSize,color:getComputedStyle(e).color}));
    await page.evaluate(()=>window.__LUMEN__.preparePrint());await page.emulateMedia({media:'print'});
    const printOverflow=await page.evaluate(measure);
    const printHeading=await page.locator('.slides h1,.slides h2').first().evaluate(e=>({font:getComputedStyle(e).fontSize,color:getComputedStyle(e).color}));
    if(JSON.stringify(screenHeading)!==JSON.stringify(printHeading))errors.push('Print styles changed heading size or color');
    const report={passed:!errors.length&&!requests.length&&!overflow.length&&!printOverflow.length,slides:built.slides,errors,externalRequests:requests,overflow,printOverflow,warnings:await page.evaluate(()=>window.__LUMEN__.warnings)};
    await writeJSON(path.join(dir,'verification.json'),report);
    if(!report.passed)throw new Error(`Verification failed: ${JSON.stringify(report)}`);
    return report;
  }finally{await browser.close();}
}
export async function packDeck(dir,out=path.join(dir,'presentation.zip')) {
  const built=await buildDeck(dir);const entries={};
  const files=['index.html','deck.json','sources.json','LEEME.txt','THIRD-PARTY-LICENSES.txt','manifest.json'];
  try {
    const receipt=await json(path.join(built.out,'pdf-manifest.json'));
    const bytes=await fs.readFile(path.join(built.out,'presentation.pdf'));
    if(receipt.htmlHash!==built.sha256||receipt.pdfHash!==hash(bytes))throw new Error('PDF is stale or modified; run pdf again before packaging.');
    files.push('presentation.pdf','pdf-manifest.json');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  for(const file of files)entries[file]=[new Uint8Array(await fs.readFile(path.join(built.out,file))),{mtime:new Date(2020,0,1)}];
  await fs.mkdir(path.dirname(path.resolve(out)),{recursive:true});await fs.writeFile(out,zipSync(entries,{level:6}));return {out:path.resolve(out)};
}
