import interact from "interactjs";

import {
  applyWarp,
  initWarp,
  jacobianAt,
  slotGeometry,
  warpEnabled,
  whenWarpReady,
} from "./crt-warp";

const MIN_W = 200;
const MIN_H = 80;

let zCounter = 10;
let desktop: HTMLElement | null = null;

const managedWindows = new Set<HTMLElement>();
const openPopups = new Map<string, HTMLElement>();

const TITLE_CLS =
  "flex items-center justify-between border-b border-gray-500 bg-linear-to-r from-blue-600 to-blue-800 px-0.5 py-0.5 text-[11px] font-bold text-white md:text-[10px] dark:border-gray-600 dark:from-blue-800 dark:to-blue-900";

const BTN_CLS =
  "win31-button-outset active:win31-button-inset flex h-3.5 w-4 cursor-pointer items-center justify-center bg-win-surface p-0 text-[8px] font-bold text-win-text hover:bg-win-surface-hover";

const RESIZE_SVG = `<svg viewBox="0 0 12 12" class="h-full w-full"><line x1="10" y1="2" x2="2" y2="10" stroke="#808080" stroke-width="1"/><line x1="10" y1="5" x2="5" y2="10" stroke="#808080" stroke-width="1"/><line x1="10" y1="8" x2="8" y2="10" stroke="#808080" stroke-width="1"/><line x1="11" y1="2" x2="2" y2="11" stroke="#fff" stroke-width="1"/><line x1="11" y1="5" x2="5" y2="11" stroke="#fff" stroke-width="1"/><line x1="11" y1="8" x2="8" y2="11" stroke="#fff" stroke-width="1"/></svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const seedParam =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("seed") : null;
const rng = seedParam !== null ? mulberry32(Number(seedParam)) : Math.random;

function rand(lo: number, hi: number) {
  return lo + rng() * (hi - lo);
}

function slotOf(win: HTMLElement): HTMLElement {
  let el: HTMLElement = win;
  while (el.parentElement && el.parentElement !== desktop) {
    el = el.parentElement as HTMLElement;
  }
  return el;
}

const NAV_Z = 9999;

/**
 * The desktop lives inside `.crt-curve`, which applies a uniform perspective
 * zoom (~1.043x). interact.js reports deltas in screen pixels, but left/top/
 * width/height are in the un-zoomed local space, so they have to be divided by
 * this factor or windows drift away from the cursor while dragging.
 */
function localScale(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
}

function bringToFront(el: HTMLElement) {
  if (el.dataset.slot === "nav") {
    el.style.zIndex = String(NAV_Z);
    return;
  }
  el.style.zIndex = String(++zCounter);
}

function applyAbsolute(el: HTMLElement, x: number, y: number, w: number, h: number) {
  Object.assign(el.style, {
    position: "absolute",
    left: `${Math.round(x)}px`,
    top: `${Math.round(y)}px`,
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
    flex: "none",
    minHeight: "0",
    margin: "0",
    zIndex: String(++zCounter),
  });
}

// ---------------------------------------------------------------------------
// Position windows with randomized zones (desktop only)
// ---------------------------------------------------------------------------

function positionSlots() {
  if (!desktop) return;
  if (window.innerWidth < 768) return;

  const dw = desktop.offsetWidth;
  const dh = desktop.offsetHeight;

  const helloSlot = desktop.querySelector<HTMLElement>('[data-slot="hello"]');
  const tessSlot = desktop.querySelector<HTMLElement>('[data-slot="tesseract"]');
  const navSlot = desktop.querySelector<HTMLElement>('[data-slot="nav"]');
  if (!helloSlot || !tessSlot || !navSlot) return;

  desktop.style.position = "relative";

  const navH = navSlot.offsetHeight;
  const navW = Math.min(dw * 0.45, 520);
  const navX = (dw - navW) / 2;
  const navY = dh - navH - dh * 0.03;
  applyAbsolute(navSlot, navX, navY, navW, navH);
  navSlot.style.zIndex = String(NAV_Z);

  // Hello (terminal): top-left zone
  const hW = rand(dw * 0.42, dw * 0.56);
  const hH = rand(dh * 0.3, dh * 0.5);
  const hX = rand(0, dw * 0.04);
  const hY = rand(0, dh * 0.04);
  applyAbsolute(helloSlot, hX, hY, hW, hH);

  // Tesseract: top-right zone
  const tW = rand(dw * 0.32, dw * 0.46);
  const tH = rand(dh * 0.55, dh * 0.88);
  const tX = rand(dw - tW - dw * 0.04, dw - tW);
  const tY = rand(0, dh * 0.05);
  applyAbsolute(tessSlot, tX, tY, tW, tH);
}

// ---------------------------------------------------------------------------
// Register a window for drag/resize/close via interact.js
// ---------------------------------------------------------------------------

function registerWindow(win: HTMLElement) {
  if (managedWindows.has(win)) return;
  managedWindows.add(win);

  const slot = slotOf(win);
  // Apply immediately when the map is already decoded (popups), and again once
  // it is ready on first load.
  applyWarp(slot);
  whenWarpReady(() => applyWarp(slot));

  const closeBtn = win.querySelector<HTMLElement>("[data-window-close]");
  closeBtn?.addEventListener("click", () => {
    slot.style.display = "none";
  });

  win.addEventListener("pointerdown", () => bringToFront(slot), true);

  interact(slot)
    .draggable({
      allowFrom: "[data-window-titlebar]",
      ignoreFrom: "button",
      inertia: false,
      listeners: {
        move(event: Interact.DragEvent) {
          const g = slotGeometry(slot);
          const k = g?.k ?? localScale(slot);

          // The window's painted position is `layout + field(layout)`. The
          // field changes as the window moves, so a layout delta of d moves
          // the painted window by J*d (screen). Invert J to make the window
          // track the cursor 1:1 while it follows the glass.
          let lx = event.dx / k;
          let ly = event.dy / k;

          if (g && warpEnabled()) {
            const [jxx, jxy, jyx, jyy] = jacobianAt(g.cx, g.cy);
            const det = jxx * jyy - jxy * jyx || 1;
            lx = (jyy * (event.dx / k) - jxy * (event.dy / k)) / det;
            ly = (-jyx * (event.dx / k) + jxx * (event.dy / k)) / det;
          }

          slot.style.left = (parseFloat(slot.style.left) || 0) + lx + "px";
          slot.style.top = (parseFloat(slot.style.top) || 0) + ly + "px";
          applyWarp(slot);
          bringToFront(slot);
        },
        end() {
          applyWarp(slot);
        },
      },
    })
    .resizable({
      edges: {
        bottom: "[data-window-resize]",
        right: "[data-window-resize]",
      },
      modifiers: [
        interact.modifiers.restrictSize({
          min: { width: MIN_W, height: MIN_H },
        }),
      ],
      inertia: false,
      listeners: {
        move(event: Interact.ResizeEvent) {
          // The painted box is scaled non-uniformly by the glass Jacobian, so
          // width and height need their own screen->local factor. The
          // transform is frozen until `end`, which keeps both factors stable
          // for the duration of the gesture.
          const rect = slot.getBoundingClientRect();
          const sx = rect.width > 0 && slot.offsetWidth > 0 ? rect.width / slot.offsetWidth : 1;
          const sy = rect.height > 0 && slot.offsetHeight > 0 ? rect.height / slot.offsetHeight : 1;
          slot.style.width = event.rect.width / sx + "px";
          slot.style.height = event.rect.height / sy + "px";
          bringToFront(slot);
        },
        end() {
          applyWarp(slot);
        },
      },
    });
}

// ---------------------------------------------------------------------------
// Popup windows from <template>
// ---------------------------------------------------------------------------

function createPopupEl(id: string, title: string, content: DocumentFragment): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-window", "");
  el.setAttribute("data-window-id", id);
  el.className = "flex flex-col border-2 border-win-surface bg-win-surface win31-outset";

  const titleBar = document.createElement("div");
  titleBar.setAttribute("data-window-titlebar", "");
  titleBar.className = TITLE_CLS;

  const titleText = document.createElement("div");
  titleText.className = "grow px-1.5 py-0.5";
  titleText.setAttribute("data-window-title", "");
  titleText.textContent = title;

  const btnGroup = document.createElement("div");
  btnGroup.className = "flex gap-0.5";

  for (const { label, text, attr } of [
    { label: "Minimize", text: "_", attr: null },
    { label: "Maximize", text: "\u25A1", attr: null },
    { label: "Close", text: "\u00D7", attr: "data-window-close" },
  ] as const) {
    const btn = document.createElement("button");
    btn.className = BTN_CLS;
    btn.setAttribute("aria-label", label);
    btn.textContent = text;
    if (attr) btn.setAttribute(attr, "");
    btnGroup.appendChild(btn);
  }

  titleBar.append(titleText, btnGroup);

  const body = document.createElement("div");
  body.className = "relative grow overflow-hidden";
  body.appendChild(content);

  const resizeHandle = document.createElement("div");
  resizeHandle.setAttribute("data-window-resize", "");
  resizeHandle.setAttribute("aria-hidden", "true");
  resizeHandle.className = "absolute right-0 bottom-0 z-10 h-3 w-3 cursor-se-resize";
  resizeHandle.innerHTML = RESIZE_SVG;
  body.appendChild(resizeHandle);

  el.append(titleBar, body);
  return el;
}

function openPopup(id: string) {
  if (!desktop) return;

  const existing = openPopups.get(id);
  if (existing && existing.style.display !== "none") {
    bringToFront(existing);
    return;
  }

  if (existing) {
    existing.style.display = "";
    bringToFront(existing);
    return;
  }

  const tpl = document.querySelector<HTMLTemplateElement>(`template[data-window-template="${id}"]`);
  if (!tpl) return;

  const title = tpl.dataset.windowTitle || `C:\\${id.toUpperCase()}.EXE`;
  const content = tpl.content.cloneNode(true) as DocumentFragment;
  const win = createPopupEl(id, title, content);

  const dr = desktop.getBoundingClientRect();
  const cascadeIdx = openPopups.size % 5;
  const offset = cascadeIdx * 30 + 40;

  Object.assign(win.style, {
    position: "absolute",
    left: offset + "px",
    top: offset + "px",
    width: Math.min(450, Math.round(dr.width * 0.7)) + "px",
    height: Math.min(350, Math.round(dr.height * 0.55)) + "px",
    zIndex: String(++zCounter),
  });

  desktop.appendChild(win);
  openPopups.set(id, win);
  registerWindow(win);
}

function setupPopupButtons() {
  document.querySelectorAll<HTMLElement>("[data-open-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.openWindow;
      if (id) openPopup(id);
    });
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init() {
  const el = document.querySelector<HTMLElement>("[data-desktop]");
  if (!el) return;
  desktop = el;

  // Wait for fonts + two frames so flex layout and font metrics settle before
  // reading offsetWidth (otherwise the seeded layout uses a transient width).
  const start = () => {
    if (!desktop) return;
    positionSlots();
    initWarp();
    desktop.querySelectorAll<HTMLElement>("[data-window]").forEach(registerWindow);
    startWatching();
  };
  document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(start)));
}

function startWatching() {
  if (!desktop) return;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const w = node.matches("[data-window]")
          ? node
          : node.querySelector<HTMLElement>("[data-window]");
        if (w && !managedWindows.has(w)) registerWindow(w);
      }
    }
  });
  observer.observe(desktop, { childList: true, subtree: true });

  setupPopupButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
