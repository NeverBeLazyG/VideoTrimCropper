// renderer.js — verbindet UI, Timeline, Crop und den ffmpeg-Export.
(function () {
  const $ = (id) => document.getElementById(id);

  const app = $("app");
  const video = $("video");
  const notice = $("notice");

  const els = {
    title: $("title"),
    dropzone: $("dropzone"),
    btnOpen: $("btn-open"),
    btnBack: $("btn-back"),
    btnSave: $("btn-save"),
    btnCancel: $("btn-cancel"),
    btnPlay: $("btn-play"),
    iconPlay: $("icon-play"),
    iconPause: $("icon-pause"),
    timeDisplay: $("time-display"),
    labelStart: $("label-start"),
    labelEnd: $("label-end"),
    modeSwitch: $("mode-switch"),
    btnCrop: $("btn-crop"),
    btnCropApply: $("btn-crop-apply"),
    btnCropReset: $("btn-crop-reset"),
    ratioGroup: $("ratio-group"),
    videoWrapper: $("video-wrapper"),
    cropOverlay: $("crop-overlay"),
    cropRect: $("crop-rect"),
    progressOverlay: $("progress-overlay"),
    progressCard: $("progress-card"),
    progressTitle: $("progress-title"),
    progressSub: $("progress-sub"),
    progressFill: $("progress-fill"),
    btnCancelExport: $("btn-cancel-export"),
    btnSettings: $("btn-settings"),
    settingsOverlay: $("settings-overlay"),
    settingsClose: $("settings-close"),
    langSelect: $("lang-select"),
    appVersion: $("app-version"),
    appEncoder: $("app-encoder"),
  };

  const state = {
    filePath: null,
    meta: null,
    userMode: "lossless",
    cropEditing: false, // Rahmen wird gerade gezogen (dunkel)
    cropApplied: false, // Zuschnitt übernommen (Vorschau zeigt Ausschnitt, hell)
    wasPlayingBeforeScrub: false,
  };

  // --- Zeitformatierung ------------------------------------------------------
  function parts(sec) {
    sec = Math.max(0, sec || 0);
    const mm = Math.floor(sec / 60);
    const ss = Math.floor(sec % 60);
    const cc = Math.floor((sec * 100) % 100);
    const p = (n) => String(n).padStart(2, "0");
    return { mm: p(mm), ss: p(ss), cc: p(cc) };
  }
  function fmtSmall(sec) {
    const t = parts(sec);
    return `${t.mm}:${t.ss}.${t.cc}`;
  }
  function fmtBig(sec) {
    const t = parts(sec);
    return `${t.mm} : ${t.ss} . ${t.cc}`;
  }

  // --- Timeline & Crop instanziieren ----------------------------------------
  const timeline = new window.Timeline($("timeline"), {
    onSeek: (t) => {
      video.currentTime = t;
      els.timeDisplay.textContent = fmtBig(t);
    },
    onTrimChange: (start, end, which) => {
      els.labelStart.textContent = fmtSmall(start);
      els.labelEnd.textContent = fmtSmall(end);
      const t = which === "end" ? end : start;
      video.currentTime = t;
      els.timeDisplay.textContent = fmtBig(t);
    },
    onScrubStart: () => {
      state.wasPlayingBeforeScrub = !video.paused;
      video.pause();
    },
    onScrubEnd: () => {
      if (state.wasPlayingBeforeScrub) video.play();
    },
  });

  const crop = new window.CropTool(els.cropOverlay, els.cropRect);

  // --- Datei laden -----------------------------------------------------------
  async function loadFile(filePath) {
    let meta;
    try {
      meta = await window.api.probe(filePath);
    } catch (err) {
      alert(window.I18N.t("alert_read") + "\n" + err.message);
      return;
    }
    state.filePath = filePath;
    state.meta = meta;

    const src = await window.api.toFileUrl(filePath);
    video.src = src;
    video.load();

    const name = filePath.split(/[\\/]/).pop();
    els.title.textContent = name;
    document.title = name + " – Video Trim Cropper";

    // Timeline & Crop aus Metadaten aufsetzen (unabhängig von der Vorschau).
    const dur = meta.duration || 0;
    timeline.setDuration(dur);
    crop.setVideoSize(meta.width, meta.height);
    crop.reset();
    els.labelStart.textContent = fmtSmall(0);
    els.labelEnd.textContent = fmtSmall(dur);
    els.timeDisplay.textContent = fmtBig(0);

    // Crop-Modus zurücksetzen
    els.ratioGroup.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.ratio === "free");
    });
    state.userMode = "lossless";
    removeCrop();

    app.classList.add("has-video");
    notice.classList.remove("show");

    // Fenster präzise an die Videogröße anpassen (nach dem Layout messen)
    requestAnimationFrame(() => fitWindowToVideo(true));
  }

  // Berechnet die Fenstergröße so, dass die Stage exakt der Videohöhe entspricht.
  // recenter: true = Fenster zentrieren (frisches Öffnen), false = Position halten.
  function fitWindowToVideo(recenter) {
    const vw = (state.meta && state.meta.width) || video.videoWidth;
    const vh = (state.meta && state.meta.height) || video.videoHeight;
    if (!vw || !vh) return;

    const stageEl = $("stage");
    // Fixe Chrome-Höhe = Fensterhöhe minus Stage-Höhe (alle Nicht-Stage-Elemente).
    const chromeH = window.innerHeight - stageEl.offsetHeight;
    const sidePad = 48; // Stage-Padding links/rechts (2 × 24)

    const availW = window.screen.availWidth * 0.9;
    const availH = window.screen.availHeight * 0.9;
    const aspect = vw / vh;

    const maxVideoW = availW - sidePad;
    const maxVideoH = availH - chromeH;

    let dispW = Math.min(vw, maxVideoW);
    let dispH = dispW / aspect;
    if (dispH > maxVideoH) {
      dispH = maxVideoH;
      dispW = dispH * aspect;
    }
    if (dispW < 480) { dispW = 480; dispH = dispW / aspect; }

    const contentW = Math.round(Math.max(700, dispW + sidePad));
    const contentH = Math.round(chromeH + dispH + 2);
    window.api.win.setSize(contentW, contentH, recenter);
  }

  // Fenster nach einem Crop-Zustandswechsel neu anpassen (Layout muss erst stehen).
  function refitAfterLayout() {
    requestAnimationFrame(() => requestAnimationFrame(() => fitWindowToVideo(false)));
  }

  function unload() {
    video.pause();
    video.removeAttribute("src");
    video.load();
    state.filePath = null;
    state.meta = null;
    app.classList.remove("has-video");
    removeCrop();
    els.title.textContent = "Video Trim Cropper";
    document.title = "Video Trim Cropper";
    window.api.win.compact();
  }

  // --- Video-Events ----------------------------------------------------------
  video.addEventListener("loadedmetadata", () => {
    // Falls ffprobe keine Dauer lieferte, aus dem Element nachziehen.
    if ((!state.meta.duration || !isFinite(state.meta.duration)) && isFinite(video.duration)) {
      timeline.setDuration(video.duration);
      els.labelEnd.textContent = fmtSmall(video.duration);
    }
    if (!state.meta.width && video.videoWidth) {
      crop.setVideoSize(video.videoWidth, video.videoHeight);
    }
  });

  video.addEventListener("timeupdate", () => {
    const { start, end } = timeline.getTrim();
    if (!video.paused) {
      if (video.currentTime >= end) {
        video.currentTime = start; // Loop im getrimmten Bereich
      } else if (video.currentTime < start - 0.05) {
        video.currentTime = start;
      }
    }
    timeline.setPlayhead(video.currentTime);
    els.timeDisplay.textContent = fmtBig(video.currentTime);
  });

  video.addEventListener("play", () => {
    els.iconPlay.style.display = "none";
    els.iconPause.style.display = "";
  });
  video.addEventListener("pause", () => {
    els.iconPlay.style.display = "";
    els.iconPause.style.display = "none";
  });
  video.addEventListener("error", () => {
    if (state.filePath) notice.classList.add("show");
  });

  // --- Play/Pause ------------------------------------------------------------
  els.btnPlay.addEventListener("click", () => {
    if (!state.filePath) return;
    if (video.paused) {
      const { start, end } = timeline.getTrim();
      if (video.currentTime < start || video.currentTime >= end) {
        video.currentTime = start;
      }
      video.play();
    } else {
      video.pause();
    }
  });

  // --- Modus-Umschalter ------------------------------------------------------
  function setMode(mode) {
    state.userMode = mode;
    els.modeSwitch.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
  }
  els.modeSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      if (state.cropEditing || state.cropApplied) return; // gesperrt: Crop erzwingt Re-Encode
      setMode(b.dataset.mode);
    });
  });

  // --- Crop ------------------------------------------------------------------
  function lockModeToAccurate() {
    els.modeSwitch.classList.add("locked");
    els.modeSwitch.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === "accurate");
    });
  }
  function unlockMode() {
    els.modeSwitch.classList.remove("locked");
    setMode(state.userMode);
  }

  // Vorschau auf den Ausschnitt beschränken (Video absolut positioniert & skaliert)
  function renderCropPreview() {
    if (!state.cropApplied) return;
    const vw = state.meta.width || video.videoWidth;
    const vh = state.meta.height || video.videoHeight;
    if (!vw || !vh) return;
    const r = crop.rect;
    const cropAspect = (r.w * vw) / (r.h * vh);
    const stage = $("stage");
    const maxW = Math.max(120, stage.clientWidth - 48);
    const maxH = window.innerHeight * 0.72;
    let boxW = maxW;
    let boxH = boxW / cropAspect;
    if (boxH > maxH) { boxH = maxH; boxW = boxH * cropAspect; }

    els.videoWrapper.classList.add("cropped");
    els.videoWrapper.style.width = boxW + "px";
    els.videoWrapper.style.height = boxH + "px";
    video.style.position = "absolute";
    video.style.width = boxW / r.w + "px";
    video.style.height = boxH / r.h + "px";
    video.style.left = -r.x * (boxW / r.w) + "px";
    video.style.top = -r.y * (boxH / r.h) + "px";
  }
  function clearCropPreview() {
    els.videoWrapper.classList.remove("cropped");
    els.videoWrapper.style.width = "";
    els.videoWrapper.style.height = "";
    video.style.position = "";
    video.style.width = "";
    video.style.height = "";
    video.style.left = "";
    video.style.top = "";
  }

  function enterCropEditing() {
    state.cropEditing = true;
    app.classList.add("crop-editing");
    app.classList.remove("crop-applied");
    clearCropPreview(); // volles Bild zeigen, damit der Rahmen passend liegt
    if (state.cropApplied) crop.setVisible(true); // vorhandenen Rahmen anpassen
    else crop.resetForDraw();                     // neu aufziehen
    lockModeToAccurate();
  }
  function cancelCropEditing() {
    state.cropEditing = false;
    app.classList.remove("crop-editing");
    if (state.cropApplied) {
      app.classList.add("crop-applied");
      renderCropPreview();
    } else {
      unlockMode();
    }
  }
  function applyCrop() {
    state.cropEditing = false;
    app.classList.remove("crop-editing");
    if (crop.isFullFrame()) {
      removeCrop(); // kein echter Zuschnitt
      return;
    }
    state.cropApplied = true;
    app.classList.add("crop-applied");
    renderCropPreview();
    lockModeToAccurate();
  }
  function removeCrop() {
    state.cropEditing = false;
    state.cropApplied = false;
    app.classList.remove("crop-editing", "crop-applied");
    crop.setVisible(false);
    clearCropPreview();
    unlockMode();
  }

  els.btnCrop.addEventListener("click", () => {
    if (!state.filePath) return;
    if (state.cropEditing) cancelCropEditing();
    else enterCropEditing();
    refitAfterLayout(); // Fenster an ein-/ausgeblendete Crop-Leiste anpassen
  });
  els.btnCropApply.addEventListener("click", () => {
    applyCrop();
    refitAfterLayout();
  });
  els.btnCropReset.addEventListener("click", () => {
    removeCrop();
    refitAfterLayout();
  });

  els.ratioGroup.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      els.ratioGroup.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      crop.setAspect(chip.dataset.ratio);
    });
  });

  window.addEventListener("resize", () => {
    if (state.cropApplied) renderCropPreview();
  });

  // --- Öffnen / Drag&Drop ----------------------------------------------------
  async function pickFile() {
    const p = await window.api.openVideo(window.I18N.currentLang);
    if (p) loadFile(p);
  }
  els.btnOpen.addEventListener("click", pickFile);
  els.dropzone.addEventListener("click", (e) => {
    if (e.target === els.btnOpen) return;
    pickFile();
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.dropzone.classList.add("dragover");
  });
  window.addEventListener("dragleave", (e) => {
    if (e.relatedTarget === null) els.dropzone.classList.remove("dragover");
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const path = window.api.getDroppedPath(file);
    if (path) loadFile(path);
  });

  els.btnBack.addEventListener("click", unload);
  els.btnCancel.addEventListener("click", unload);

  // Datei per „Öffnen mit" / Kommandozeile
  window.api.onOpenFile((p) => { if (p) loadFile(p); });

  // --- Export ----------------------------------------------------------------
  let unsubProgress = window.api.onExportProgress((frac) => {
    els.progressFill.style.width = Math.round(frac * 100) + "%";
  });

  let exportDone = false;
  function showProgress(show) {
    els.progressOverlay.classList.toggle("show", show);
  }

  els.btnSave.addEventListener("click", async () => {
    if (!state.filePath) return;
    // Falls noch im Zuschnitt-Modus: erst übernehmen.
    if (state.cropEditing) applyCrop();
    const { start, end } = timeline.getTrim();

    let cropPixels = null;
    if (state.cropApplied && !crop.isFullFrame()) {
      cropPixels = crop.getCropPixels();
    }

    const opts = {
      input: state.filePath,
      start,
      end,
      mode: state.userMode,
      crop: cropPixels,
      hasAudio: !!(state.meta && state.meta.hasAudio),
      lang: window.I18N.currentLang,
    };

    exportDone = false;
    els.progressCard.classList.remove("done");
    els.progressTitle.textContent = window.I18N.t("export_title");
    const isReencode = cropPixels || state.userMode === "accurate";
    els.progressSub.textContent = isReencode
      ? window.I18N.t(state.appInfo && state.appInfo.hwAccel ? "export_hw" : "export_reencode")
      : window.I18N.t("export_lossless");
    els.progressFill.style.width = "0%";
    els.btnCancelExport.textContent = window.I18N.t("cancel");
    els.btnCancelExport.disabled = false;
    showProgress(true);

    const res = await window.api.startExport(opts);

    if (res.cancelled) {
      showProgress(false);
      return;
    }
    if (!res.ok) {
      showProgress(false);
      alert(window.I18N.t("alert_export_failed") + "\n" + (res.error || window.I18N.t("error_unknown")));
      return;
    }
    // Erfolg
    exportDone = true;
    els.progressCard.classList.add("done");
    els.progressTitle.textContent = window.I18N.t("done");
    els.progressSub.textContent = res.output.split(/[\\/]/).pop();
    els.progressFill.style.width = "100%";
    els.btnCancelExport.textContent = window.I18N.t("close_btn");
  });

  els.btnCancelExport.addEventListener("click", async () => {
    if (exportDone) {
      showProgress(false);
      return;
    }
    els.btnCancelExport.disabled = true;
    els.btnCancelExport.textContent = window.I18N.t("cancelling");
    await window.api.cancelExport();
    showProgress(false);
  });

  // --- Fenstersteuerung ------------------------------------------------------
  $("win-min").addEventListener("click", () => window.api.win.minimize());
  $("win-max").addEventListener("click", () => window.api.win.toggleMaximize());
  $("win-close").addEventListener("click", () => window.api.win.close());

  // Tastatur: Leertaste = Play/Pause, Escape schließt Einstellungen
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && els.settingsOverlay.classList.contains("show")) {
      closeSettings();
      return;
    }
    if (e.code === "Space" && state.filePath) {
      e.preventDefault();
      els.btnPlay.click();
    }
  });

  // --- Einstellungen / Sprache ----------------------------------------------
  function openSettings() { els.settingsOverlay.classList.add("show"); }
  function closeSettings() { els.settingsOverlay.classList.remove("show"); }
  els.btnSettings.addEventListener("click", openSettings);
  els.settingsClose.addEventListener("click", closeSettings);
  els.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === els.settingsOverlay) closeSettings();
  });
  els.langSelect.addEventListener("change", () => {
    window.I18N.apply(els.langSelect.value);
  });

  // Sprache initialisieren (gespeichert oder Standard 'de')
  (function initLang() {
    const lang = window.I18N.saved() || "de";
    els.langSelect.value = lang;
    window.I18N.apply(lang);
  })();

  // App-Infos laden (Version + erkannter Video-Encoder)
  window.api.getAppInfo().then((info) => {
    state.appInfo = info;
    els.appVersion.textContent = info.name + " " + info.version;
    els.appEncoder.textContent = info.encoder;
  }).catch(() => {});

  // Test-Handle (nur wenn VTC_DEBUG gesetzt ist, siehe main.js)
  window.__vtc = {
    state, crop, timeline, loadFile,
    enterCropEditing, applyCrop, removeCrop, renderCropPreview,
  };
})();
