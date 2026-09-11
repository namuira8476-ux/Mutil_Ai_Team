import { useEffect, useState } from "react";
import type { Project, Run } from "./shared";
type ResultFile = {path:string;exists:boolean;canOpen:boolean};
export default function RunResults({run,children,project,onError}:{run:Run;children:Run[];project:Project;onError:(message:string)=>void}) {
  const [files,setFiles]=useState<ResultFile[]>([]);
  const [error,setError]=useState("");
  const [expanded,setExpanded]=useState(false);
  const signature=JSON.stringify([run,...children].map(r=>[r.id,r.status,r.finishedAt,r.files,r.detectedFiles]));
  useEffect(()=>{
    let alive=true;
    void window.workroom.invoke<ResultFile[]>("run.results",{runId:run.id}).then(data=>{if(alive){setFiles(data);setError("");}}).catch(e=>{if(alive)setError(String(e));});
    return()=>{alive=false;};
  },[run.id,signature]);
  const open=async(method:string,path:string)=>{
    try{await window.workroom.invoke(method,{projectId:project.id,path});}catch(e){onError(String(e));}
  };
  return <section className="run-results" aria-label="작업 결과 파일">
    <header><strong>결과·변경 파일 {files.filter(f=>f.exists).length}개</strong><button onClick={()=>void open("project.openResult",project.outputs)}>결과 폴더 열기</button></header>
    {run.status!=="completed" && files.some(f=>f.exists) && <small>완료 전 생성된 파일입니다. 작업 상태와 내용을 확인하세요.</small>}
    {error ? <p>{error}</p> : !files.length && <p>기록된 결과 파일이 없습니다. 답변 내용이나 결과 폴더를 확인하세요.</p>}
    {(expanded?files:files.slice(0,6)).map(file=><div className="result-file" key={file.path}>
      <span title={file.path}>{file.path}{!file.exists && " · 현재 파일 없음"}</span>
      {file.canOpen && <button onClick={()=>void open("project.openResult",file.path)}>열기</button>}
      <button disabled={!file.exists} onClick={()=>void open("project.reveal",file.path)}>파일 위치</button>
      <button onClick={()=>void navigator.clipboard.writeText(project.path.replace(/[\\/]$/,"")+"/"+file.path).catch(e=>onError(String(e)))}>경로 복사</button>
    </div>)}
    {files.length>6 && <button onClick={()=>setExpanded(!expanded)}>{expanded?"접기":`전체 ${files.length}개 보기`}</button>}
  </section>;
}
