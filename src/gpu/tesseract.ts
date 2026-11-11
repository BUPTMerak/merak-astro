/**
 * Port of the original React tesseract renderer. The 4D geometry is drawn to a
 * small 2D canvas, sampled on a 6-point glyph signature and quantised to the
 * closest Unifont character. The resulting ASCII grid is what the WebGL scene
 * uploads as glyph quads.
 */

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
  VERTS.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);

const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++)
  for (let j = i + 1; j < 16; j++) {
    let d = 0;
    for (let k = 0; k < 4; k++) if (VERTS[i][k] !== VERTS[j][k]) d++;
    if (d === 1) EDGES.push([i, j]);
  }

function rot4(p: number[], a1: number, a2: number, ang: number): number[] {
  const out = [...p];
  const c = Math.cos(ang);
  const s = Math.sin(ang);
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
  let sum = 0;
  let cnt = 0;
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

function buildCharVectors(font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = CHAR_W;
  canvas.height = CHAR_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
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
    const vec = new Float64Array(6);
    for (let s = 0; s < 6; s++) {
      vec[s] = sampleCircle(
        imgData.data,
        CHAR_W * 4,
        CHAR_H,
        SAMPLE_PTS[s][0] * CHAR_W,
        SAMPLE_PTS[s][1] * CHAR_H,
        CHAR_RADIUS,
      );
    }
    vecs.push(vec);
  }

  let gmax = 0;
  for (const v of vecs) for (let i = 0; i < 6; i++) gmax = Math.max(gmax, v[i]);
  if (gmax > 0) for (const v of vecs) for (let i = 0; i < 6; i++) v[i] /= gmax;
  return { chars, vecs };
}

function computeGridSize(containerW: number, containerH: number, fontSize: number) {
  if (containerW < 10 || containerH < 10 || fontSize < 1) return { cols: 40, rows: 20 };
  const cw = Math.max(1, fontSize * 0.6);
  const ch = Math.max(1, fontSize * 1.1);
  return {
    cols: Math.min(120, Math.max(10, Math.floor(containerW / cw))),
    rows: Math.min(60, Math.max(5, Math.floor(containerH / ch))),
  };
}

function renderFrame(ctx: CanvasRenderingContext2D, sw: number, sh: number, time: number) {
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
    let p0 = VERTS[ei];
    let p1 = VERTS[ej];
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

export class Tesseract {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private chars: string[] = [];
  private vecs: Float64Array[] = [];
  private cache = new Map<number, string>();
  private time = 0;
  private prevCols = 0;
  private prevRows = 0;

  constructor(font = "Unifont, monospace") {
    const built = buildCharVectors(font);
    this.chars = built.chars;
    this.vecs = built.vecs;
  }

  update(dt: number, reducedMotion: boolean) {
    if (!reducedMotion) this.time += dt * 0.5;
  }

  private findChar(sv: Float64Array): string {
    const QUANT = 10;
    let key = 0;
    for (let i = 0; i < 6; i++) key = key * QUANT + Math.min(QUANT - 1, Math.floor(sv[i] * QUANT));
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    let best = " ";
    let bestDist = Infinity;
    for (let ci = 0; ci < this.chars.length; ci++) {
      const cv = this.vecs[ci];
      let dist = 0;
      for (let i = 0; i < 6; i++) {
        const d = sv[i] - cv[i];
        dist += d * d;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = this.chars[ci];
      }
    }
    this.cache.set(key, best);
    return best;
  }

  render(bodyW: number, bodyH: number, fontSize = 8): string {
    const { cols, rows } = computeGridSize(bodyW, bodyH, fontSize);
    if (cols !== this.prevCols || rows !== this.prevRows) {
      this.canvas.width = cols * SSX;
      this.canvas.height = rows * SSY;
      this.cache.clear();
      this.prevCols = cols;
      this.prevRows = rows;
    }
    const sw = this.canvas.width;
    const sh = this.canvas.height;
    if (sw < 1 || sh < 1) return "";
    renderFrame(this.ctx, sw, sh, this.time);
    const imgData = this.ctx.getImageData(0, 0, sw, sh).data;

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
          let sum = 0;
          let cnt = 0;
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
        for (let i = 0; i < 6; i++) sv[i] = Math.pow(sv[i] / mx, contrastExp) * mx;
        out += this.findChar(sv);
      }
      if (row < rows - 1) out += "\n";
    }
    return out;
  }
}
