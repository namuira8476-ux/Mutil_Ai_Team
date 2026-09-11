import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {snapshotFiles,changedFiles} from '../electron/file-observation';
import {taskResources,resourcesConflict,queueWait} from '../electron/task-scheduling';
import type {Run} from '../src/shared';
it('explains an open terminal blocking a queued task and clears after exit',()=>{
 const terminal={id:'terminal',projectId:'p',provider:'gemini',mode:'terminal',status:'running'} as Run;
 const queued={id:'task',projectId:'p',provider:'codex',mode:'team',status:'queued'} as Run;
 expect(queueWait(queued,[terminal,queued])).toEqual({queueReason:expect.stringContaining('직접 조작 CLI'),blockerIds:['terminal']});
 expect(queueWait(queued,[{...terminal,status:'cancelled'},queued])).toEqual({});
 expect(queueWait({...queued,projectId:'other'},[terminal,queued])).toEqual({});
});
it('tracks individual declared output files without attributing other workers files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workroom-file-scopes-'));const own=path.join(root,'own.md');
 const before=snapshotFiles(root,[own]);fs.writeFileSync(own,'mine');fs.writeFileSync(path.join(root,'other.md'),'other');
 expect(changedFiles(before,snapshotFiles(root,[own]))).toEqual(['own.md']);
});
it('detects directory overlaps and allows shared read-only resources',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workroom-locks-'));
 const a=taskResources(root,{reads:['raw'],writes:['outputs/a']});
 expect(resourcesConflict(a,taskResources(root,{reads:['raw'],writes:['outputs/b']}))).toBe(false);
 expect(resourcesConflict(a,taskResources(root,{reads:['outputs/a/report.md'],writes:[]}))).toBe(true);
 expect(resourcesConflict(a,undefined)).toBe(true);
});
