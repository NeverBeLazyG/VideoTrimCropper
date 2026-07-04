// preload.js — sichere Brücke zwischen Renderer und Main (contextIsolation).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // App-Infos (Name, Version)
  getAppInfo: () => ipcRenderer.invoke("app:info"),

  // Datei-Handling
  openVideo: (lang) => ipcRenderer.invoke("dialog:openVideo", lang),
  // Pfad einer per Drag&Drop fallengelassenen Datei (File.path ist entfernt)
  getDroppedPath: (file) => webUtils.getPathForFile(file),
  // Datei, die per „Öffnen mit" / Kommandozeile übergeben wurde
  onOpenFile: (cb) => {
    const listener = (_e, filePath) => cb(filePath);
    ipcRenderer.on("open-file", listener);
    return () => ipcRenderer.removeListener("open-file", listener);
  },
  probe: (filePath) => ipcRenderer.invoke("ffprobe", filePath),
  // In-App genutzte file:// URL für <video> aus einem lokalen Pfad bauen
  toFileUrl: (filePath) => ipcRenderer.invoke("path:toFileUrl", filePath),

  // Export
  startExport: (opts) => ipcRenderer.invoke("export:start", opts),
  cancelExport: () => ipcRenderer.invoke("export:cancel"),
  onExportProgress: (cb) => {
    const listener = (_e, frac) => cb(frac);
    ipcRenderer.on("export:progress", listener);
    return () => ipcRenderer.removeListener("export:progress", listener);
  },

  // Fenstersteuerung (frameless)
  win: {
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:toggleMaximize"),
    close: () => ipcRenderer.send("win:close"),
    setSize: (w, h, recenter) => ipcRenderer.send("win:setSize", w, h, !!recenter),
    compact: () => ipcRenderer.send("win:compact"),
  },
});
