// crop.js — Zuschnitt-Overlay: verschieb-/skalierbares Rechteck über dem Video.
// Zustand in normalisierten Koordinaten [0..1] relativ zur angezeigten Videofläche,
// dadurch auflösungsunabhängig. Ratio-Lock arbeitet mit Pixel-Seitenverhältnissen.
(function () {
  const MIN = 0.05; // Mindestgröße (5 % der Kante)

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function even(n) {
    n = Math.round(n);
    return n % 2 === 0 ? n : n - 1;
  }

  class CropTool {
    constructor(overlay, rectEl) {
      this.overlay = overlay;
      this.rectEl = rectEl;
      this.rect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
      this.ratio = null; // normalisiertes nw/nh oder null (frei)
      this.visible = false; // Rahmen erst nach dem Aufziehen sichtbar
      this.videoW = 0;
      this.videoH = 0;
      this._bind();
      this.setVisible(false);
    }

    setVideoSize(w, h) {
      this.videoW = w;
      this.videoH = h;
    }

    // Ausgangszustand: kein Rahmen, wartet auf Aufziehen.
    reset() {
      this.rect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
      this.ratio = null;
      this.setVisible(false);
    }
    resetForDraw() {
      this.setVisible(false);
    }

    setVisible(v) {
      this.visible = v;
      this.rectEl.classList.toggle("hidden", !v);
      if (v) this._render();
    }

    // name: 'free' | 'original' | 'W:H'
    setAspect(name) {
      if (name === "free") {
        this.ratio = null;
        return;
      }
      let pixelRatio;
      if (name === "original") {
        pixelRatio = this.videoW / this.videoH;
      } else {
        const [w, h] = name.split(":").map(Number);
        pixelRatio = w / h;
      }
      const videoAspect = this.videoW / this.videoH || 1;
      this.ratio = pixelRatio / videoAspect; // nw/nh im normalisierten Raum
      this._fitToRatio();
      this._render();
    }

    _fitToRatio() {
      if (!this.ratio) return;
      const cx = this.rect.x + this.rect.w / 2;
      const cy = this.rect.y + this.rect.h / 2;
      let w = this.rect.w;
      let h = w / this.ratio;
      if (h > 1) {
        h = 1;
        w = h * this.ratio;
      }
      if (w > 1) {
        w = 1;
        h = w / this.ratio;
      }
      let x = clamp(cx - w / 2, 0, 1 - w);
      let y = clamp(cy - h / 2, 0, 1 - h);
      this.rect = { x, y, w, h };
    }

    // Pixel-Zuschnitt für ffmpeg (gerade Zahlen, in Grenzen).
    getCropPixels() {
      const vw = this.videoW;
      const vh = this.videoH;
      let w = even(this.rect.w * vw);
      let h = even(this.rect.h * vh);
      let x = even(this.rect.x * vw);
      let y = even(this.rect.y * vh);
      w = Math.max(2, Math.min(w, vw));
      h = Math.max(2, Math.min(h, vh));
      x = clamp(x, 0, vw - w);
      y = clamp(y, 0, vh - h);
      return { x, y, w, h };
    }

    // true, wenn kein echter Zuschnitt vorliegt (kein Rahmen oder ganzes Bild).
    isFullFrame() {
      if (!this.visible) return true;
      const r = this.rect;
      return r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
    }

    _render() {
      const r = this.rect;
      this.rectEl.style.left = r.x * 100 + "%";
      this.rectEl.style.top = r.y * 100 + "%";
      this.rectEl.style.width = r.w * 100 + "%";
      this.rectEl.style.height = r.h * 100 + "%";
    }

    _norm(clientX, clientY) {
      const b = this.overlay.getBoundingClientRect();
      return {
        x: clamp((clientX - b.left) / b.width, 0, 1),
        y: clamp((clientY - b.top) / b.height, 0, 1),
      };
    }

    _bind() {
      // Neuen Rahmen aufziehen (von links-oben nach rechts-unten)
      this.overlay.addEventListener("pointerdown", (e) => {
        if (this.rectEl.contains(e.target)) return; // Rahmen/Griffe: eigene Handler
        e.preventDefault();
        const start = this._norm(e.clientX, e.clientY);
        this.setVisible(true);
        this.rect = { x: start.x, y: start.y, w: 0, h: 0 };
        this._render();
        const move = (ev) => {
          const p = this._norm(ev.clientX, ev.clientY);
          let x = Math.min(start.x, p.x);
          let y = Math.min(start.y, p.y);
          let w = Math.abs(p.x - start.x);
          let h = Math.abs(p.y - start.y);
          if (this.ratio) {
            h = w / this.ratio; // Höhe folgt der Breite
            y = p.y < start.y ? start.y - h : start.y;
          }
          w = Math.min(w, 1 - x);
          h = Math.min(h, 1 - y);
          this.rect = { x, y, w, h };
          this._render();
        };
        this._trackPointer(move, () => {
          if (this.rect.w < MIN || this.rect.h < MIN) this.setVisible(false);
        });
      });

      // Ganzes Rechteck verschieben
      this.rectEl.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("crop-handle")) return;
        e.preventDefault();
        const startP = this._norm(e.clientX, e.clientY);
        const start = { ...this.rect };
        const move = (ev) => {
          const p = this._norm(ev.clientX, ev.clientY);
          const nx = clamp(start.x + (p.x - startP.x), 0, 1 - start.w);
          const ny = clamp(start.y + (p.y - startP.y), 0, 1 - start.h);
          this.rect.x = nx;
          this.rect.y = ny;
          this._render();
        };
        this._trackPointer(move);
      });

      // Griffe skalieren
      this.rectEl.querySelectorAll(".crop-handle").forEach((handle) => {
        handle.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._startResize(handle.dataset.h);
        });
      });
    }

    _startResize(type) {
      const start = { ...this.rect };
      const cx = start.x + start.w / 2;
      const cy = start.y + start.h / 2;

      // Fixpunkt (Anker) = gegenüberliegende Ecke/Kante
      const anchors = {
        se: { x: start.x, y: start.y },
        sw: { x: start.x + start.w, y: start.y },
        ne: { x: start.x, y: start.y + start.h },
        nw: { x: start.x + start.w, y: start.y + start.h },
        e: { x: start.x, y: cy },
        w: { x: start.x + start.w, y: cy },
        s: { x: cx, y: start.y },
        n: { x: cx, y: start.y + start.h },
      };
      const anchor = anchors[type];
      const isCorner = type.length === 2;
      const horiz = /w|e/.test(type[type.length - 1]) || type === "e" || type === "w";

      const move = (ev) => {
        const p = this._norm(ev.clientX, ev.clientY);
        let x = start.x, y = start.y, w = start.w, h = start.h;

        if (isCorner) {
          w = Math.abs(p.x - anchor.x);
          h = Math.abs(p.y - anchor.y);
          if (this.ratio) {
            // Breite führt, Höhe folgt dem Seitenverhältnis
            h = w / this.ratio;
          }
          x = p.x < anchor.x ? anchor.x - w : anchor.x;
          y = p.y < anchor.y ? anchor.y - h : anchor.y;
        } else if (type === "e" || type === "w") {
          if (type === "e") { w = p.x - anchor.x; x = anchor.x; }
          else { w = anchor.x - p.x; x = p.x; }
          if (this.ratio) {
            h = w / this.ratio;
            y = cy - h / 2;
          } else { h = start.h; y = start.y; }
        } else { // n | s
          if (type === "s") { h = p.y - anchor.y; y = anchor.y; }
          else { h = anchor.y - p.y; y = p.y; }
          if (this.ratio) {
            w = h * this.ratio;
            x = cx - w / 2;
          } else { w = start.w; x = start.x; }
        }

        // Mindestgröße
        w = Math.max(MIN, w);
        h = Math.max(MIN, h);
        // In Grenzen halten
        x = clamp(x, 0, 1 - Math.min(w, 1));
        y = clamp(y, 0, 1 - Math.min(h, 1));
        w = Math.min(w, 1 - x);
        h = Math.min(h, 1 - y);

        this.rect = { x, y, w, h };
        this._render();
      };
      this._trackPointer(move);
    }

    _trackPointer(move, onUp) {
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (onUp) onUp();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
  }

  window.CropTool = CropTool;
})();
