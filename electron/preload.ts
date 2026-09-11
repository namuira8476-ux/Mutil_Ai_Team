import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("workroom", {
  invoke: (method: string, payload?: unknown) =>
    ipcRenderer.invoke("workroom:invoke", method, payload),
  onEvent: (fn: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => fn(data);
    ipcRenderer.on("workroom:event", listener);
    return () => ipcRenderer.removeListener("workroom:event", listener);
  },
});
