import type { GlyphBatch } from "./glutil";
import { textureFromSource } from "./glutil";
import type { RGBA } from "./color";

/** Glyph atlas supersampling factor (device pixels per CSS pixel is dpr*SS). */
export const ATLAS_SS = 1;

/** Number of horizontal subpixel phases rasterised per glyph. */
export const GLYPH_PHASES = 8;
/** Number of vertical subpixel phases rasterised per glyph. The DOM's text
 *  renderer applies vertical hinting (integer baselines), so 1 is correct. */
export const GLYPH_PHASES_Y = 1;

const CHARS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~" +
  "\u2026\u00d7\u25a1\u2588\u2014\u00b7";

export interface GlyphRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface GlyphAtlas {
  size: number;
  weight: number;
  dpr: number;
  pixelScale: number;
  family: string;
  advance: number;
  ascent: number;
  descent: number;
  cellW: number;
  cellH: number;
  pad: number;
  texture: WebGLTexture;
  canvas: HTMLCanvasElement;
  glyphs: Map<string, GlyphRect[]>;
}

const cache = new Map<string, GlyphAtlas>();

export const MONO_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export function getAtlas(
  gl: WebGL2RenderingContext,
  size: number,
  weight: number,
  dpr: number,
  family = "Unifont, monospace",
): GlyphAtlas {
  // Small text matches the DOM's hinted, pixel-snapped rasterisation best at
  // 1x; larger glyphs benefit from supersampling before the GPU filters them.
  const ss = size >= 12 ? Math.max(ATLAS_SS, 2) : 1;
  const key = `${size}|${weight}|${dpr}|${family}|${ss}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pixelScale = dpr * ss;
  const px = size * pixelScale;
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;
  mctx.font = `${weight} ${px}px ${family}`;
  const metrics = mctx.measureText("M");
  const advancePx = metrics.width || px * 0.5;
  const ascentPx = metrics.fontBoundingBoxAscent ?? px * 0.8;
  const descentPx = metrics.fontBoundingBoxDescent ?? px * 0.2;
  const pad = Math.max(1, Math.ceil(pixelScale));
  // +1 leaves room for the +-0.5px subpixel shift of the phase variants.
  const cellW = Math.ceil(advancePx) + pad * 2 + 1;
  const cellH = Math.ceil(ascentPx + descentPx) + pad * 2 + 1;

  const cols = 16;
  const rows = Math.ceil((CHARS.length * GLYPH_PHASES * GLYPH_PHASES_Y) / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cellW * cols;
  canvas.height = cellH * rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `${weight} ${px}px ${family}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";

  const glyphs = new Map<string, GlyphRect[]>();
  const W = canvas.width;
  const H = canvas.height;
  for (let i = 0; i < CHARS.length; i++) {
    const ch = CHARS[i];
    const rects: GlyphRect[] = [];
    for (let xp = 0; xp < GLYPH_PHASES; xp++) {
      for (let yp = 0; yp < GLYPH_PHASES_Y; yp++) {
        const idx = (i * GLYPH_PHASES + xp) * GLYPH_PHASES_Y + yp;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = col * cellW;
        const cy = row * cellH;
        const shiftX = xp / GLYPH_PHASES - 0.5;
        const shiftY = yp / GLYPH_PHASES_Y - 0.5;
        ctx.fillText(ch, cx + pad + shiftX, cy + pad + ascentPx + shiftY);
        rects.push({
          u0: cx / W,
          v0: cy / H,
          u1: (cx + cellW) / W,
          v1: (cy + cellH) / H,
        });
      }
    }
    glyphs.set(ch, rects);
  }

  const texture = textureFromSource(gl, canvas, {
    flipY: false,
    premultiply: true,
    nearest: false,
  });

  const atlas: GlyphAtlas = {
    size,
    weight,
    dpr,
    pixelScale,
    family,
    advance: advancePx / pixelScale,
    ascent: ascentPx / pixelScale,
    descent: descentPx / pixelScale,
    cellW: cellW / pixelScale,
    cellH: cellH / pixelScale,
    pad: pad / pixelScale,
    texture,
    canvas,
    glyphs,
  };
  cache.set(key, atlas);
  return atlas;
}

/** Add a run of monospaced glyphs at a baseline position (CSS px). */
export function addText(
  batch: GlyphBatch,
  atlas: GlyphAtlas,
  text: string,
  x: number,
  baseline: number,
  color: RGBA,
  scale = 1,
): number {
  let pen = x;
  const cellW = atlas.cellW * scale;
  const cellH = atlas.cellH * scale;
  const pad = atlas.pad * scale;
  const ascent = atlas.ascent * scale;
  const space = atlas.glyphs.get(" ") ?? atlas.glyphs.get("?");
  // The DOM renders text at fractional x with subpixel positioning. Each glyph
  // has 8 pre-rasterised horizontal phases; pick the nearest to the true pen.
  const snap = (v: number) => Math.round(v * atlas.pixelScale) / atlas.pixelScale;
  for (const ch of text) {
    const rects = atlas.glyphs.get(ch) ?? space;
    if (rects) {
      const snapped = snap(pen);
      const frac = pen - snapped;
      const phaseX = Math.min(
        GLYPH_PHASES - 1,
        Math.max(0, Math.round(frac * GLYPH_PHASES) + GLYPH_PHASES / 2),
      );
      const ty = baseline - ascent - pad;
      const snappedY = snap(ty);
      const fracY = ty - snappedY;
      const phaseY = Math.min(
        GLYPH_PHASES_Y - 1,
        Math.max(0, Math.round(fracY * GLYPH_PHASES_Y) + GLYPH_PHASES_Y / 2),
      );
      const g = rects[phaseX * GLYPH_PHASES_Y + phaseY] ?? rects[0];
      if (g) {
        batch.add(snapped - pad, snappedY, cellW, cellH, g.u0, g.v0, g.u1, g.v1, color);
      }
    }
    pen += atlas.advance * scale;
  }
  return pen;
}

export function textWidth(atlas: GlyphAtlas, text: string, scale = 1) {
  return text.length * atlas.advance * scale;
}

/** Clear cached GPU textures (used on WebGL context loss). */
export function clearAtlasCache() {
  cache.clear();
}
