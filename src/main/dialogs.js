// dialogs.js — Öffnen-/Speichern-Dialoge (lokalisiert).
const { dialog } = require("electron");
const path = require("path");

const VIDEO_EXTS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "flv", "ts", "mpg", "mpeg"];

const T = {
  de: {
    open: "Video öffnen",
    save: "Als Kopie speichern",
    videos: "Videos",
    allFiles: "Alle Dateien",
  },
  en: {
    open: "Open video",
    save: "Save a copy",
    videos: "Videos",
    allFiles: "All files",
  },
};
const t = (lang) => T[lang] || T.de;

async function openVideo(win, lang) {
  const s = t(lang);
  const res = await dialog.showOpenDialog(win, {
    title: s.open,
    properties: ["openFile"],
    filters: [
      { name: s.videos, extensions: VIDEO_EXTS },
      { name: s.allFiles, extensions: ["*"] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
}

async function saveVideo(win, sourcePath, lang) {
  const s = t(lang);
  const dir = path.dirname(sourcePath);
  const ext = path.extname(sourcePath) || ".mp4";
  const base = path.basename(sourcePath, ext);
  const defaultPath = path.join(dir, `${base}_trim${ext}`);
  const res = await dialog.showSaveDialog(win, {
    title: s.save,
    defaultPath,
    filters: [{ name: s.videos, extensions: [ext.replace(".", "") || "mp4"] }],
  });
  if (res.canceled || !res.filePath) return null;
  return res.filePath;
}

module.exports = { openVideo, saveVideo, VIDEO_EXTS };
