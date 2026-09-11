import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
fs.mkdirSync("outputs/verification",{recursive:true});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workroom-browser-models-'));
const project=path.join(root,'project');fs.mkdirSync(project);
const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>Browser model test</title><label>이름<input aria-label="이름"></label><button onclick="document.querySelector(\'#result\').textContent=document.querySelector(\'input\').value">확인</button><p id="result">대기</p>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const env={...process.env,WORKROOM_DATA_DIR:path.join(root,'data'),WORKROOM_TEST_PROJECT:project};delete env.ELECTRON_RUN_AS_NODE;
const results=[];let app;
try {
 app=await electron.launch({args:['.'],env});const page=await app.firstWindow();await page.getByLabel('메시지 입력').waitFor();
 const invoke=(method,args)=>page.evaluate(({method,args})=>window.workroom.invoke(method,args),{method,args});
 await invoke('models.refresh',{});const s=await invoke('state');const projectId=s.projects[0].id;
 await invoke('browser.open',{projectId});
 for(const provider of ['codex','claude','gemini']) {
  await invoke('browser.action',{projectId,action:{action:'navigate',url}});
  const marker=`${provider}_가나다_OK`;
  const run=await invoke('run.start',{projectId,provider,team:provider==='codex',prompt:`내장 브라우저 실제 제어 검사입니다. browser_snapshot/browser_action 도구만 사용해 현재 열린 ${url} 페이지를 읽고 이름 입력란에 ${marker}를 입력하고 확인 버튼을 클릭한 뒤 결과를 읽으세요. 다른 에이전트에 위임하지 마세요. 파일이나 셸, 외부 브라우저, HTTP 요청으로 대체하지 마세요. 해당 도구가 없으면 BROWSER_TOOL_UNAVAILABLE라고 답하세요. 실제 성공을 확인한 경우에만 성공이라고 답하세요.`});
  console.log('Started',provider,run.model);
  let result;const deadline=Date.now()+150000;
  do {result=(await invoke('state')).runs.find(r=>r.id===run.id);if(!['queued','running'].includes(result.status))break;await new Promise(r=>setTimeout(r,1000));}while(Date.now()<deadline);
  if(['queued','running'].includes(result.status))await invoke('run.cancel',{runId:run.id});
  const dom=await app.evaluate(async({webContents},url)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith(url));return wc?.executeJavaScript('document.querySelector("#result")?.textContent');},url);
  const record={provider,model:result.model,reportedModel:result.reportedModel,status:result.status,error:result.error,answer:result.answer,actualPageResult:dom,browserPassed:dom===marker};results.push(record);console.log(JSON.stringify(record));
  fs.writeFileSync('outputs/verification/browser-live-models.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
 }
} finally {if(app)await app.close();server.close();}

