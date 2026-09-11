import initSqlJs, { type Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";
export class Store {
  db!: Database;
  file: string;
  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "workroom.sqlite");
  }
  async init(wasm: string) {
    const SQL = await initSqlJs({ locateFile: () => wasm });
    this.db = fs.existsSync(this.file)
      ? new SQL.Database(fs.readFileSync(this.file))
      : new SQL.Database();
    this.db.run(
      "CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id))",
    );
    this.db.run("PRAGMA user_version=1");
    return this;
  }
  all<T>(kind: string): T[] {
    const s = this.db.prepare("SELECT data FROM entities WHERE kind=?");
    s.bind([kind]);
    const result: T[] = [];
    while (s.step()) result.push(JSON.parse(s.getAsObject().data as string));
    s.free();
    return result;
  }
  get<T>(kind: string, id: string): T | undefined {
    return this.all<T & { id: string }>(kind).find((x) => x.id === id);
  }
  put<T extends { id: string }>(kind: string, item: T) {
    this.db.run("INSERT OR REPLACE INTO entities VALUES (?,?,?)", [
      kind,
      item.id,
      JSON.stringify(item),
    ]);
    this.save();
  }
  remove(kind: string, id: string) {
    this.db.run("DELETE FROM entities WHERE kind=? AND id=?", [kind, id]);
    this.save();
  }
  save() {
    const temp = this.file + ".tmp";
    fs.writeFileSync(temp, this.db.export());
    fs.renameSync(temp, this.file);
  }
}
