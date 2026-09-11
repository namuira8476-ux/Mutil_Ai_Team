import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Store} from '../electron/store.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workroom-browser-'));const project=path.join(root,'project');fs.mkdirSync(project);
const paths={};for(const [id,entry] of Object.entries({codex:'@openai/codex/bin/codex.js',claude:'@anthropic-ai/claude-code/cli.js',gemini:'@google/gemini-cli/dist/index.js'})){const file=path.join(root,'bin/node_modules',entry);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync('tests/fixture-cli.cjs',file);paths[id]=path.join(root,'bin',id+'.cmd');fs.writeFileSync(paths[id],'rem TEST FIXTURE');}
const store=await new Store(path.join(root,'data')).init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));store.put('settings',{id:'app',paths,background:false,reduceMotion:false});store.db.close();
const env={...process.env,WORKROOM_DATA_DIR:path.join(root,'data'),WORKROOM_TEST_PROJECT:project};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.'],env});
try {
 const page=await app.firstWindow();await page.getByLabel('메시지 입력').waitFor();const invoke=(method,args)=>page.evaluate(({method,args})=>window.workroom.invoke(method,args),{method,args});const state=await invoke('state');const projectId=state.projects[0].id;
 const run=await invoke('run.start',{projectId,provider:'gemini',prompt:'[write-output]'});
 await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===run.id).status).toBe('completed');
 const results=page.locator(`[data-chat-run="${run.id}"]`).getByRole('region',{name:'작업 결과 파일'});
 await expect(results.getByText('outputs\\fixture.md',{exact:true})).toBeVisible();
 await expect(results.getByRole('button',{name:'열기',exact:true})).toBeVisible();
 await expect(results.getByRole('button',{name:'파일 위치',exact:true})).toBeVisible();
 await expect(results.getByRole('button',{name:'결과 폴더 열기',exact:true})).toBeVisible();
 await app.evaluate(({shell})=>{globalThis.openedResult='';shell.openPath=async file=>{globalThis.openedResult=file;return '';};});
 await results.getByRole('button',{name:'열기',exact:true}).click();
 expect(await app.evaluate(()=>globalThis.openedResult)).toBe(path.join(project,'outputs','fixture.md'));
 await page.screenshot({path:'outputs/verification/completed-result-files.png'});
 const team=await invoke('run.start',{projectId,provider:'codex',team:true,prompt:'[delegate-models] [parallel-fixture]'});
 await expect.poll(async()=>page.locator('[data-arc-run]').count(),{timeout:15000}).toBeGreaterThan(0);
 await expect.poll(async()=>(await invoke('state')).runs.find(r=>r.id===team.id).status,{timeout:25000}).toBe('completed');
 await expect(page.locator('[data-arc-run]')).toHaveCount(0);
 await page.screenshot({path:'outputs/verification/completed-arrows-off.png'});
 console.log(JSON.stringify({passed:true,checks:['result file listed after completion','open/location/folder actions visible','open button resolves actual project file','parallel call arrows present while running','all colored paths removed after completion']}));
} finally {await app.close();}
