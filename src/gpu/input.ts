import { MIN_H, MIN_W, type WindowState } from "./scene";
import type { CrtRenderer } from "./renderer";

interface Hit {
  win: WindowState;
  part: string;
  navIndex: number;
}

export class InputController {
  private drag: { win: WindowState; ox: number; oy: number } | null = null;
  private resize: { win: WindowState } | null = null;
  private scrollDrag: {
    win: WindowState;
    startY: number;
    startScroll: number;
    max: number;
    travel: number;
  } | null = null;
  private down: { win: WindowState; part: string; navIndex: number; x: number; y: number } | null =
    null;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: CrtRenderer,
  ) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancel);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private hit(e: PointerEvent): { lx: number; ly: number; hit: Hit | null } {
    const [lx, ly] = this.renderer.pointerLocal(e.clientX, e.clientY);
    return { lx, ly, hit: this.renderer.scene.hitTest(lx, ly) };
  }

  private clearHover() {
    for (const w of this.renderer.scene.windows) {
      w.hover = null;
      w.hoverNav = -1;
    }
  }

  private setHover(hit: Hit | null) {
    this.clearHover();
    if (!hit) {
      this.canvas.style.cursor = "default";
      return;
    }
    const { win, part, navIndex } = hit;
    if (part === "close" || part === "max" || part === "min" || part === "resize") {
      win.hover = part;
    }
    if (part === "navbtn") win.hoverNav = navIndex;
    this.canvas.style.cursor =
      part === "resize"
        ? "se-resize"
        : part === "title"
          ? "move"
          : part === "close" || part === "max" || part === "min" || part === "navbtn"
            ? "pointer"
            : "default";
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.renderer.setPointerTarget(e.clientX, e.clientY);
    const { lx, ly, hit } = this.hit(e);
    this.down = null;
    this.drag = null;
    this.resize = null;
    this.scrollDrag = null;
    if (!hit) return;

    this.renderer.scene.bringToFront(hit.win);
    this.canvas.setPointerCapture(e.pointerId);

    if (hit.part === "scrollbar") {
      const info = hit.win.scrollInfo;
      if (info) {
        if (ly >= info.thumbY && ly <= info.thumbY + info.thumbH) {
          this.scrollDrag = {
            win: hit.win,
            startY: ly,
            startScroll: hit.win.scrollY,
            max: info.max,
            travel: Math.max(1, info.trackH - info.thumbH),
          };
        } else if (ly < info.trackTop) {
          hit.win.scrollY = Math.max(0, hit.win.scrollY - 16);
        } else if (ly > info.trackTop + info.trackH) {
          hit.win.scrollY = Math.min(hit.win.maxScroll, hit.win.scrollY + 16);
        } else {
          const dir = ly < info.thumbY ? -1 : 1;
          hit.win.scrollY = Math.max(
            0,
            Math.min(hit.win.maxScroll, hit.win.scrollY + dir * Math.max(16, info.h * 0.8)),
          );
        }
        e.preventDefault();
      }
      return;
    }

    if (hit.part === "title") {
      this.drag = { win: hit.win, ox: lx - hit.win.x, oy: ly - hit.win.y };
    } else if (hit.part === "resize") {
      this.resize = { win: hit.win };
    } else if (
      hit.part === "close" ||
      hit.part === "min" ||
      hit.part === "max" ||
      hit.part === "navbtn"
    ) {
      this.down = {
        win: hit.win,
        part: hit.part,
        navIndex: hit.navIndex,
        x: e.clientX,
        y: e.clientY,
      };
    }
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    this.renderer.setPointerTarget(e.clientX, e.clientY);
    const { lx, ly, hit } = this.hit(e);

    if (this.drag) {
      this.drag.win.x = lx - this.drag.ox;
      this.drag.win.y = ly - this.drag.oy;
      return;
    }
    if (this.resize) {
      this.resize.win.w = Math.max(MIN_W, lx - this.resize.win.x);
      this.resize.win.h = Math.max(MIN_H, ly - this.resize.win.y);
      return;
    }
    if (this.scrollDrag) {
      const s = this.scrollDrag;
      const dy = ly - s.startY;
      s.win.scrollY = Math.max(0, Math.min(s.max, s.startScroll + (dy * s.max) / s.travel));
      return;
    }
    this.setHover(hit);
  };

  private onUp = (e: PointerEvent) => {
    const wasDrag = !!this.drag;
    const wasResize = !!this.resize;
    const wasScroll = !!this.scrollDrag;
    this.drag = null;
    this.resize = null;
    this.scrollDrag = null;

    if (this.down) {
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4;
      const down = this.down;
      this.down = null;
      if (!moved) this.activate(down);
    }
    if (!wasDrag && !wasResize && !wasScroll) this.setHover(null);

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.setHover(this.hit(e).hit);
  };

  private activate(down: { win: WindowState; part: string; navIndex: number }) {
    if (down.part === "close") {
      this.renderer.scene.close(down.win);
      return;
    }
    if (down.part === "navbtn") {
      const button = this.renderer.scene.navButtons[down.navIndex];
      if (!button) return;
      if (button.action === "home") {
        window.location.href = "/";
      } else {
        this.renderer.scene.openPopup(button.action);
      }
    }
  }

  private onWheel = (e: WheelEvent) => {
    const [lx, ly] = this.renderer.pointerLocal(e.clientX, e.clientY);
    const hit = this.renderer.scene.hitTest(lx, ly);
    if (hit && this.renderer.scene.scrollable(hit.win) && hit.win.maxScroll > 0) {
      hit.win.scrollY = Math.max(0, Math.min(hit.win.maxScroll, hit.win.scrollY + e.deltaY));
      e.preventDefault();
    }
  };

  private onCancel = () => {
    this.drag = null;
    this.resize = null;
    this.scrollDrag = null;
    this.down = null;
  };

  private onLeave = () => {
    if (!this.drag && !this.resize && !this.scrollDrag) this.clearHover();
  };
}
