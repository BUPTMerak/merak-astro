import { loadMap } from "./field";
import { getAtlas } from "./font";
import { InputController } from "./input";
import { CrtRenderer } from "./renderer";

export async function mountCrt() {
  const root = document.querySelector<HTMLElement>("[data-crt-gpu]");
  const canvas = root?.querySelector<HTMLCanvasElement>("[data-crt-canvas]");
  if (!root || !canvas) return;
  const mapUrl = root.dataset.map ?? "";

  const params = new URLSearchParams(window.location.search);
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  try {
    const { image, data } = await loadMap(mapUrl);
    await document.fonts.ready;

    const renderer = new CrtRenderer({
      canvas,
      map: data,
      mapImage: image,
      dark,
      flat: params.has("flat"),
      seed: params.has("seed") ? Number(params.get("seed")) : undefined,
    });
    renderer.tessFreeze = params.has("freeze");
    new InputController(canvas, renderer);

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize, { passive: true });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", (e) => renderer.setDark(e.matches));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.addEventListener("change", (e) => {
      // The renderer samples this each frame through the media query; expose a
      // tiny refresh hook so the change takes effect immediately.
      renderer.setReducedMotion?.(e.matches);
    });

    let stop = false;
    const loop = (t: number) => {
      if (stop) return;
      renderer.draw(t / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    root.classList.add("crt-gpu--ready");
    (window as unknown as { __crt?: CrtRenderer }).__crt = renderer;
    (window as unknown as { __atlas?: (s: number, w: number) => string }).__atlas = (
      size,
      weight,
    ) => getAtlas(renderer.gl, size, weight, renderer.dpr).canvas.toDataURL();
    return () => {
      stop = true;
      window.removeEventListener("resize", onResize);
    };
  } catch (err) {
    console.error("[crt-gpu]", err);
    root.classList.add("crt-gpu--failed");
  }
}
