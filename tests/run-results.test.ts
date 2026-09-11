import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runResults} from '../electron/run-results';
import type {Run} from '../src/shared';
it('collects child results, deduplicates, marks missing files and rejects paths outside the project',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-results-'));fs.mkdirSync(path.join(root,'outputs'));fs.writeFileSync(path.join(root,'outputs/card.png'),'fixture');fs.writeFileSync(path.join(root,'outputs/task.cmd'),'echo fixture');
 const parent={id:'p',projectId:'project',files:['outputs/card.png','../outside.txt'],detectedFiles:['outputs/deleted.md']} as Run;
 const child={id:'c',parentId:'p',projectId:'project',files:['outputs/card.png','outputs/task.cmd']} as Run;
 const other={...child,id:'other',projectId:'other',files:['outputs/unrelated.md']} as Run;
 const results=runResults(root,parent,[parent,child,other]);
 expect(results).toHaveLength(3);
 expect(results.find(f=>f.path.endsWith('card.png'))).toMatchObject({exists:true,canOpen:true});
 expect(results.find(f=>f.path.endsWith('task.cmd'))).toMatchObject({exists:true,canOpen:false});
 expect(results.find(f=>f.path.endsWith('deleted.md'))).toMatchObject({exists:false,canOpen:false});
});
