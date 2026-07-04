// ffmpeg.js — Binary-Auflösung, ffprobe-Metadaten, HW-Encoder-Erkennung,
// Command-Bau und Export mit Fortschritt.
const { spawn } = require("child_process");

// --- Binary-Pfade auflösen -------------------------------------------------
// ffmpeg-static / ffprobe-static liefern Pfade ins node_modules. Im gepackten
// Build liegen sie im asar-Archiv und müssen auf app.asar.unpacked zeigen.
function unpack(p) {
  return p ? p.replace("app.asar", "app.asar.unpacked") : p;
}

function resolveBinaries() {
  let ffmpegPath;
  let ffprobePath;
  try {
    ffmpegPath = unpack(require("ffmpeg-static"));
  } catch (_) {
    ffmpegPath = "ffmpeg"; // Fallback: System-PATH
  }
  try {
    ffprobePath = unpack(require("ffprobe-static").path);
  } catch (_) {
    ffprobePath = "ffprobe";
  }
  return { ffmpegPath, ffprobePath };
}

const { ffmpegPath, ffprobePath } = resolveBinaries();

// --- Hardware-Encoder-Erkennung -------------------------------------------
// Bevorzugte Reihenfolge; der erste, der auf diesem System tatsächlich
// funktioniert, wird für das Re-Encoding verwendet.
const HW_CANDIDATES = ["h264_nvenc", "h264_amf", "h264_qsv"];

function testEncoder(name) {
  return new Promise((resolve) => {
    // 256x256: groß genug für die Mindestmaße von NVENC.
    const args = [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1",
      "-c:v", name, "-f", "null", "-",
    ];
    const child = spawn(ffmpegPath, args);
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

let _hwPromise = null;
async function detectHwEncoder() {
  for (const enc of HW_CANDIDATES) {
    try {
      if (await testEncoder(enc)) return enc;
    } catch (_) {}
  }
  return null; // → Software (libx264)
}
function getHwEncoder() {
  if (!_hwPromise) _hwPromise = detectHwEncoder();
  return _hwPromise;
}

function encoderLabel(enc) {
  switch (enc) {
    case "h264_nvenc": return "NVIDIA NVENC";
    case "h264_amf": return "AMD AMF";
    case "h264_qsv": return "Intel Quick Sync";
    default: return "Software (x264)";
  }
}

// Encoder-spezifische Qualitätsargumente (visuell verlustfrei).
function videoEncoderArgs(enc) {
  switch (enc) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "20", "-b:v", "0"];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20"];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-global_quality", "20"];
    default:
      return ["-c:v", "libx264", "-crf", "18", "-preset", "veryfast"];
  }
}

// --- Metadaten via ffprobe -------------------------------------------------
function probe(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];
    const child = spawn(ffprobePath, args);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || `ffprobe exit ${code}`));
      try {
        resolve(normalizeMeta(JSON.parse(out)));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function normalizeMeta(json) {
  const streams = json.streams || [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const duration = parseFloat(
    (json.format && json.format.duration) || (v && v.duration) || 0
  );
  let fps = 0;
  if (v && v.r_frame_rate && v.r_frame_rate !== "0/0") {
    const [num, den] = v.r_frame_rate.split("/").map(Number);
    if (den) fps = num / den;
  }
  return {
    duration: isFinite(duration) ? duration : 0,
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    fps: Math.round(fps * 1000) / 1000,
    videoCodec: v ? v.codec_name : null,
    audioCodec: a ? a.codec_name : null,
    hasAudio: !!a,
  };
}

// --- Command-Bau -----------------------------------------------------------
// opts: { input, output, start, end, mode: 'lossless'|'accurate',
//         crop: null | {x,y,w,h}, hasAudio: bool }
// encoder: HW-Encoder-Name oder null (Software) – nur beim Re-Encoding relevant.
function buildArgs(opts, encoder) {
  const { input, output, start, end, mode, crop, hasAudio } = opts;
  const duration = Math.max(0, end - start);
  const reencode = !!crop || mode === "accurate";

  const args = ["-y", "-hide_banner"];
  // Schneller, bei Re-Encode frame-genauer Seek vor -i.
  args.push("-ss", start.toFixed(3), "-i", input);
  args.push("-t", duration.toFixed(3));

  if (!reencode) {
    // Verlustfrei: Streams 1:1 kopieren (Schnitt an Keyframes).
    args.push("-c", "copy", "-map", "0", "-avoid_negative_ts", "make_zero");
  } else {
    if (crop) {
      const { x, y, w, h } = crop;
      args.push("-vf", `crop=${w}:${h}:${x}:${y}`);
    }
    args.push(...videoEncoderArgs(encoder));
    args.push("-pix_fmt", "yuv420p");
    if (hasAudio) args.push("-c:a", "copy"); // Audio verlustfrei kopieren
  }

  args.push("-movflags", "+faststart");
  args.push("-progress", "pipe:1", "-nostats");
  args.push(output);
  return args;
}

// --- Export ----------------------------------------------------------------
// Gibt { promise, cancel } zurück. onProgress(fraction 0..1).
// Nutzt HW-Encoding beim Re-Encode und fällt bei Fehler auf Software zurück.
function runExport(opts, onProgress) {
  const targetDur = Math.max(0.001, opts.end - opts.start);
  const reencode = !!opts.crop || opts.mode === "accurate";
  let child = null;
  let killed = false;

  const cancel = () => {
    killed = true;
    if (child) {
      try { child.kill("SIGKILL"); } catch (_) {}
    }
  };

  function runOnce(encoder) {
    return new Promise((resolve, reject) => {
      const args = buildArgs(opts, encoder);
      let stderr = "";
      child = spawn(ffmpegPath, args);

      child.stdout.on("data", (chunk) => {
        const matches = chunk.toString().match(/out_time=(\d+):(\d+):(\d+\.\d+)/g);
        if (matches && matches.length) {
          const m = matches[matches.length - 1].match(/out_time=(\d+):(\d+):(\d+\.\d+)/);
          if (m) {
            const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
            if (onProgress) onProgress(Math.min(1, Math.max(0, sec / targetDur)));
          }
        }
      });
      child.stderr.on("data", (d) => {
        stderr += d;
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (killed) return reject(new Error("cancelled"));
        if (code === 0) {
          if (onProgress) onProgress(1);
          resolve({ output: opts.output, encoder });
        } else {
          reject(new Error(stderr || `ffmpeg exit ${code}`));
        }
      });
    });
  }

  const promise = (async () => {
    const encoder = reencode ? await getHwEncoder() : null;
    if (killed) throw new Error("cancelled");
    try {
      return await runOnce(encoder);
    } catch (err) {
      // Bei HW-Encoder-Problemen einmal auf Software zurückfallen.
      if (!killed && reencode && encoder) {
        return await runOnce(null);
      }
      throw err;
    }
  })();

  return { promise, cancel };
}

module.exports = {
  probe,
  buildArgs,
  runExport,
  getHwEncoder,
  encoderLabel,
  ffmpegPath,
  ffprobePath,
};
