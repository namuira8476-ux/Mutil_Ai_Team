import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { Store } from "./store";
import { InAppBrowser } from "./in-app-browser";
import { runResults, viewableResult } from "./run-results";
import { Runtime } from "./runtime";
import { safePath } from "./domain";
import { importSchema } from "./import-schema";
import { modelSchema, modelDefaultsSchema } from "./model-selection";
import type { Automation, Project, Skill } from "../src/shared";
let runtime: Runtime;
let browser: InAppBrowser;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let closing = false;
const owners = new Map<string, number>();
if (process.env.WORKROOM_DATA_DIR)
  app.setPath("userData", process.env.WORKROOM_DATA_DIR);
const oneInstance = app.requestSingleInstanceLock();
if (!oneInstance) app.quit();
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.focus();
}
app.on("second-instance", showMainWindow);
const id = z.string().min(1).max(150),
  provider = z.enum(["codex", "claude", "gemini"]);
const step = z.object({
  provider,
  model: modelSchema.optional(),
  skillId: id,
  skillVersion: z.number().int().positive(),
});
const autoSchema = z.object({
  id: z.string().max(150),
  projectId: id,
  name: z.string().min(1).max(120),
  enabled: z.boolean(),
  trigger: z.enum(["schedule", "file", "success"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(100),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  input: z.string().max(1000),
  output: z.string().max(1000),
  steps: z.array(step).min(1).max(3),
  sourceSkillId: z.string().optional(),
  createdAt: z.number().optional(),
});
function windowOptions() {
  return {
    width: 1560,
    height: 1020,
    minWidth: 1024,
    minHeight: 700,
    title: "Agent Studio",
    backgroundColor: "#f7f3ea",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}
async function makeWindow(runId?: string) {
  const win = new BrowserWindow(windowOptions());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const hash = runId ? `terminal=${encodeURIComponent(runId)}` : "";
  if (process.env.WORKROOM_DEV_URL)
    await win.loadURL(process.env.WORKROOM_DEV_URL + (hash ? "#" + hash : ""));
  else await win.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  win.show();
  win.focus();
  win.webContents.focus();
  if (runId) {
    owners.set(runId, win.webContents.id);
    broadcast({ type: "ownership", runId });
  }
  const ownerId = win.webContents.id;
  win.on("closed", () => {
    for (const [id, owner] of owners)
      if (owner === ownerId) {
        owners.delete(id);
        broadcast({ type: "ownership", runId: id });
      }
  });
  return win;
}
function broadcast(event: unknown) {
  for (const win of BrowserWindow.getAllWindows())
    if (!win.isDestroyed()) win.webContents.send("workroom:event", event);
}
function requireWindow(senderId: number) {
  const win = BrowserWindow.getAllWindows().find(
    (w) => w.webContents.id === senderId,
  );
  if (!win) throw Error("알 수 없는 앱 창입니다.");
  return win;
}
app
  .whenReady()
  .then(async () => {
    if (!oneInstance) return;
    const wasm = app.isPackaged
      ? path.join(process.resourcesPath, "resources/sql-wasm.wasm")
      : path.join(app.getAppPath(), "resources/sql-wasm.wasm");
    const store = await new Store(app.getPath("userData")).init(wasm);
    runtime = await new Runtime(store).init();
    runtime.on("event", broadcast);
    browser = new InAppBrowser(() => mainWindow, broadcast);
    runtime.browser = browser;
    if (process.env.WORKROOM_TEST_PROJECT)
      runtime.addProject(process.env.WORKROOM_TEST_PROJECT);
    ipcMain.handle(
      "workroom:invoke",
      async (event, method: string, raw: any) => {
        const win = requireWindow(event.sender.id);
        z.string().max(100).parse(method);
        switch (method) {
          case "browser.open":
          case "browser.state":
          case "browser.bounds":
          case "browser.allow":
          case "browser.action": {
            if (win !== mainWindow)
              throw Error("메인 작업실에서 브라우저를 열어주세요.");
            const projectId = z.string().min(1).max(150).parse(raw?.projectId);
            runtime.project(projectId);
            if (method === "browser.open") return browser.open(projectId);
            if (method === "browser.state") return browser.state(projectId);
            if (method === "browser.allow")
              return browser.allow(projectId, z.boolean().parse(raw.enabled));
            if (method === "browser.action")
              return browser.action(projectId, raw.action, false);
            const rect = z
              .object({
                x: z.number().finite(),
                y: z.number().finite(),
                width: z.number().nonnegative().finite(),
                height: z.number().nonnegative().finite(),
              })
              .parse(raw.rect);
            return browser.bounds(
              projectId,
              rect,
              z.boolean().parse(raw.visible),
            );
          }
          case "cli.autoConnect":
            return runtime.autoConnect(
              z.object({ provider: provider.optional() }).parse(raw || {})
                .provider,
            );
          case "cli.setup": {
            const p = z
              .object({
                provider,
                projectId: id.optional(),
                install: z.boolean().default(false),
              })
              .parse(raw);
            return runtime.startSetup(p.provider, p.projectId, p.install);
          }
          case "state":
            return runtime.state();
          case "providers.refresh":
            return runtime.refreshProviders();
          case "providers.quota":
            return runtime.refreshQuota();
          case "project.pick": {
            const r = await dialog.showOpenDialog(win, {
              properties: ["openDirectory"],
            });
            return r.canceled ? null : runtime.addProject(r.filePaths[0]);
          }
          case "project.update": {
            const p = z
              .object({
                id,
                name: z.string().min(1).max(120),
                raw: z.string().max(1000),
                wiki: z.string().max(1000),
                outputs: z.string().max(1000),
              })
              .parse(raw);
            return runtime.updateProject(p as Project);
          }
          case "project.files": {
            const p = z
              .object({ projectId: id, path: z.string().max(2000).default("") })
              .parse(raw);
            return runtime.listFiles(p.projectId, p.path);
          }
          case "project.read": {
            const p = z
              .object({ projectId: id, path: z.string().max(2000) })
              .parse(raw);
            return runtime.readFile(p.projectId, p.path);
          }
          case "project.reveal": {
            const p = z
              .object({ projectId: id, path: z.string().max(2000).default("") })
              .parse(raw);
            shell.showItemInFolder(
              safePath(runtime.project(p.projectId).path, p.path),
            );
            return true;
          }
          case "run.results": {
            const p = z.object({runId:id}).parse(raw);
            const state = runtime.state();
            const run = state.runs.find(r => r.id === p.runId);
            if (!run) throw Error("작업을 찾을 수 없습니다.");
            return runResults(runtime.project(run.projectId).path, run, state.runs);
          }
          case "project.openResult": {
            const p = z.object({projectId:id,path:z.string().max(2000)}).parse(raw);
            const file = safePath(runtime.project(p.projectId).path,p.path);
            if (!fs.existsSync(file)) throw Error("파일이 이동되거나 삭제되었습니다.");
            if (!fs.statSync(file).isDirectory() && !viewableResult.test(file)) {
              shell.showItemInFolder(file);
              return true;
            }
            const error = await shell.openPath(file);
            if (error) throw Error(error);
            return true;
          }
          case "skill.save": {
            const p = z
              .object({
                id: z
                  .string()
                  .regex(/^[a-zA-Z0-9-]*$/)
                  .max(100),
                name: z.string().min(1).max(100),
                description: z.string().min(1).max(500),
                instructions: z.string().min(10).max(30000),
                icon: z.enum(["book", "code", "check"]),
              })
              .parse(raw);
            return runtime.saveSkill(p as Skill);
          }
          case "run.start": {
            const p = z
              .object({
                projectId: id,
                provider,
                model: modelSchema.optional(),
                prompt: z.string().min(1).max(30000),
                skillId: id.optional(),
                skillVersion: z.number().int().positive().optional(),
                team: z.boolean().optional(),
                replyTo: id.optional(),
              })
              .parse(raw);
            return runtime.startTask(p);
          }
          case "terminal.start": {
            const p = z
              .object({
                projectId: id,
                provider,
                model: modelSchema.optional(),
              })
              .parse(raw);
            return runtime.startTerminal(p.projectId, p.provider, p.model);
          }
          case "models.refresh": {
            const p = z
              .object({ provider: provider.optional() })
              .parse(raw || {});
            return runtime.refreshModels(p.provider);
          }
          case "terminal.claim": {
            const p = z.object({ runId: id }).parse(raw);
            owners.set(p.runId, event.sender.id);
            broadcast({ type: "ownership", runId: p.runId });
            return true;
          }
          case "terminal.owner":
            return (
              owners.get(z.object({ runId: id }).parse(raw).runId) ===
              event.sender.id
            );
          case "terminal.input": {
            const p = z
              .object({ runId: id, data: z.string().max(100000) })
              .parse(raw);
            if (owners.get(p.runId) !== event.sender.id)
              throw Error("먼저 이 창에서 입력 권한을 가져오세요.");
            return runtime.terminalInput(p.runId, p.data);
          }
          case "terminal.resize": {
            const p = z
              .object({
                runId: id,
                cols: z.number().int(),
                rows: z.number().int(),
              })
              .parse(raw);
            return runtime.resize(p.runId, p.cols, p.rows);
          }
          case "terminal.popout": {
            const p = z.object({ runId: id }).parse(raw);
            await makeWindow(p.runId);
            return true;
          }
          case "run.cancel":
            return runtime.cancel(z.object({ runId: id }).parse(raw).runId);
          case "automation.save":
            return runtime.saveAutomation(autoSchema.parse(raw) as Automation);
          case "automation.preview":
            return runtime.automationPreview(
              autoSchema.parse(raw) as Automation,
            );
          case "automation.run": {
            const p = z
              .object({ id, test: z.boolean().default(true) })
              .parse(raw);
            return runtime.executeAutomation(p.id, p.test);
          }
          case "automation.delete":
            return runtime.removeAutomation(z.object({ id }).parse(raw).id);
          case "settings.save": {
            const p = z
              .object({
                paths: z
                  .object({
                    codex: z.string().max(2000).optional(),
                    claude: z.string().max(2000).optional(),
                    gemini: z.string().max(2000).optional(),
                  })
                  .optional(),
                background: z.boolean().optional(),
                reduceMotion: z.boolean().optional(),
                models: modelDefaultsSchema.optional(),
              })
              .parse(raw);
            return runtime.saveSettings(p);
          }
          case "settings.pickCli": {
            const r = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
            });
            return r.canceled ? null : r.filePaths[0];
          }
          case "settings.data":
            await shell.openPath(runtime.store.dir);
            return true;
          case "settings.export": {
            const r = await dialog.showSaveDialog(win, {
              defaultPath: "agent-workroom-settings.json",
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (!r.canceled && r.filePath) {
              fs.writeFileSync(
                r.filePath,
                JSON.stringify(runtime.exportData(), null, 2),
              );
              return r.filePath;
            }
            return null;
          }
          case "settings.import": {
            const r = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (r.canceled) return null;
            const file = r.filePaths[0];
            if (fs.statSync(file).size > 5 * 1024 * 1024)
              throw Error("가져오기 파일이 너무 큽니다.");
            const data = importSchema.parse(
              JSON.parse(fs.readFileSync(file, "utf8")),
            );
            if (
              data.format !== "agent-workroom" ||
              !Array.isArray(data.projects) ||
              data.projects.length > 100
            )
              throw Error("올바른 설정 파일이 아닙니다.");
            const mapping: Record<string, string> = {};
            for (const p of data.projects) {
              const picked = await dialog.showOpenDialog(win, {
                title: `프로젝트 경로 연결: ${String(p.name).slice(0, 80)} (취소하면 건너뜀)`,
                properties: ["openDirectory"],
              });
              if (!picked.canceled) mapping[p.id] = picked.filePaths[0];
            }
            return runtime.importData(data, mapping);
          }
          case "conversation.openLink": {
            const url = z.string().url().max(8000).parse(raw);
            if (!["https:", "http:"].includes(new URL(url).protocol))
              throw Error("웹 링크만 열 수 있습니다.");
            await shell.openExternal(url);
            return true;
          }
          case "external.open": {
            const url = z.string().url().parse(raw);
            const u = new URL(url);
            if (
              u.protocol !== "https:" ||
              ![
                "learn.chatgpt.com",
                "developers.openai.com",
                "code.claude.com",
                "geminicli.com",
                "antigravity.google",
              ].includes(u.hostname)
            )
              throw Error("허용되지 않은 링크입니다.");
            await shell.openExternal(url);
            return true;
          }
          default:
            throw Error("지원되지 않는 작업입니다.");
        }
      },
    );
    mainWindow = await makeWindow();
    mainWindow.on("close", (e) => {
      if (!closing && runtime.settings.background) {
        e.preventDefault();
        mainWindow?.hide();
      }
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    tray = new Tray(
      nativeImage
        .createFromPath(path.join(__dirname, "../dist/assets/agent-atlas.png"))
        .resize({ width: 24, height: 16 }),
    );
    tray.setToolTip("Agent Studio");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "작업실 열기", click: showMainWindow },
        { label: "완전히 종료", click: () => app.quit() },
      ]),
    );
    tray.on("click", showMainWindow);
  })
  .catch((e) => {
    console.error(e);
    dialog.showErrorBox("작업실 시작 실패", String(e));
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (!runtime?.settings.background) app.quit();
});
app.on("before-quit", (e) => {
  if (closing) return;
  e.preventDefault();
  closing = true;
  browser?.dispose();
  void runtime?.dispose().finally(() => app.quit());
});

