// main.js — Electron-Einstiegspunkt: Fenster, IPC, Export-Lifecycle.
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const url = require("url");
const fs = require("fs");
const ffmpeg = require("./ffmpeg");
const dialogs = require("./dialogs");

let mainWindow = null;
let activeExport = null; // { cancel } während eines laufenden Exports

// Ersten übergebenen Videopfad aus den Startargumenten ziehen (z. B. „Öffnen mit").
// Scannt alle Argumente – robust gegenüber unterschiedlichem argv-Layout
// (Erststart vs. second-instance, gepackt vs. Entwicklung).
function fileFromArgv(argv) {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a || a.startsWith("-") || a === ".") continue;
    const ext = path.extname(a).slice(1).toLowerCase();
    if (!dialogs.VIDEO_EXTS.includes(ext)) continue;
    try {
      if (fs.existsSync(a) && fs.statSync(a).isFile()) return a;
    } catch (_) {}
  }
  return null;
}

function openFileInWindow(filePath) {
  if (mainWindow && filePath) {
    mainWindow.webContents.send("open-file", filePath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 600,
    minWidth: 560,
    minHeight: 460,
    backgroundColor: "#1c1b1f",
    icon: path.join(__dirname, "..", "..", "assets", "VideoTrimCropper.ico"),
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  // Beim Start via „Öffnen mit" den übergebenen Dateipfad laden.
  const initialFile = fileFromArgv(process.argv);
  if (initialFile) {
    mainWindow.webContents.once("did-finish-load", () => openFileInWindow(initialFile));
  }

  // Dev-Komfort (env-gesteuert, in Produktion inaktiv): Sprache/Datei vorgeben.
  if (process.env.VTC_LANG || process.env.VTC_OPEN) {
    mainWindow.webContents.on("did-finish-load", () => {
      if (process.env.VTC_LANG) {
        mainWindow.webContents.executeJavaScript(
          `window.I18N && window.I18N.apply(${JSON.stringify(process.env.VTC_LANG)})`
        ).catch(() => {});
      }
      if (process.env.VTC_OPEN) {
        mainWindow.webContents.executeJavaScript(
          `window.__vtc && window.__vtc.loadFile(${JSON.stringify(process.env.VTC_OPEN)})`
        ).catch(() => {});
      }
    });
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));
}

const APP_NAME = "Video Trim Cropper";

// --- IPC: App-Info ---------------------------------------------------------
ipcMain.handle("app:info", async () => {
  const enc = await ffmpeg.getHwEncoder();
  return {
    name: APP_NAME,
    version: app.getVersion(),
    encoder: ffmpeg.encoderLabel(enc),
    hwAccel: !!enc,
  };
});

// --- IPC: Dateien ----------------------------------------------------------
ipcMain.handle("dialog:openVideo", async (_e, lang) => {
  return dialogs.openVideo(mainWindow, lang);
});

ipcMain.handle("ffprobe", async (_e, filePath) => {
  return ffmpeg.probe(filePath);
});

ipcMain.handle("path:toFileUrl", async (_e, filePath) => {
  return url.pathToFileURL(filePath).href;
});

// --- IPC: Export -----------------------------------------------------------
ipcMain.handle("export:start", async (_e, opts) => {
  // Zielpfad wählen
  const output = await dialogs.saveVideo(mainWindow, opts.input, opts.lang);
  if (!output) return { cancelled: true };

  const job = ffmpeg.runExport(
    { ...opts, output },
    (frac) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("export:progress", frac);
      }
    }
  );
  activeExport = job;

  try {
    const res = await job.promise;
    activeExport = null;
    return { ok: true, output: res.output };
  } catch (err) {
    activeExport = null;
    if (err && err.message === "cancelled") return { cancelled: true };
    return { ok: false, error: err ? err.message : "Unknown error" };
  }
});

ipcMain.handle("export:cancel", async () => {
  if (activeExport) activeExport.cancel();
  return true;
});

// --- IPC: Fenstergröße -----------------------------------------------------
const COMPACT = { width: 720, height: 600 };

// Content-Größe exakt setzen (der Renderer rechnet passend zum Video).
// recenter=true nur beim frischen Öffnen; beim Crop-Toggle Position beibehalten.
ipcMain.on("win:setSize", (_e, w, h, recenter) => {
  if (!mainWindow || !w || !h) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  const { workAreaSize } = screen.getPrimaryDisplay();
  const cw = Math.min(Math.round(w), Math.floor(workAreaSize.width * 0.95));
  const ch = Math.min(Math.round(h), Math.floor(workAreaSize.height * 0.95));
  mainWindow.setContentSize(cw, ch);
  if (recenter) mainWindow.center();
});

ipcMain.on("win:compact", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setContentSize(COMPACT.width, COMPACT.height);
  mainWindow.center();
});

// --- IPC: Fenstersteuerung -------------------------------------------------
ipcMain.on("win:minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("win:toggleMaximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("win:close", () => mainWindow && mainWindow.close());

// --- App-Lifecycle ---------------------------------------------------------
// Single-Instance: eine zweite „Öffnen mit"-Datei landet im bestehenden Fenster.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    openFileInWindow(fileFromArgv(argv));
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
