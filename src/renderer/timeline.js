// timeline.js — Scrubber mit zwei Trim-Griffen, Range-Balken und Playhead.
// Emittiert Callbacks; hält keine Video-Referenz.
(function () {
  const MIN_GAP = 0.1; // Mindestlänge des getrimmten Bereichs in Sekunden

  class Timeline {
    constructor(root, opts = {}) {
      this.root = root;
      this.rangeEl = root.querySelector("#tl-range");
      this.playheadEl = root.querySelector("#tl-playhead");
      this.handleStart = root.querySelector("#tl-handle-start");
      this.handleEnd = root.querySelector("#tl-handle-end");

      this.duration = 0;
      this.start = 0;
      this.end = 0;
      this.playhead = 0;

      this.onSeek = opts.onSeek || (() => {});
      this.onTrimChange = opts.onTrimChange || (() => {});
      this.onScrubStart = opts.onScrubStart || (() => {});
      this.onScrubEnd = opts.onScrubEnd || (() => {});

      this._bind();
    }

    setDuration(d) {
      this.duration = d;
      this.start = 0;
      this.end = d;
      this.playhead = 0;
      this._render();
    }

    setPlayhead(t) {
      this.playhead = Math.min(this.duration, Math.max(0, t));
      this._renderPlayhead();
    }

    getTrim() {
      return { start: this.start, end: this.end };
    }

    // --- intern ---
    _pct(t) {
      return this.duration > 0 ? (t / this.duration) * 100 : 0;
    }

    _timeFromClientX(clientX) {
      const rect = this.root.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return Math.min(this.duration, Math.max(0, ratio * this.duration));
    }

    _render() {
      this._renderRange();
      this._renderPlayhead();
    }

    _renderRange() {
      const s = this._pct(this.start);
      const e = this._pct(this.end);
      this.rangeEl.style.left = s + "%";
      this.rangeEl.style.width = (e - s) + "%";
      this.handleStart.style.left = s + "%";
      this.handleEnd.style.left = e + "%";
    }

    _renderPlayhead() {
      this.playheadEl.style.left = this._pct(this.playhead) + "%";
    }

    _bind() {
      // Griffe ziehen
      this._drag(this.handleStart, (t) => {
        this.start = Math.min(t, this.end - MIN_GAP);
        this.start = Math.max(0, this.start);
        if (this.playhead < this.start) this.setPlayhead(this.start);
        this._renderRange();
        this.onTrimChange(this.start, this.end, "start");
      });

      this._drag(this.handleEnd, (t) => {
        this.end = Math.max(t, this.start + MIN_GAP);
        this.end = Math.min(this.duration, this.end);
        if (this.playhead > this.end) this.setPlayhead(this.end);
        this._renderRange();
        this.onTrimChange(this.start, this.end, "end");
      });

      // Klick/Zug auf die Spur = Seek (nicht auf Griffe)
      this.root.addEventListener("pointerdown", (e) => {
        if (e.target === this.handleStart || e.target === this.handleEnd) return;
        this.onScrubStart();
        const move = (ev) => {
          const t = this._timeFromClientX(ev.clientX);
          this.setPlayhead(t);
          this.onSeek(t);
        };
        move(e);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          this.onScrubEnd();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
    }

    _drag(handle, onMove) {
      handle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onScrubStart();
        const move = (ev) => onMove(this._timeFromClientX(ev.clientX));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          this.onScrubEnd();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
    }
  }

  window.Timeline = Timeline;
})();
