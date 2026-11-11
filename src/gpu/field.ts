/**
 * The CRT glass displacement, as Chrome renders the original
 * `feImage` + `feDisplacementMap` filter on the full-viewport `.crt` box:
 *
 *  - the filter region is x -45%, y -129%, 160% x 350% of the box;
 *  - the 128x64 map is fitted *inside* that region (xMidYMid meet) and sampled
 *    bilinearly; outside the image the map is transparent black;
 *  - each output pixel shows the source pixel at `p + 100 * (map - 0.5)` CSS
 *    px, rounded to whole device pixels (no resampling).
 *
 * The same function runs in the final shader (see post.ts) and here on the
 * CPU, so a pointer can be mapped to exactly the flat pixel painted under it.
 */

export const DISPLACEMENT_SCALE = 100;

export interface MapData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface FieldGeometry {
  /** CSS px covered by one map texel. */
  scale: number;
  /** Top-left corner of the fitted map image in CSS px. */
  ox: number;
  oy: number;
}

export function fieldGeometry(
  width: number,
  height: number,
  mapW: number,
  mapH: number,
): FieldGeometry {
  const x = -0.45 * width;
  const y = -1.29 * height;
  const w = 1.6 * width;
  const h = 3.5 * height;
  const scale = Math.min(w / mapW, h / mapH);
  return {
    scale,
    ox: x + (w - mapW * scale) / 2,
    oy: y + (h - mapH * scale) / 2,
  };
}

/**
 * Offset, in whole device pixels, from the output device pixel (ix, iy) to the
 * flat source pixel it shows.
 */
export function sourceOffset(
  map: MapData,
  geom: FieldGeometry,
  dpr: number,
  ix: number,
  iy: number,
): [number, number] {
  const mx = ((ix + 0.5) / dpr - geom.ox) / geom.scale;
  const my = ((iy + 0.5) / dpr - geom.oy) / geom.scale;
  let r = 0;
  let g = 0;
  if (mx >= 0 && my >= 0 && mx < map.width && my < map.height) {
    const u = mx - 0.5;
    const v = my - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const cx0 = Math.min(Math.max(x0, 0), map.width - 1);
    const cy0 = Math.min(Math.max(y0, 0), map.height - 1);
    const cx1 = Math.min(Math.max(x0 + 1, 0), map.width - 1);
    const cy1 = Math.min(Math.max(y0 + 1, 0), map.height - 1);
    const at = (px: number, py: number, ch: number) => map.data[(py * map.width + px) * 4 + ch];
    const bil = (ch: number) =>
      (at(cx0, cy0, ch) * (1 - fx) + at(cx1, cy0, ch) * fx) * (1 - fy) +
      (at(cx0, cy1, ch) * (1 - fx) + at(cx1, cy1, ch) * fx) * fy;
    r = bil(0) / 255;
    g = bil(1) / 255;
  }
  return [
    Math.floor(DISPLACEMENT_SCALE * (r - 0.5) * dpr + 0.5),
    Math.floor(DISPLACEMENT_SCALE * (g - 0.5) * dpr + 0.5),
  ];
}

/** Painted point (CSS px) -> the flat point shown there. Exact. */
export function paintedToFlat(
  map: MapData,
  geom: FieldGeometry,
  dpr: number,
  x: number,
  y: number,
): [number, number] {
  const [dx, dy] = sourceOffset(map, geom, dpr, Math.floor(x * dpr), Math.floor(y * dpr));
  return [x + dx / dpr, y + dy / dpr];
}

/**
 * Flat point (CSS px) -> where it is painted. The displacement is defined on
 * the painted side, so this direction needs a fixed-point solve; it converges
 * quickly because the field changes by well under 1px per px.
 */
export function flatToPainted(
  map: MapData,
  geom: FieldGeometry,
  dpr: number,
  x: number,
  y: number,
  iterations = 12,
): [number, number] {
  let px = x;
  let py = y;
  for (let i = 0; i < iterations; i++) {
    const [dx, dy] = sourceOffset(map, geom, dpr, Math.floor(px * dpr), Math.floor(py * dpr));
    px = x - dx / dpr;
    py = y - dy / dpr;
  }
  return [px, py];
}

export interface LoadedMap {
  image: HTMLImageElement;
  data: MapData;
}

export function loadMap(url: string): Promise<LoadedMap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("2d context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({
        image: img,
        data: { width: canvas.width, height: canvas.height, data: data.data },
      });
    };
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}
