import type { Palette, RGBA } from "./color";
import type { GlyphAtlas } from "./font";
import { addText, textWidth } from "./font";
import type { GlyphBatch, QuadBatch } from "./glutil";

export const BORDER = 2;
export const TITLE_H = 24;
export const BODY_TOP = BORDER + TITLE_H; // 26
export const BTN_W = 16;
export const BTN_H = 14;
export const BTN_GAP = 2;
export const RESIZE = 12;
export const MIN_W = 200;
export const MIN_H = 80;

/**
 * Typography/layout metrics for the three reference breakpoints. These mirror
 * the Tailwind classes on the DOM windows:
 *   <640px : text-sm (14px), p-2 (8px), title 11px, pre 10px, nav 12px
 *   640-767: 10px, p-1 (4px), title 11px, pre 6px, nav 10px
 *   >=768  : 12px, p-1.5 (6px), title 10px, pre 8px, nav 10px
 */
export interface Metrics {
  key: "phone" | "tablet" | "desktop";
  titleSize: number;
  titleBase: number;
  titleH: number;
  titleButtonY: number;
  bodySize: number;
  bodyLine: number;
  bodyBase: number;
  bodyPad: number;
  blank: number;
  smallSize: number;
  smallLine: number;
  smallBase: number;
  navSize: number;
  navLine: number;
  navBase: number;
  navPadX: number;
  navPadY: number;
  navBtnH: number;
  navBtnPadX: number;
  navGap: number;
  navH: number;
  icpSize: number;
}

const DESKTOP_METRICS: Metrics = {
  key: "desktop",
  titleSize: 10,
  titleBase: 16.5,
  titleH: 24,
  titleButtonY: 6.5,
  bodySize: 12,
  bodyLine: 15,
  bodyBase: 12,
  bodyPad: 6,
  blank: 14.4,
  smallSize: 8,
  smallLine: 8,
  smallBase: 7,
  navSize: 10,
  navLine: 13.3333,
  navBase: 12.6667,
  navPadX: 4,
  navPadY: 4,
  navBtnH: 17.3333,
  navBtnPadX: 8,
  navGap: 2,
  navH: 53.3333,
  icpSize: 8,
};

const TABLET_METRICS: Metrics = {
  key: "tablet",
  titleSize: 11,
  titleBase: 18.75,
  titleH: 25.5,
  titleButtonY: 7.25,
  bodySize: 10,
  bodyLine: 12.5,
  bodyBase: 10.25,
  bodyPad: 4,
  blank: 12,
  smallSize: 6,
  smallLine: 6,
  smallBase: 5,
  navSize: 10,
  navLine: 13.3333,
  navBase: 12.6667,
  navPadX: 4,
  navPadY: 4,
  navBtnH: 17.3333,
  navBtnPadX: 8,
  navGap: 2,
  navH: 54.8333,
  icpSize: 8,
};

const PHONE_METRICS: Metrics = {
  key: "phone",
  titleSize: 11,
  titleBase: 18.75,
  titleH: 25.5,
  titleButtonY: 7.25,
  bodySize: 14,
  bodyLine: 17.5,
  bodyBase: 13.75,
  bodyPad: 8,
  blank: 16.8,
  smallSize: 10,
  smallLine: 10,
  smallBase: 9,
  navSize: 12,
  navLine: 16,
  navBase: 14.5,
  navPadX: 8,
  navPadY: 6,
  navBtnH: 20,
  navBtnPadX: 12,
  navGap: 4,
  navH: 61.5,
  icpSize: 10,
};

export function metricsFor(width: number): Metrics {
  if (width < 640) return PHONE_METRICS;
  if (width < 768) return TABLET_METRICS;
  return DESKTOP_METRICS;
}

export type WindowKind = "hello" | "tesseract" | "nav" | "about" | "projects" | "contact";

export interface WindowState {
  id: string;
  kind: WindowKind;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  closed: boolean;
  hover: "min" | "max" | "close" | "resize" | "icp" | null;
  hoverNav: number;
  scrollY: number;
  maxScroll: number;
  scrollInfo: ScrollbarInfo | null;
}

export interface ScrollbarInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  trackTop: number;
  trackH: number;
  thumbY: number;
  thumbH: number;
  max: number;
}

export interface ContentTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface DrawContext {
  palette: Palette;
  quad: QuadBatch;
  glyph: GlyphBatch;
  atlas: (size: number, weight: number, mono?: boolean, extra?: string) => GlyphAtlas;
  transform: ContentTransform;
  cssW: number;
  cssH: number;
  dpr: number;
  setClip: (rect: [number, number, number, number] | null) => void;
  flushQuads: () => void;
  flushGlyphs: () => void;
  tesseractText: (bodyW: number, bodyH: number, fontSize: number) => string;
  metrics: Metrics;
  time: number;
  blink: boolean;
}

export const WINDOW_TITLES: Record<WindowKind, string> = {
  hello: "C:\\HELLO.EXE",
  tesseract: "C:\\TESSERACT.EXE",
  nav: "C:\\NAV.EXE",
  about: "C:\\ABOUT.EXE",
  projects: "C:\\PROJECTS.EXE",
  contact: "C:\\CONTACT.EXE",
};

const HELLO_ART = `          _______   __    __  _______ ________  __       __                               __       
          |       \\ |  \\  |  \\|       \\        \\|  \\     /  \\                             |  \\      
          | $$$$$$$\\| $$  | $$| $$$$$$$\\$$$$$$$$| $$\\   /  $$  ______    ______   ______  | $$   __ 
          | $$__/ $$| $$  | $$| $$__/ $$ | $$   | $$$\\ /  $$$ /      \\  /      \\ |      \\ | $$  /  \\
          | $$    $$| $$  | $$| $$    $$ | $$   | $$$$\\  $$$$|  $$$$$$\\|  $$$$$$\\ \\$$$$$$\\| $$_/  $$
          | $$$$$$$\\| $$  | $$| $$$$$$$  | $$   | $$\\$$ $$ $$| $$    $$| $$   \\$$/      $$| $$   $$ 
          | $$__/ $$| $$__/ $$| $$       | $$   | $$ \\$$$| $$| $$$$$$$$| $$     |  $$$$$$$| $$$$$$\\ 
          | $$    $$ \\$$    $$| $$       | $$   | $$  \\$ | $$ \\$$     \\| $$      \\$$    $$| $$  \\$$\\
           \\$$$$$$$   \\$$$$$$  \\$$        \\$$    \\$$      \\$$  \\$$$$$$$ \\$$       \\$$$$$$$ \\$$   \\$$`;

/**
 * Placement of the window layer on the flat screen. `inset` is the layer's
 * distance from the screen edge; with `curve` it gets the original
 * `perspective(1200px) translateZ(50px)` zoom about the screen centre.
 */
export function createTransform(
  cssW: number,
  cssH: number,
  inset: number,
  curve: boolean,
): ContentTransform {
  const scale = curve ? 1200 / (1200 - 50) : 1;
  const cx = cssW / 2;
  const cy = cssH / 2;
  return {
    scale,
    offsetX: cx + (inset - cx) * scale,
    offsetY: cy + (inset - cy) * scale,
  };
}

export function toScreen(
  t: ContentTransform,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number, number] {
  return [t.offsetX + x * t.scale, t.offsetY + y * t.scale, w * t.scale, h * t.scale];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand(lo: number, hi: number, rng: () => number) {
  return lo + rng() * (hi - lo);
}

/** Greedy word wrap for the info-window body (which is normal, wrapping text). */
function wrapLines(text: string, maxWidth: number, atlas: GlyphAtlas): string[] {
  if (textWidth(atlas, text) <= maxWidth) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(atlas, next) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export class Scene {
  windows: WindowState[] = [];
  metrics: Metrics = DESKTOP_METRICS;
  private contentW = 0;
  private contentH = 0;
  /** Content zoom the renderer composites with (1200/1150 when warping). */
  private zoom = 1;
  private z = 10;
  private popupCount = 0;
  /** ICP filing link text from PUBLIC_ICP; empty when unset. */
  icp = "";
  /** Wrapped ICP lines and their box inside the nav window (local px). */
  private icpLayout: { x: number; w: number; lines: string[] } | null = null;
  navButtons: {
    label: string;
    x: number;
    w: number;
    action: "home" | "about" | "projects" | "contact";
  }[] = [];
  private pendingIcons: { x: number; y: number; kind: "min" | "max" | "close" }[] = [];

  constructor(
    public palette: Palette,
    contentW: number,
    contentH: number,
    opts: { flat?: boolean; seed?: number; mobile?: boolean; zoom?: number } = {},
  ) {
    this.layout(contentW, contentH, opts);
  }

  layout(
    contentW: number,
    contentH: number,
    opts: { flat?: boolean; seed?: number; mobile?: boolean; zoom?: number } = {},
  ) {
    this.contentW = contentW;
    this.contentH = contentH;
    this.metrics = metricsFor(contentW + 32);
    this.zoom = opts.zoom ?? 1;
    if (opts.mobile ?? contentW + 32 < 768) {
      this.layoutMobile(contentW, contentH);
      return;
    }
    const rng = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;
    // The DOM reads the nav's height through the content zoom (getBoundingClientRect)
    // before pinning it with Math.round-ed px values, so the applied height grows
    // with the zoom even though it is written in unzoomed CSS px.
    const zoom = this.zoom;
    const navW = Math.round(Math.min(contentW * 0.45, 520));
    // Buttons depend only on metrics; the ICP wrap needs them, and the nav
    // height needs the wrapped line count.
    this.computeNavButtons(navW);
    this.icpLayout = this.wrapIcp(navW);
    const navNaturalH =
      BORDER * 2 + this.metrics.titleH + this.metrics.navPadY * 2 + this.navRowH();
    const navMeasured = navNaturalH * zoom;
    const navH = Math.round(navMeasured);
    const nav: WindowState = {
      id: "nav",
      kind: "nav",
      title: WINDOW_TITLES.nav,
      x: Math.round((contentW - navW) / 2),
      y: Math.round(contentH - navMeasured - contentH * 0.03),
      w: navW,
      h: navH,
      z: 9999,
      closed: false,
      hover: null,
      hoverNav: -1,
      scrollY: 0,
      maxScroll: 0,
      scrollInfo: null,
    };

    let hello: WindowState;
    let tess: WindowState;
    if (opts.flat) {
      hello = { ...this.win("hello"), x: 19, y: 19, w: 763, h: 351 };
      tess = { ...this.win("tesseract"), x: 857, y: 17, w: 523, h: 559 };
    } else {
      // applyAbsolute writes Math.round-ed px, like for the nav above.
      const hW = Math.round(rand(contentW * 0.42, contentW * 0.56, rng));
      const hH = Math.round(rand(contentH * 0.3, contentH * 0.5, rng));
      hello = {
        ...this.win("hello"),
        x: Math.round(rand(0, contentW * 0.04, rng)),
        y: Math.round(rand(0, contentH * 0.04, rng)),
        w: hW,
        h: hH,
      };
      const tW = Math.round(rand(contentW * 0.32, contentW * 0.46, rng));
      const tH = Math.round(rand(contentH * 0.55, contentH * 0.88, rng));
      tess = {
        ...this.win("tesseract"),
        x: Math.round(rand(contentW - tW - contentW * 0.04, contentW - tW, rng)),
        y: Math.round(rand(0, contentH * 0.05, rng)),
        w: tW,
        h: tH,
      };
    }
    hello.z = 11;
    tess.z = 12;
    this.windows = [hello, tess, nav];
    this.z = 12;
    this.popupCount = 0;
    this.computeNavButtons(navW);
  }

  private layoutMobile(contentW: number, contentH: number) {
    // Mirrors the <768px flex column: hello (natural height), tesseract
    // (flex-1), nav (natural width, centered at the bottom).
    const m = this.metrics;
    const textH =
      m.bodyPad * 2 +
      m.bodyLine +
      m.blank +
      10 * m.smallLine +
      m.blank +
      3 * m.bodyLine +
      m.blank +
      m.bodyLine;
    const helloH = Math.min(contentH * 0.5, BORDER * 2 + m.titleH + textH);
    const navW = Math.min(contentW, this.navNaturalWidth());
    // Buttons, then ICP wrap (a wrapped block makes the row, and the nav, taller).
    this.computeNavButtons(navW);
    this.icpLayout = this.wrapIcp(navW);
    // The mobile nav stays in flow (no applyAbsolute rounding): keep the
    // fractional height the flexbox actually lays out.
    const navH = BORDER * 2 + m.titleH + m.navPadY * 2 + this.navRowH();
    const navY = contentH - navH;
    const gap = 12;
    const hello: WindowState = {
      ...this.win("hello"),
      x: 0,
      y: 0,
      w: contentW,
      h: helloH,
      z: 11,
    };
    const tess: WindowState = {
      ...this.win("tesseract"),
      x: 0,
      y: helloH + gap,
      w: contentW,
      h: Math.max(120, navY - gap - (helloH + gap)),
      z: 12,
    };
    const nav: WindowState = {
      ...this.win("nav"),
      x: (contentW - navW) / 2,
      y: navY,
      w: navW,
      h: navH,
      z: 9999,
    };
    this.windows = [hello, tess, nav];
    this.z = 12;
    this.popupCount = 0;
    this.computeNavButtons(navW);
  }

  /** Unifont advance: halfwidth glyphs are size/2, CJK fullwidth are size. */
  private icpCharW(ch: string, size: number): number {
    const fullwidth =
      /[\u2e80-\u9fff\uac00-\ud7ff\uf900-\ufaff\uff00-\uff60\u3000-\u303f]/.test(ch);
    return fullwidth ? size : size * 0.5;
  }

  private icpTextWidth(text: string, size: number): number {
    let w = 0;
    for (const ch of text) w += this.icpCharW(ch, size);
    return w;
  }

  /** Greedy char wrap of the ICP text into the space right of the buttons. */
  private wrapIcp(navW: number): { x: number; w: number; lines: string[] } | null {
    if (!this.icp) return null;
    const m = this.metrics;
    const last = this.navButtons[this.navButtons.length - 1];
    // navButtons x's already include the border + row padding.
    const buttonsEnd = last ? last.x + last.w : 0;
    const x = buttonsEnd + (last ? m.navGap : 0);
    const avail = Math.max(m.icpSize, navW - BORDER - m.navPadX - x);
    const lines: string[] = [];
    let line = "";
    for (const ch of this.icp) {
      if (line && this.icpTextWidth(line + ch, m.icpSize) > avail) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) lines.push(line);
    return { x, w: Math.max(...lines.map((l) => this.icpTextWidth(l, m.icpSize))), lines };
  }

  /** Height of the nav button row content (buttons vs wrapped ICP block). */
  private navRowH(): number {
    const m = this.metrics;
    const icp = this.icpLayout ? this.icpLayout.lines.length * m.icpSize * 1.5 : 0;
    return Math.max(m.navBtnH, icp);
  }

  private navNaturalWidth(): number {
    const m = this.metrics;
    const labels = ["Home", "About", "Projects", "Contact"];
    const buttons = labels.reduce(
      (sum, label) => sum + label.length * (m.navSize * 0.5) + m.navBtnPadX * 2,
      0,
    );
    const icpW = this.icp ? m.navGap + this.icpTextWidth(this.icp, m.icpSize) : 0;
    return BORDER * 2 + m.navPadX * 2 + buttons + (labels.length - 1) * m.navGap + icpW;
  }

  private win(kind: WindowKind): WindowState {
    return {
      id: kind,
      kind,
      title: WINDOW_TITLES[kind],
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      z: 0,
      closed: false,
      hover: null,
      hoverNav: -1,
      scrollY: 0,
      maxScroll: 0,
      scrollInfo: null,
    };
  }

  private computeNavButtons(navW: number) {
    const nav = this.windows.find((w) => w.kind === "nav");
    if (!nav) return;
    const defs: { label: string; action: "home" | "about" | "projects" | "contact" }[] = [
      { label: "Home", action: "home" },
      { label: "About", action: "about" },
      { label: "Projects", action: "projects" },
      { label: "Contact", action: "contact" },
    ];
    const m = this.metrics;
    let x = BORDER + m.navPadX;
    this.navButtons = defs.map((d) => {
      const w = d.label.length * (m.navSize * 0.5) + m.navBtnPadX * 2;
      const btn = { label: d.label, x, w, action: d.action };
      x += w + m.navGap;
      return btn;
    });
    void navW;
  }

  scrollable(win: WindowState): boolean {
    return (
      win.kind === "hello" ||
      win.kind === "about" ||
      win.kind === "projects" ||
      win.kind === "contact"
    );
  }

  sorted() {
    return this.windows.filter((w) => !w.closed).sort((a, b) => a.z - b.z);
  }

  bringToFront(win: WindowState) {
    if (win.kind === "nav") return;
    win.z = ++this.z;
  }

  close(win: WindowState) {
    win.closed = true;
  }

  openPopup(kind: Extract<WindowKind, "about" | "projects" | "contact">) {
    const existing = this.windows.find((w) => w.kind === kind);
    if (existing) {
      // The DOM just un-hides the element: it keeps its old position.
      existing.closed = false;
      this.bringToFront(existing);
      return existing;
    }
    // openPopup measures the desktop rect through the content zoom and rounds.
    const zoom = this.zoom;
    const idx = this.popupCount % 5;
    const win: WindowState = {
      ...this.win(kind),
      x: 40 + idx * 30,
      y: 40 + idx * 30,
      w: Math.min(450, Math.round(this.contentW * zoom * 0.7)),
      h: Math.min(350, Math.round(this.contentH * zoom * 0.55)),
      z: ++this.z,
    };
    this.popupCount++;
    this.windows.push(win);
    return win;
  }

  /** Hit test in content-local coordinates. */
  hitTest(px: number, py: number): { win: WindowState; part: string; navIndex: number } | null {
    const ordered = [...this.windows].filter((w) => !w.closed).sort((a, b) => b.z - a.z);
    for (const win of ordered) {
      if (px < win.x || py < win.y || px > win.x + win.w || py > win.y + win.h) continue;
      const relX = px - win.x;
      const relY = py - win.y;

      // Resize grip.
      if (relX >= win.w - 14 && relY >= win.h - 14) return { win, part: "resize", navIndex: -1 };

      // Title bar buttons.
      const m = this.metrics;
      const bodyTop = BORDER + m.titleH;
      if (relY >= 2 && relY < bodyTop) {
        const closeX = win.w - 20;
        const btnTop = m.titleButtonY + (win.kind === "nav" ? 1 : 0);
        if (relY >= btnTop && relY < btnTop + BTN_H) {
          if (relX >= closeX && relX < closeX + BTN_W) return { win, part: "close", navIndex: -1 };
          if (relX >= closeX - 18 && relX < closeX - 18 + BTN_W)
            return { win, part: "max", navIndex: -1 };
          if (relX >= closeX - 36 && relX < closeX - 36 + BTN_W)
            return { win, part: "min", navIndex: -1 };
        }
        return { win, part: "title", navIndex: -1 };
      }

      // Scrollbar (only when the content overflows).
      if (this.scrollable(win) && win.scrollInfo) {
        const s = win.scrollInfo;
        if (px >= s.x && px <= s.x + s.w) return { win, part: "scrollbar", navIndex: -1 };
      }

      // Nav body buttons.
      if (win.kind === "nav") {
        const box = this.icpBox(win);
        if (box && px >= box.x - 2 && px <= box.x + box.w + 2 && py >= box.y - 2 && py <= box.y + box.h + 2) {
          return { win, part: "icp", navIndex: -1 };
        }
        const bodyY = win.y + BORDER + this.metrics.titleH;
        if (py >= bodyY && py <= bodyY + 25) {
          for (let i = 0; i < this.navButtons.length; i++) {
            const b = this.navButtons[i];
            if (px >= win.x + b.x && px <= win.x + b.x + b.w) {
              return { win, part: "navbtn", navIndex: i };
            }
          }
        }
        return { win, part: "body", navIndex: -1 };
      }

      return { win, part: "body", navIndex: -1 };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  draw(ctx: DrawContext) {
    this.pendingIcons = [];
    for (const win of this.sorted()) this.drawWindow(ctx, win);
    ctx.setClip(null);
    ctx.flushGlyphs();
  }

  private drawWindow(ctx: DrawContext, win: WindowState) {
    const p = ctx.palette;
    const q = ctx.quad;
    const m = ctx.metrics;
    const { x, y, w, h } = win;
    const t = ctx.transform;

    // Window body/border.
    q.add(x, y, w, h, p.surface);

    // Title bar gradient.
    const tbX = x + BORDER;
    const tbY = y + BORDER;
    const tbW = w - BORDER * 2;
    q.addGradient(tbX, tbY, tbW, m.titleH, p.titleFrom, p.titleTo, "h");
    q.add(tbX, tbY + m.titleH - 1, tbW, 1, p.titleBorder);

    // 1px highlight at the top/left of the title bar (classic bevel).
    // The reference titlebar has no 1px white top/left highlight; the DOM
    // edge is just the gradient against the 2px window border.

    // Title text.
    const titleFont = ctx.atlas(m.titleSize, 700);
    this.setAtlas(ctx, titleFont);
    // The nav's title bar uses the original 17.5px baseline while the hello /
    // tesseract titles sit 1px higher (DOM measurement).
    const titleBase = win.kind === "nav" ? m.titleBase + 1 : m.titleBase;
    addText(ctx.glyph, titleFont, win.title, x + 10, y + titleBase, p.white);

    // Window control buttons.
    const closeX = x + w - 20;
    const btnY = y + m.titleButtonY + (win.kind === "nav" ? 1 : 0);
    this.drawButton(ctx, closeX, btnY, "close", win.hover === "close");
    this.drawButton(ctx, closeX - 18, btnY, "max", win.hover === "max");
    this.drawButton(ctx, closeX - 36, btnY, "min", win.hover === "min");

    // Flush the chrome (no body clip yet).
    ctx.setClip(null);
    ctx.flushQuads();
    ctx.flushGlyphs();

    // Body.
    const bodyX = x + BORDER;
    const bodyY = y + BORDER + m.titleH;
    const bodyW = w - BORDER * 2;
    const bodyH = h - BORDER - m.titleH - BORDER;
    const bodyClip = toScreen(t, bodyX, bodyY, bodyW, bodyH);
    ctx.setClip(bodyClip);

    q.add(bodyX, bodyY, bodyW, bodyH, p.body);
    // Inner bevel highlight around the body.
    q.add(bodyX, bodyY, 1, bodyH, p.bevelLight);
    q.add(bodyX + bodyW - 1, bodyY, 1, bodyH, p.bevelLight);
    q.add(bodyX, bodyY + bodyH - 1, bodyW, 1, p.bevelLight);
    ctx.flushQuads();

    const contentH =
      win.kind === "hello"
        ? this.drawTerminal(ctx, win, bodyX, bodyY)
        : win.kind === "tesseract"
          ? this.drawTesseract(ctx, win, bodyX, bodyY, bodyW, bodyH)
          : win.kind === "nav"
            ? this.drawNav(ctx, win, bodyX, bodyY)
            : this.drawInfo(ctx, win, bodyX, bodyY);

    win.maxScroll = Math.max(0, contentH - bodyH);
    win.scrollY = Math.min(win.scrollY, win.maxScroll);
    if (win.maxScroll > 0 && this.scrollable(win)) {
      this.drawScrollbar(ctx, win, bodyX, bodyY, bodyW, bodyH, contentH);
    } else {
      win.scrollInfo = null;
    }

    // Flush body content while the scissor is active.
    ctx.flushQuads();
    ctx.flushGlyphs();
    ctx.setClip(null);

    // Resize grip.
    this.drawResize(ctx, win);
  }

  private setAtlas(ctx: DrawContext, atlas: GlyphAtlas) {
    if (ctx.glyph.texture !== atlas.texture) {
      if (ctx.glyph.texture) ctx.flushGlyphs();
      ctx.glyph.texture = atlas.texture;
    }
    ctx.glyph.atlas = atlas;
  }

  private drawButton(
    ctx: DrawContext,
    x: number,
    y: number,
    kind: "min" | "max" | "close",
    hovered: boolean,
  ) {
    const p = ctx.palette;
    const q = ctx.quad;
    q.add(x, y, BTN_W, BTN_H, hovered ? p.surfaceHover : p.surface);
    q.add(x, y, BTN_W, 1, p.btnLight);
    q.add(x, y, 1, BTN_H, p.btnLight);
    q.add(x, y + BTN_H - 1, BTN_W, 1, p.btnDark);
    q.add(x + BTN_W - 1, y, 1, BTN_H, p.btnDark);

    // Match the reference SVGs: minimize 8x2 bar, maximize 8x8 outline with a
    // 2px top bar, close 6x6 cross with 1px strokes. Pure black ink.
    const ink: RGBA = [0, 0, 0, 1];
    if (kind === "min") {
      q.add(x + 4, y + 8, 8, 2, ink);
    } else if (kind === "max") {
      q.add(x + 4, y + 3, 8, 2, ink);
      q.add(x + 4, y + 3, 1, 8, ink);
      q.add(x + 11, y + 3, 1, 8, ink);
      q.add(x + 4, y + 10, 8, 1, ink);
    } else {
      this.addLine(ctx, x + 5.5, y + 4.5, x + 10.5, y + 9.5, 1, ink);
      this.addLine(ctx, x + 10.5, y + 4.5, x + 5.5, y + 9.5, 1, ink);
    }
  }

  private addLine(
    ctx: DrawContext,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: RGBA,
  ) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    ctx.quad.addQuad(
      [
        [x0 + nx, y0 + ny],
        [x1 + nx, y1 + ny],
        [x1 - nx, y1 - ny],
        [x0 - nx, y0 - ny],
      ],
      color,
    );
  }

  private drawResize(ctx: DrawContext, win: WindowState) {
    const x = win.x + win.w - 14;
    const y = win.y + win.h - 14;
    const p = ctx.palette;
    const gray = p.bevelDark;
    const white = p.bevelLight;
    for (const [ox, oy, o2x, o2y] of [
      [10, 2, 2, 10],
      [10, 5, 5, 10],
      [10, 8, 8, 10],
    ]) {
      this.addLine(ctx, x + ox + 1, y + oy, x + o2x, y + o2y + 1, 1, white);
      this.addLine(ctx, x + ox, y + oy, x + o2x, y + o2y, 1, gray);
    }
    ctx.flushQuads();
  }

  private drawPrompt(
    ctx: DrawContext,
    bodyX: number,
    lineTop: number,
    command: string,
    commandColor: RGBA,
  ) {
    const m = ctx.metrics;
    const adv = m.bodySize * 0.5;
    const bold = ctx.atlas(m.bodySize, 700);
    const normal = ctx.atlas(m.bodySize, 400);
    this.setAtlas(ctx, bold);
    addText(ctx.glyph, bold, "C:\\>", bodyX, lineTop + m.bodyBase, ctx.palette.yellow);
    // The DOM has a collapsed whitespace node (one space) plus ml-1 (4px).
    const cmdX = bodyX + 4 * adv + adv + 4;
    this.setAtlas(ctx, normal);
    addText(ctx.glyph, normal, command, cmdX, lineTop + m.bodyBase, commandColor);
  }

  private drawTerminal(ctx: DrawContext, win: WindowState, bodyX: number, bodyY: number) {
    const p = ctx.palette;
    const m = ctx.metrics;
    const adv = m.bodySize * 0.5;
    const x = bodyX + m.bodyPad;
    let line = bodyY + m.bodyPad - win.scrollY;

    this.drawPrompt(ctx, x, line, "hello.exe", p.gray);
    ctx.flushGlyphs();
    line += m.bodyLine;
    line += m.blank;

    const small = ctx.atlas(m.smallSize, 400, true);
    this.setAtlas(ctx, small);
    for (const artLine of HELLO_ART.split("\n")) {
      addText(ctx.glyph, small, artLine, x, line + small.ascent, p.cyan);
      line += m.smallLine;
    }
    // The template's <pre> ends with a newline, so its box has one more
    // (empty) line before the following 1.2em spacer.
    line += m.smallLine;
    line += m.blank;

    const normal = ctx.atlas(m.bodySize, 400);
    this.setAtlas(ctx, normal);
    for (const text of [
      "Welcome to the retro terminal!",
      "System initialized successfully.",
      "Ready for input...",
    ]) {
      addText(ctx.glyph, normal, text, x, line + m.bodyBase, p.green);
      line += m.bodyLine;
    }
    line += m.blank;

    // Prompt + blinking cursor block.
    const bold = ctx.atlas(m.bodySize, 700);
    this.setAtlas(ctx, bold);
    addText(ctx.glyph, bold, "C:\\>", x, line + m.bodyBase, p.yellow);
    this.setAtlas(ctx, normal);
    if (ctx.blink) {
      addText(ctx.glyph, normal, "\u2588", x + 5 * adv, line + m.bodyBase, p.green);
    }
    ctx.flushGlyphs();
    return (
      m.bodyPad * 2 +
      m.bodyLine +
      m.blank +
      10 * m.smallLine +
      m.blank +
      3 * m.bodyLine +
      m.blank +
      m.bodyLine
    );
  }

  private drawTesseract(
    ctx: DrawContext,
    win: WindowState,
    bodyX: number,
    bodyY: number,
    bodyW: number,
    bodyH: number,
  ) {
    const m = ctx.metrics;
    const text = ctx.tesseractText(bodyW, bodyH, m.smallSize);
    if (!text) return 0;
    const small = ctx.atlas(m.smallSize, 400, true);
    this.setAtlas(ctx, small);
    const lines = text.split("\n");
    for (let row = 0; row < lines.length; row++) {
      addText(
        ctx.glyph,
        small,
        lines[row],
        bodyX + 4,
        bodyY + 4 + row * m.smallLine + small.ascent,
        ctx.palette.cyan,
      );
    }
    ctx.flushGlyphs();
    void win;
    return 0;
  }

  private drawNav(ctx: DrawContext, win: WindowState, bodyX: number, bodyY: number) {
    const p = ctx.palette;
    const m = ctx.metrics;
    const navFont = ctx.atlas(m.navSize, 700);
    for (let i = 0; i < this.navButtons.length; i++) {
      const b = this.navButtons[i];
      const hovered = win.hoverNav === i;
      this.drawButtonBox(ctx, win.x + b.x, bodyY + m.navPadY, b.w, m.navBtnH, hovered);
    }
    ctx.flushQuads();
    this.setAtlas(ctx, navFont);
    for (let i = 0; i < this.navButtons.length; i++) {
      const b = this.navButtons[i];
      addText(
        ctx.glyph,
        navFont,
        b.label,
        win.x + b.x + m.navBtnPadX,
        bodyY + m.navPadY + m.navBase,
        p.text,
      );
    }
    ctx.flushGlyphs();

    // ICP filing link, right of the buttons (ml-auto in the DOM).
    const icp = this.icpLayout;
    if (icp && this.icp) {
      const font = ctx.atlas(m.icpSize, 400, false, this.icp);
      this.setAtlas(ctx, font);
      const box = this.icpBox(win);
      if (box) {
        const lh = m.icpSize * 1.5;
        const base = box.y + (lh - (font.ascent + font.descent)) / 2 + font.ascent;
        for (let i = 0; i < icp.lines.length; i++) {
          // Mixed-width text: advance per glyph (the batch is monospace-only).
          let pen = box.x;
          for (const ch of icp.lines[i]) {
            addText(ctx.glyph, font, ch, pen, base + i * lh, win.hover === "icp" ? p.text : p.dim);
            pen += this.icpCharW(ch, m.icpSize);
          }
        }
      }
      ctx.flushGlyphs();
    }
    void win;
    void bodyX;
    return 0;
  }

  /** Box of the ICP link inside the nav window (window-local px). */
  private icpBox(win: WindowState): { x: number; y: number; w: number; h: number } | null {
    const icp = this.icpLayout;
    if (!icp || !this.icp) return null;
    const m = this.metrics;
    const right = win.x + win.w - BORDER - m.navPadX;
    const x = Math.max(win.x + icp.x, right - icp.w);
    const lh = m.icpSize * 1.5;
    const blockH = icp.lines.length * lh;
    const y = win.y + BORDER + m.titleH + m.navPadY + Math.max(0, (m.navBtnH - blockH) / 2);
    return { x, y, w: icp.w, h: Math.max(blockH, 8) };
  }

  private drawButtonBox(
    ctx: DrawContext,
    x: number,
    y: number,
    w: number,
    h: number,
    hovered: boolean,
  ) {
    const p = ctx.palette;
    const q = ctx.quad;
    q.add(x, y, w, h, hovered ? p.surfaceHover : p.surface);
    q.add(x, y, w, 1, p.btnLight);
    q.add(x, y, 1, h, p.btnLight);
    q.add(x, y + h - 1, w, 1, p.btnDark);
    q.add(x + w - 1, y, 1, h, p.btnDark);
  }

  private drawInfo(ctx: DrawContext, win: WindowState, bodyX: number, bodyY: number) {
    const p = ctx.palette;
    const m = ctx.metrics;
    const x = bodyX + m.bodyPad;
    let line = bodyY + m.bodyPad - win.scrollY;
    let wrappedCount = 0;
    const bodyText = () => ctx.atlas(m.bodySize, 400);
    if (win.kind === "about") {
      this.drawPrompt(ctx, x, line, "about.exe", p.gray);
      ctx.flushGlyphs();
      line += m.bodyLine + m.blank;
      const normal = bodyText();
      this.setAtlas(ctx, normal);
      const maxW = win.w - BORDER * 2 - m.bodyPad * 2;
      for (const t of [
        "Hello! Welcome to my corner of the internet.",
        "I build things for the web.",
      ]) {
        for (const wrapped of wrapLines(t, maxW, normal)) {
          addText(ctx.glyph, normal, wrapped, x, line + m.bodyBase, p.green);
          line += m.bodyLine;
          wrappedCount++;
        }
      }
    } else if (win.kind === "projects") {
      this.drawPrompt(ctx, x, line, "dir /projects", p.dark ? p.white : p.gray);
      ctx.flushGlyphs();
      line += m.bodyLine + m.blank;
      const normal = bodyText();
      this.setAtlas(ctx, normal);
      const maxW = win.w - BORDER * 2 - m.bodyPad * 2;
      for (const t of ["Directory of C:\\PROJECTS", "Projects coming soon\u2026"]) {
        for (const wrapped of wrapLines(t, maxW, normal)) {
          addText(ctx.glyph, normal, wrapped, x, line + m.bodyBase, p.green);
          line += m.bodyLine;
          wrappedCount++;
        }
      }
    } else {
      this.drawPrompt(ctx, x, line, "contact.exe", p.gray);
      ctx.flushGlyphs();
      line += m.bodyLine + m.blank;
      const normal = bodyText();
      this.setAtlas(ctx, normal);
      const maxW = win.w - BORDER * 2 - m.bodyPad * 2;
      for (const wrapped of wrapLines("Get in touch\u2026", maxW, normal)) {
        addText(ctx.glyph, normal, wrapped, x, line + m.bodyBase, p.green);
        line += m.bodyLine;
        wrappedCount++;
      }
    }
    ctx.flushGlyphs();
    return m.bodyPad * 2 + m.bodyLine + m.blank + wrappedCount * m.bodyLine;
  }

  private drawScrollbar(
    ctx: DrawContext,
    win: WindowState,
    bodyX: number,
    bodyY: number,
    bodyW: number,
    bodyH: number,
    contentH: number,
  ) {
    const p = ctx.palette;
    const q = ctx.quad;
    const barW = 16;
    const x = bodyX + bodyW - barW;
    const max = Math.max(1, contentH - bodyH);
    const trackTop = bodyY + barW;
    const trackH = Math.max(1, bodyH - barW * 2);

    // Windows 3.1 dither track.
    for (let yy = 0; yy < trackH; yy += 2) {
      for (let xx = 0; xx < barW; xx += 2) {
        const c = (xx / 2 + yy / 2) % 2 === 0 ? p.scrollA : p.scrollB;
        q.add(x + xx, trackTop + yy, Math.min(2, barW - xx), Math.min(2, trackH - yy), c);
      }
    }

    // Arrow buttons.
    for (const dir of ["up", "down"] as const) {
      const by = dir === "up" ? bodyY : bodyY + bodyH - barW;
      q.add(x, by, barW, barW, p.surface);
      q.add(x, by, barW, 1, p.btnLight);
      q.add(x, by, 1, barW, p.btnLight);
      q.add(x, by + barW - 1, barW, 1, p.btnDark);
      q.add(x + barW - 1, by, 1, barW, p.btnDark);
      for (let i = 0; i < 4; i++) {
        const w = (i + 1) * 2;
        const yy = dir === "up" ? by + 6 + i : by + 9 - i;
        q.add(x + 8 - w / 2, yy, w, 1, p.text);
      }
    }

    const thumbH = Math.max(barW, Math.round((trackH * bodyH) / contentH));
    const thumbY = trackTop + Math.round((trackH - thumbH) * (win.scrollY / max));
    q.add(x, thumbY, barW, thumbH, p.surface);
    q.add(x, thumbY, barW, 1, p.btnLight);
    q.add(x, thumbY, 1, thumbH, p.btnLight);
    q.add(x, thumbY + thumbH - 1, barW, 1, p.btnDark);
    q.add(x + barW - 1, thumbY, 1, thumbH, p.btnDark);

    ctx.flushQuads();
    win.scrollInfo = {
      x,
      y: bodyY,
      w: barW,
      h: bodyH,
      trackTop,
      trackH,
      thumbY,
      thumbH,
      max,
    };
  }

  navButtonAt(win: WindowState, px: number, py: number): number {
    const bodyY = win.y + BORDER + this.metrics.titleH;
    if (py < bodyY || py > bodyY + 25) return -1;
    for (let i = 0; i < this.navButtons.length; i++) {
      const b = this.navButtons[i];
      if (px >= win.x + b.x && px <= win.x + b.x + b.w) return i;
    }
    return -1;
  }
}
