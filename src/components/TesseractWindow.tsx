import { useCallback, useEffect, useRef, useState } from "react";
import { useMeasure, useMedia } from "react-use";

// ---------------------------------------------------------------------------
// 4D geometry constants
// ---------------------------------------------------------------------------

const CELL_ASPECT = 2;
const SSX = 8;
const SSY = SSX * CELL_ASPECT;
const CHAR_W = 14;
const CHAR_H = CHAR_W * CELL_ASPECT;
const CHAR_RADIUS = Math.round(CHAR_W * 0.25);
const PROJ_DIST = 3;

const SAMPLE_PTS: [number, number][] = [
  [0.25, 0.17],
  [0.75, 0.17],
  [0.25, 0.5],
  [0.75, 0.5],
  [0.25, 0.83],
  [0.75, 0.83],
];

const VERTS: number[][] = [];
for (let i = 0; i < 16; i++)
  VERTS.push([
    i & 1 ? 1 : -1,
    i & 2 ? 1 : -1,
    i & 4 ? 1 : -1,
    i & 8 ? 1 : -1,
  ]);

const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++)
  for (let j = i + 1; j < 16; j++) {
    let d = 0;
    for (let k = 0; k < 4; k++) if (VERTS[i][k] !== VERTS[j][k]) d++;
    if (d === 1) EDGES.push([i, j]);
  }

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function rot4(p: number[], a1: number, a2: number, ang: number): number[] {
  const out = [...p];
  const c = Math.cos(ang),
    s = Math.sin(ang);
  out[a1] = p[a1] * c - p[a2] * s;
  out[a2] = p[a1] * s + p[a2] * c;
  return out;
}

function sampleCircle(
  data: Uint8ClampedArray,
  stride: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(stride / 4 - 1, Math.ceil(cx + r));
  let sum = 0,
    cnt = 0;
  for (let py = y0; py <= y1; py++) {
    const rowOff = py * stride;
    for (let px = x0; px <= x1; px++) {
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r2) {
        sum += data[rowOff + px * 4];
        cnt++;
      }
    }
  }
  return cnt > 0 ? sum / (cnt * 255) : 0;
}

// ---------------------------------------------------------------------------
// Font-based character vector lookup (built once)
// ---------------------------------------------------------------------------

function buildCharVectors(font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = CHAR_W;
  canvas.height = CHAR_H;
  const ctx = canvas.getContext("2d")!;

  const chars: string[] = [];
  for (let c = 32; c <= 126; c++) chars.push(String.fromCharCode(c));

  const vecs: Float64Array[] = [];
  for (const ch of chars) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CHAR_W, CHAR_H);
    ctx.fillStyle = "#fff";
    ctx.font = `${CHAR_H * 0.85}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, CHAR_W / 2, CHAR_H * 0.525);

    const imgData = ctx.getImageData(0, 0, CHAR_W, CHAR_H);
    const stride = CHAR_W * 4;
    const vec = new Float64Array(6);
    for (let s = 0; s < 6; s++) {
      vec[s] = sampleCircle(
        imgData.data,
        stride,
        CHAR_H,
        SAMPLE_PTS[s][0] * CHAR_W,
        SAMPLE_PTS[s][1] * CHAR_H,
        CHAR_RADIUS,
      );
    }
    vecs.push(vec);
  }

  let gmax = 0;
  for (const v of vecs)
    for (let i = 0; i < 6; i++) gmax = Math.max(gmax, v[i]);
  if (gmax > 0)
    for (const v of vecs) for (let i = 0; i < 6; i++) v[i] /= gmax;

  return { chars, vecs };
}

// ---------------------------------------------------------------------------
// Tesseract ASCII rendering engine
// ---------------------------------------------------------------------------

function computeGridSize(
  containerW: number,
  containerH: number,
  fontSize: number,
) {
  if (containerW < 10 || containerH < 10 || fontSize < 1)
    return { cols: 40, rows: 20 };
  const cw = Math.max(1, fontSize * 0.6);
  const ch = Math.max(1, fontSize * 1.1);
  return {
    cols: Math.min(120, Math.max(10, Math.floor(containerW / cw))),
    rows: Math.min(60, Math.max(5, Math.floor(containerH / ch))),
  };
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  time: number,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, sw, sh);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const centerX = sw / 2;
  const centerY = sh / 2;
  const scale = Math.min(sw, sh) * 0.42;

  ctx.beginPath();
  for (const [ei, ej] of EDGES) {
    let p0 = VERTS[ei],
      p1 = VERTS[ej];
    p0 = rot4(p0, 0, 3, time * 0.7);
    p0 = rot4(p0, 1, 2, time * 0.5);
    p0 = rot4(p0, 1, 3, time * 0.3);
    p1 = rot4(p1, 0, 3, time * 0.7);
    p1 = rot4(p1, 1, 2, time * 0.5);
    p1 = rot4(p1, 1, 3, time * 0.3);
    const w0 = 1 / (PROJ_DIST - p0[3]);
    const w1 = 1 / (PROJ_DIST - p1[3]);
    ctx.moveTo(centerX + p0[0] * w0 * scale, centerY + p0[1] * w0 * scale);
    ctx.lineTo(centerX + p1[0] * w1 * scale, centerY + p1[1] * w1 * scale);
  }
  ctx.stroke();
}

function rasterizeToAscii(
  imgData: Uint8ClampedArray,
  sw: number,
  sh: number,
  cols: number,
  rows: number,
  findChar: (sv: Float64Array) => string,
): string {
  const sampleR = SSX * 0.25;
  const r2 = sampleR * sampleR;
  const sv = new Float64Array(6);
  const contrastExp = 2.5;
  let out = "";

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = col * SSX;
      const oy = row * SSY;

      for (let s = 0; s < 6; s++) {
        const scx = ox + SAMPLE_PTS[s][0] * SSX;
        const scy = oy + SAMPLE_PTS[s][1] * SSY;
        let sum = 0,
          cnt = 0;
        const y0 = Math.max(0, Math.floor(scy - sampleR));
        const y1 = Math.min(sh - 1, Math.ceil(scy + sampleR));
        const x0 = Math.max(0, Math.floor(scx - sampleR));
        const x1 = Math.min(sw - 1, Math.ceil(scx + sampleR));
        for (let py = y0; py <= y1; py++) {
          const rowOff = py * sw * 4;
          for (let px = x0; px <= x1; px++) {
            if ((px - scx) ** 2 + (py - scy) ** 2 <= r2) {
              sum += imgData[rowOff + px * 4];
              cnt++;
            }
          }
        }
        sv[s] = cnt > 0 ? sum / (cnt * 255) : 0;
      }

      const mx = Math.max(sv[0], sv[1], sv[2], sv[3], sv[4], sv[5], 0.001);
      for (let i = 0; i < 6; i++)
        sv[i] = Math.pow(sv[i] / mx, contrastExp) * mx;

      out += findChar(sv);
    }
    if (row < rows - 1) out += "\n";
  }

  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TesseractWindow() {
  const preRef = useRef<HTMLPreElement>(null);
  const [containerRef, { width: cw, height: ch }] = useMeasure<HTMLDivElement>();
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)", false);

  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const charDataRef = useRef<{
    chars: string[];
    vecs: Float64Array[];
    cache: Map<number, string>;
    findChar: (sv: Float64Array) => string;
  } | null>(null);

  if (fontsReady && !charDataRef.current) {
    const { chars, vecs } = buildCharVectors("Unifont, monospace");
    const QUANT = 10;
    const cache = new Map<number, string>();
    const findChar = (sv: Float64Array): string => {
      let key = 0;
      for (let i = 0; i < 6; i++)
        key = key * QUANT + Math.min(QUANT - 1, Math.floor(sv[i] * QUANT));
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      let best = " ",
        bestDist = Infinity;
      for (let ci = 0; ci < chars.length; ci++) {
        const cv = vecs[ci];
        let dist = 0;
        for (let i = 0; i < 6; i++) {
          const d = sv[i] - cv[i];
          dist += d * d;
        }
        if (dist < bestDist) {
          bestDist = dist;
          best = chars[ci];
        }
      }
      cache.set(key, best);
      return best;
    };
    charDataRef.current = { chars, vecs, cache, findChar };
  }

  const prevGridRef = useRef<{ cols: number; rows: number }>({
    cols: 0,
    rows: 0,
  });

  const getFontSize = useCallback(() => {
    if (!preRef.current) return 8;
    return parseFloat(getComputedStyle(preRef.current).fontSize) || 8;
  }, []);

  useEffect(() => {
    if (!fontsReady || !charDataRef.current || !preRef.current) return;
    const pre = preRef.current;

    const { findChar, cache } = charDataRef.current;
    const sceneCanvas = document.createElement("canvas");
    const ctx = sceneCanvas.getContext("2d")!;

    let time = 0;
    let lastTs = 0;
    let animId = 0;

    const { cols, rows } = computeGridSize(cw, ch, getFontSize());
    sceneCanvas.width = cols * SSX;
    sceneCanvas.height = rows * SSY;

    if (
      cols !== prevGridRef.current.cols ||
      rows !== prevGridRef.current.rows
    ) {
      cache.clear();
      prevGridRef.current = { cols, rows };
    }

    function frame(ts: number) {
      const dt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
      lastTs = ts;
      if (!reducedMotion) time += dt * 0.5;

      const sw = sceneCanvas.width;
      const sh = sceneCanvas.height;
      if (sw < 1 || sh < 1) {
        animId = requestAnimationFrame(frame);
        return;
      }

      renderFrame(ctx, sw, sh, time);
      const imgData = ctx.getImageData(0, 0, sw, sh).data;
      pre.textContent = rasterizeToAscii(
        imgData,
        sw,
        sh,
        cols,
        rows,
        findChar,
      );
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [fontsReady, cw, ch, reducedMotion, getFontSize]);

  return (
    <div
      data-window
      data-window-id="tesseract"
      className="flex h-full flex-col border-2 border-[#c0c0c0] bg-[#c0c0c0] win31-outset dark:win31-outset-dark dark:border-[#505050] dark:bg-[#505050]"
    >
      <div
        data-window-titlebar
        className="flex items-center justify-between border-b border-gray-500 bg-linear-to-r from-blue-600 to-blue-800 px-0.5 py-0.5 text-[11px] font-bold text-white md:text-[10px] dark:border-gray-600 dark:from-blue-800 dark:to-blue-900"
      >
        <div className="grow px-1.5 py-0.5" data-window-title>
          C:\TESSERACT.EXE
        </div>
        <div className="flex gap-0.5">
          <button
            className="win31-button-outset dark:win31-button-outset-dark active:win31-button-inset dark:active:win31-button-inset-dark flex h-3.5 w-4 cursor-pointer items-center justify-center bg-[#c0c0c0] p-0 text-[8px] font-bold text-black hover:bg-[#d4d0c8] dark:bg-[#505050] dark:text-white dark:hover:bg-[#606060]"
            aria-label="Minimize"
          >
            _
          </button>
          <button
            className="win31-button-outset dark:win31-button-outset-dark active:win31-button-inset dark:active:win31-button-inset-dark flex h-3.5 w-4 cursor-pointer items-center justify-center bg-[#c0c0c0] p-0 text-[8px] font-bold text-black hover:bg-[#d4d0c8] dark:bg-[#505050] dark:text-white dark:hover:bg-[#606060]"
            aria-label="Maximize"
          >
            &#x25A1;
          </button>
          <button
            data-window-close
            className="win31-button-outset dark:win31-button-outset-dark active:win31-button-inset dark:active:win31-button-inset-dark flex h-3.5 w-4 cursor-pointer items-center justify-center bg-[#c0c0c0] p-0 text-[8px] font-bold text-black hover:bg-[#d4d0c8] dark:bg-[#505050] dark:text-white dark:hover:bg-[#606060]"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative grow overflow-hidden bg-white dark:bg-black"
      >
        <pre
          ref={preRef}
          className="h-full w-full overflow-hidden p-1 text-[10px] leading-none whitespace-pre text-cyan-600 sm:text-[6px] md:text-[8px] dark:text-cyan-400"
        />
        <div
          data-window-resize
          className="absolute right-0 bottom-0 z-10 h-3 w-3 cursor-se-resize"
          aria-hidden="true"
        >
          <svg viewBox="0 0 12 12" className="h-full w-full">
            <line
              x1="10"
              y1="2"
              x2="2"
              y2="10"
              stroke="#808080"
              strokeWidth="1"
            />
            <line
              x1="10"
              y1="5"
              x2="5"
              y2="10"
              stroke="#808080"
              strokeWidth="1"
            />
            <line
              x1="10"
              y1="8"
              x2="8"
              y2="10"
              stroke="#808080"
              strokeWidth="1"
            />
            <line
              x1="11"
              y1="2"
              x2="2"
              y2="11"
              stroke="#fff"
              strokeWidth="1"
            />
            <line
              x1="11"
              y1="5"
              x2="5"
              y2="11"
              stroke="#fff"
              strokeWidth="1"
            />
            <line
              x1="11"
              y1="8"
              x2="8"
              y2="11"
              stroke="#fff"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
