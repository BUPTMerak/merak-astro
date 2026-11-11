/**
 * Per-window CRT curvature.
 *
 * The backdrop keeps the real `feImage` + `feDisplacementMap` warp. Windows are
 * DOM, and a CSS filter cannot move their hit boxes, so each window gets the
 * local linearisation of that same displacement field as a 2D `matrix(...)`.
 *
 * Browsers hit-test transforms, so clicks land exactly where the window is
 * painted, while the window still follows the glass: translated by the local
 * displacement and scaled/sheared by its Jacobian. Only the second-order bow
 * inside a window (1-4px over ~500px) is not representable by a DOM transform.
 */

const MAP_FILTER_ID = "SphereMapTest";

let map: ImageData | null = null;
let loading: Promise<void> | null = null;
let ready = false;

function warpHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".crt-warp");
}

function loadMap(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const fe = document.querySelector<SVGFEImageElement>(`#${MAP_FILTER_ID} feImage`);
    const href = fe?.getAttribute("xlink:href") ?? fe?.getAttribute("href") ?? "";

    if (!href) {
      resolve();
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        map = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      ready = true;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = href;
  });
  return loading;
}

/** True when the backdrop filter is actually being rendered. */
export function warpEnabled(): boolean {
  const host = warpHost();
  if (!host) return false;
  if (window.matchMedia("(max-width: 1200px)").matches) return false;
  const filter = getComputedStyle(host).filter;
  return filter !== "none" && filter !== "";
}

/**
 * Painted offset (px, screen space) of a source point under the backdrop
 * filter. Matches Chrome's rendering of `objectBoundingBox` + `xMidYMid`
 * sizing of the 128x64 displacement map.
 */
export function fieldAt(x: number, y: number): [number, number] {
  if (!map) return [0, 0];
  const host = warpHost();
  if (!host) return [0, 0];

  const r = host.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return [0, 0];

  const rx = r.x - 0.45 * r.width;
  const ry = r.y - 1.29 * r.height;
  const rw = 1.6 * r.width;
  const rh = 3.5 * r.height;

  // feImage defaults to xMidYMid meet, so it is uniformly scaled to cover:
  // the map is wider than the region, so the region samples its middle band.
  const s = Math.max(rw / map.width, rh / map.height);
  const ox = rx + (rw - map.width * s) / 2;
  const oy = ry + (rh - map.height * s) / 2;

  const u = (x - ox) / s - 0.5;
  const v = (y - oy) / s - 0.5;

  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;

  const cx0 = Math.min(Math.max(x0, 0), map.width - 1);
  const cy0 = Math.min(Math.max(y0, 0), map.height - 1);
  const cx1 = Math.min(Math.max(x0 + 1, 0), map.width - 1);
  const cy1 = Math.min(Math.max(y0 + 1, 0), map.height - 1);

  const data = map.data;
  const at = (px: number, py: number, ch: number) => data[(py * map!.width + px) * 4 + ch];

  const bilinear = (ch: number) =>
    at(cx0, cy0, ch) * (1 - fx) * (1 - fy) +
    at(cx1, cy0, ch) * fx * (1 - fy) +
    at(cx0, cy1, ch) * (1 - fx) * fy +
    at(cx1, cy1, ch) * fx * fy;

  // feDisplacementMap samples the source, so a positive stored value pulls the
  // image towards the negative axis: painted offset is the negative of the
  // map's (channel - 0.5) scaled by `scale`.
  return [-100 * (bilinear(0) / 255 - 0.5), -100 * (bilinear(1) / 255 - 0.5)];
}

/** Jacobian of the paint map at a screen point: [jxx, jxy, jyx, jyy]. */
export function jacobianAt(x: number, y: number, h = 2): [number, number, number, number] {
  const [ax, ay] = fieldAt(x - h, y);
  const [bx, by] = fieldAt(x + h, y);
  const [cx, cy] = fieldAt(x, y - h);
  const [dx, dy] = fieldAt(x, y + h);

  return [
    1 + (bx - ax) / (2 * h),
    (dx - cx) / (2 * h),
    (by - ay) / (2 * h),
    1 + (dy - cy) / (2 * h),
  ];
}

interface SlotGeometry {
  desktop: HTMLElement;
  /** Parent scale from `.crt-curve` (screen px per local px). */
  k: number;
  w: number;
  h: number;
  /** Screen-space centre of the *un-warped* layout box. */
  cx: number;
  cy: number;
}

export function slotGeometry(slot: HTMLElement): SlotGeometry | null {
  const desktop = slot.parentElement;
  if (!desktop || desktop === document.body) return null;

  const dr = desktop.getBoundingClientRect();
  if (dr.width <= 0 || desktop.offsetWidth <= 0) return null;

  const k = dr.width / desktop.offsetWidth;
  const w = slot.offsetWidth;
  const h = slot.offsetHeight;

  return {
    desktop,
    k,
    w,
    h,
    cx: dr.x + (slot.offsetLeft + w / 2) * k,
    cy: dr.y + (slot.offsetTop + h / 2) * k,
  };
}

function clearWarp(slot: HTMLElement) {
  slot.style.transform = "";
  slot.style.transformOrigin = "";
}

/**
 * Give a window the local affine approximation of the glass warp.
 *
 * With `transform-origin: 0 0`, the local matrix is
 *   M = J, t = d / k + (I - J) * (w/2, h/2)
 * so the painted box is translated by `d` and linearly warped around its
 * centre. `k` is the uniform perspective scale applied by `.crt-curve`.
 */
export function applyWarp(slot: HTMLElement) {
  if (!ready || !warpEnabled()) {
    clearWarp(slot);
    return;
  }

  const g = slotGeometry(slot);
  if (!g || g.w <= 0 || g.h <= 0) return;

  const [dx, dy] = fieldAt(g.cx, g.cy);
  const [jxx, jxy, jyx, jyy] = jacobianAt(g.cx, g.cy);

  const mx = dx / g.k + (1 - jxx) * (g.w / 2) - jxy * (g.h / 2);
  const my = dy / g.k - jyx * (g.w / 2) + (1 - jyy) * (g.h / 2);

  slot.style.transformOrigin = "0 0";
  slot.style.transform = `matrix(${jxx}, ${jyx}, ${jxy}, ${jyy}, ${mx}, ${my})`;
}

function warpableSlots(): HTMLElement[] {
  const desktop = document.querySelector<HTMLElement>("[data-desktop]");
  if (!desktop) return [];
  return Array.from(desktop.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && (el.matches("[data-slot]") || el.matches("[data-window]")),
  );
}

/** Warp every window on the desktop (initial windows and popups). */
export function applyAll() {
  for (const slot of warpableSlots()) applyWarp(slot);
}

/** Resolve once the displacement map is decoded, then run a callback. */
export function whenWarpReady(cb: () => void) {
  void loadMap().then(() => {
    if (!ready) return;
    cb();
  });
}

export function initWarp() {
  whenWarpReady(applyAll);

  let timer: number | undefined;
  window.addEventListener("resize", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(applyAll, 120);
  });
}
