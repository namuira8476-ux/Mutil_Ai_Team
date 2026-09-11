import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {Store} from '../electron/store.ts';
fs.mkdirSync("outputs/verification",{recursive:true});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workroom-browser-'));const project=path.join(root,'project');fs.mkdirSync(project);
const paths={};for(const [id,entry] of Object.entries({codex:'@openai/codex/bin/codex.js',claude:'@anthropic-ai/claude-code/cli.js',gemini:'@google/gemini-cli/dist/index.js'})){const file=path.join(root,'bin/node_modules',entry);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync('tests/fixture-cli.cjs',file);paths[id]=path.join(root,'bin',id+'.cmd');fs.writeFileSync(paths[id],'rem TEST FIXTURE');}
const store=await new Store(path.join(root,'data')).init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));store.put('settings',{id:'app',paths,background:false,reduceMotion:false});store.db.close();
const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>내장 브라우저 테스트</title></head><body style="font:20px sans-serif;padding:30px;background:#faf7ec;min-width:1440px;min-height:2400px"><h1>카드뉴스 자료 작업</h1><label>이름<input aria-label="이름"></label><button>확인</button><script>window.addEventListener("load",()=>{document.querySelector("button").onclick=()=>{document.querySelector("#result").textContent="확인: "+document.querySelector("input").value;};});</script><p id="result">아직 입력 전</p></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const env={...process.env,WORKROOM_DATA_DIR:path.join(root,'data'),WORKROOM_TEST_PROJECT:project};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.env.WORKROOM_PACKAGED_EXE,args:['.'],env});
try{
 const page=await app.firstWindow();await page.getByLabel('메시지 입력').waitFor();
 const invoke=(method,args)=>page.evaluate(({method,args})=>window.workroom.invoke(method,args),{method,args});const state=await invoke('state');const projectId=state.projects[0].id;
 await page.getByRole('button',{name:'내장 브라우저',exact:true}).click();await page.getByLabel('웹 주소').fill(url);await page.getByRole('button',{name:'이동',exact:true}).click();
 await expect.poll(async()=>(await invoke('browser.state',{projectId})).title).toBe('내장 브라우저 테스트');
  const measure=()=>app.evaluate(async({webContents},url)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith(url));return {zoom:wc.getZoomFactor(),...await wc.executeJavaScript('({width:innerWidth,content:document.documentElement.scrollWidth,x:scrollX,y:scrollY,overflow:getComputedStyle(document.documentElement).overflowX})')};},url);
 await expect.poll(async()=>{const m=await measure();return m.content<=m.width+2;},{timeout:10000}).toBe(true);
 await invoke('browser.action',{projectId,action:{action:'scroll',direction:'down'}});
 await expect.poll(async()=>(await measure()).y).toBeGreaterThan(0);
 console.log('Fixed-width page fits and scrolls vertically',await measure());
 await invoke('browser.action',{projectId,action:{action:'scroll',direction:'up'}});
 await expect(invoke('browser.action',{projectId,action:{action:'navigate',url:'javascript:alert(1)'}})).rejects.toThrow('http/https');
 const run=await invoke('run.start',{projectId,provider:'codex',team:true,prompt:'[delegate-models] [browser-fixture] BROWSER_URL='+url});
 await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===run.id)?.status,{timeout:20000}).toBe('completed');
 const result=(await invoke('state')).runs.find(r=>r.id===run.id);expect(JSON.parse(result.answer).text).toContain('확인: 가나다');
 const sandbox=await app.evaluate(async({webContents},url)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith(url));return wc.executeJavaScript('({node:typeof require,bridge:typeof window.workroom})');},url);expect(sandbox).toEqual({node:'undefined',bridge:'undefined'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1366,700));await page.waitForTimeout(250);
 console.log(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.map(v=>({visible:v.getVisible(),bounds:v.getBounds(),url:v.webContents?.getURL()}))));
 const desktop=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{const win=BrowserWindow.getAllWindows()[0];const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1366,height:700}});return sources.find(s=>s.id===win.getMediaSourceId())?.thumbnail.toPNG().toString('base64');});if(desktop)fs.writeFileSync('outputs/verification/embedded-browser-window.png',Buffer.from(desktop,'base64'));
 const screenshot=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));fs.writeFileSync('outputs/verification/debug-embedded-renderer-only.png',Buffer.from(screenshot,'base64'));
 await page.locator('.provider-codex .task-flow').click();
 await expect.poll(async()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.every(v=>!v.getVisible()))).toBe(true);
 await page.getByRole('button',{name:'작업 상세 닫기'}).click();
 await expect.poll(async()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.some(v=>v.getVisible()))).toBe(true);
 await page.getByLabel('Codex 제어',{exact:true}).click();await expect(page.getByLabel('Codex 제어',{exact:true})).not.toBeChecked();const paused=await invoke('run.start',{projectId,provider:'codex',team:true,prompt:'[delegate-models] [browser-fixture] BROWSER_URL='+url});await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===paused.id)?.status,{timeout:15000}).toBe('failed');
 await page.getByRole('button',{name:'대화',exact:true}).click();const input=page.getByLabel('메시지 입력');await input.fill('abc 가나다');await expect(input).toHaveValue('abc 가나다');await input.fill('');
 const shell=await invoke('cli.setup',{provider:'codex',projectId,install:false});await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===shell.id)?.output||'',{timeout:15000}).toContain('Type commands below');
 await page.evaluate(async(id)=>{await window.workroom.invoke('terminal.claim',{runId:id});await window.workroom.invoke('terminal.input',{runId:id,data:"Write-Host 'SETUP_INPUT_OK'\r"});},shell.id);
 await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===shell.id)?.output||'').toContain('SETUP_INPUT_OK');await invoke('run.cancel',{runId:shell.id});
 console.log(JSON.stringify({passed:true,version:await app.evaluate(({app})=>app.getVersion()),checks:['Codex MCP browser navigate/read/fill/click','Korean browser input','isolated web preferences','reject javascript URL','pause agent control','chat keyboard','embedded native view at 1366x700','interactive setup PowerShell without reinstall']}));
}finally{await app.close();server.close();}




