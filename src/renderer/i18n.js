// i18n.js — einfache Übersetzungsschicht. Setzt Texte über data-i18n-Attribute.
(function () {
  const translations = {
    de: {
      mode_lossless: "Verlustfrei",
      mode_accurate: "Frame-genau",
      mode_tip: "Bei aktivem Zuschnitt immer frame-genau",
      tab_trim: "Trimmen",
      save: "Als Kopie speichern",
      cancel: "Abbrechen",
      close_video: "Video schließen",
      drop_title: "Video hierher ziehen",
      drop_hint: "oder klicken zum Auswählen · MP4, MOV, MKV, WEBM …",
      open: "Datei öffnen",
      notice: "Vorschau für diesen Codec nicht möglich – Trimmen & Croppen funktioniert trotzdem.",
      crop: "Zuschneiden",
      ratio_free: "Frei",
      ratio_original: "Original",
      apply: "Übernehmen",
      reset: "Zurück",
      settings_title: "Einstellungen",
      settings_language: "Sprache",
      settings_version: "Version",
      settings_encoder: "Video-Encoder",
      export_title: "Wird exportiert …",
      export_hw: "Hardwarebeschleunigtes Kodieren läuft",
      export_reencode: "Neu-Kodierung (frame-genau) läuft",
      export_lossless: "Verlustfreie Kopie läuft",
      done: "Fertig ✓",
      close_btn: "Schließen",
      cancelling: "Wird abgebrochen …",
      alert_read: "Datei konnte nicht gelesen werden:",
      alert_export_failed: "Export fehlgeschlagen:",
      error_unknown: "Unbekannter Fehler",
    },
    en: {
      mode_lossless: "Lossless",
      mode_accurate: "Frame-exact",
      mode_tip: "Always frame-exact when cropping",
      tab_trim: "Trim",
      save: "Save a copy",
      cancel: "Cancel",
      close_video: "Close video",
      drop_title: "Drop a video here",
      drop_hint: "or click to choose · MP4, MOV, MKV, WEBM …",
      open: "Open file",
      notice: "Preview not available for this codec – trimming & cropping still work.",
      crop: "Crop",
      ratio_free: "Free",
      ratio_original: "Original",
      apply: "Apply",
      reset: "Back",
      settings_title: "Settings",
      settings_language: "Language",
      settings_version: "Version",
      settings_encoder: "Video encoder",
      export_title: "Exporting …",
      export_hw: "Hardware-accelerated encoding …",
      export_reencode: "Re-encoding (frame-exact) …",
      export_lossless: "Lossless copy …",
      done: "Done ✓",
      close_btn: "Close",
      cancelling: "Cancelling …",
      alert_read: "Could not read file:",
      alert_export_failed: "Export failed:",
      error_unknown: "Unknown error",
    },
  };

  const STORAGE_KEY = "vtc_lang";

  const I18N = {
    currentLang: "de",

    dict(lang) {
      return translations[lang] || translations.de;
    },

    t(key) {
      const d = this.dict(this.currentLang);
      return d[key] != null ? d[key] : (translations.de[key] != null ? translations.de[key] : key);
    },

    apply(lang) {
      if (!translations[lang]) lang = "de";
      this.currentLang = lang;
      const d = this.dict(lang);
      document.documentElement.lang = lang;

      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const v = d[el.dataset.i18n];
        if (v != null) el.textContent = v;
      });
      document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        const v = d[el.dataset.i18nTitle];
        if (v != null) el.title = v;
      });
      document.querySelectorAll("[data-i18n-tip]").forEach((el) => {
        const v = d[el.dataset.i18nTip];
        if (v != null) el.setAttribute("data-tip", v);
      });

      try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    },

    saved() {
      try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
    },
  };

  window.I18N = I18N;
})();
