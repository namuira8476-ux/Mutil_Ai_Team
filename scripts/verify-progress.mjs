import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Store} from '../electron/store.ts';
fs.mkdirSync("outputs/verification",{recursive:true});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workroom-browser-'));const project=path.join(root,'project');fs.mkdirSync(project);
const paths={};for(const [id,entry] of Object.entries({codex:'@openai/codex/bin/codex.js',claude:'@anthropic-ai/claude-code/cli.js',gemini:'@google/gemini-cli/dist/index.js'})){const file=path.join(root,'bin/node_modules',entry);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync('tests/fixture-cli.cjs',file);paths[id]=path.join(root,'bin',id+'.cmd');fs.writeFileSync(paths[id],'rem TEST FIXTURE');}
const store=await new Store(path.join(root,'data')).init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));store.put('settings',{id:'app',paths,background:false,reduceMotion:false});store.db.close();
const env={...process.env,WORKROOM_DATA_DIR:path.join(root,'data'),WORKROOM_TEST_PROJECT:project};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.'],env});
try {
 const page=await app.firstWindow();await page.getByLabel('메시지 입력').waitFor();const invoke=(method,args)=>page.evaluate(({method,args})=>window.workroom.invoke(method,args),{method,args});const state=await invoke('state');const projectId=state.projects[0].id;
 const terminal=await invoke('terminal.start',{projectId,provider:'gemini'});
 const queued=await invoke('run.start',{projectId,provider:'codex',prompt:'[slow] 진행 상태 확인'});
 const panel=page.getByRole('region',{name:'실시간 작업 상태'});
 await expect(panel.getByText(/직접 조작 CLI가 프로젝트를 사용 중/)).toBeVisible();
 await expect(panel.getByRole('button',{name:'Gemini(agy) 대기 중인 CLI 열기'})).toBeVisible();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1366,700));
 const input=page.getByLabel('메시지 입력');await input.fill('abc 가나다');await expect(input).toHaveValue('abc 가나다');await input.fill('');
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 await page.screenshot({path:'outputs/verification/progress-queue-blocker.png'});
 await panel.getByRole('button',{name:'직접 조작 CLI 종료하고 대기 작업 진행'}).click();
 await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===terminal.id).status).toBe('cancelled');
 await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===queued.id).status,{timeout:20000}).toBe('completed');
 const finished=(await invoke('state')).runs.find(r=>r.id===queued.id);expect(finished.lastOutputAt).toBeGreaterThanOrEqual(finished.executionStartedAt);
 expect(finished.executionStartedAt).toBeGreaterThan(finished.startedAt);
 const report={passed:true,checks:['terminal blocker reason visible','blocked CLI accessible','closing terminal resumes queue','CLI output timestamp','real execution time distinct from queued time','1366x700 no document overflow','English/Korean input']};fs.writeFileSync('outputs/verification/progress-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await app.close();}

