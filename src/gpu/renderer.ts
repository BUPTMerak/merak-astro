import { palette, type Palette } from "./color";
import {
  fieldGeometry,
  flatToPainted,
  paintedToFlat,
  type FieldGeometry,
  type MapData,
} from "./field";
import { getAtlas, MONO_STACK } from "./font";
import {
  createFullscreenTriangle,
  createProgram,
  GlyphBatch,
  QuadBatch,
  RenderTarget,
  setClip,
  setUniforms,
  textureFromSource,
  u,
  type ProgramInfo,
} from "./glutil";
import { PostPass } from "./post";
import { Room } from "./room";
import { createTransform, Scene, type ContentTransform, type DrawContext } from "./scene";
import { Tesseract } from "./tesseract";

const SOLID_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
uniform vec2 u_res;
uniform vec2 u_offset;
uniform float u_scale;
out vec4 v_color;
void main() {
  vec2 p = a_pos * u_scale + u_offset;
  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0);
  v_color = a_color;
}`;

const SOLID_FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() { outColor = vec4(v_color.rgb * v_color.a, v_color.a); }`;

const GLYPH_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
uniform vec2 u_res;
uniform vec2 u_offset;
uniform float u_scale;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 p = a_pos * u_scale + u_offset;
  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}`;

const GLYPH_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_atlas;
uniform vec4 u_shadow;
uniform vec2 u_shadowStep;
uniform float u_shadowRadius;
out vec4 outColor;
void main() {
  float a = texture(u_atlas, v_uv).a;
  float sh = 0.0;
  if (u_shadowRadius > 0.0 && u_shadow.a > 0.0) {
    // 5x5 Gaussian approximation of the CSS text-shadow blur (sigma = blur/2).
    float wsum = 0.0;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        float w = exp(-float(dx * dx + dy * dy) * 0.5);
        sh += texture(u_atlas, v_uv + vec2(float(dx), float(dy)) * u_shadowStep).a * w;
        wsum += w;
      }
    }
    sh /= wsum;
  }
  vec4 text = vec4(v_color.rgb * v_color.a * a, v_color.a * a);
  vec4 glow = vec4(u_shadow.rgb * u_shadow.a * sh, u_shadow.a * sh);
  outColor = text + glow * (1.0 - text.a);
}`;

const FULLSCREEN_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Shared by the flat-CRT passes. `boxPos()` is the fragment position in CSS px
 * relative to the padding box of the original `.crt` element (the viewport
 * minus its 1px border), which is what its backgrounds, shadows and overlay
 * children are laid out against.
 */
const FLAT_COMMON = `
precision highp float;
out vec4 outColor;
uniform vec2 u_target;
uniform float u_dpr;
uniform vec2 u_box;

const float BORDER = 1.0;

vec2 boxPos() {
  return vec2(gl_FragCoord.x, u_target.y - gl_FragCoord.y) / u_dpr - BORDER;
}

float erf1(float x) {
  float s = sign(x);
  float a = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * a);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return s * y;
}

// Coverage of "box-shadow: inset 0 0 <2*sigma> <spread>" at p.
float insetShadow(vec2 p, float spread, float sigma) {
  float k = 0.70710678 / sigma;
  vec2 lo = vec2(spread);
  vec2 hi = u_box - spread;
  float gx = 0.5 * (erf1((p.x - lo.x) * k) - erf1((p.x - hi.x) * k));
  float gy = 0.5 * (erf1((p.y - lo.y) * k) - erf1((p.y - hi.y) * k));
  return 1.0 - gx * gy;
}

vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}
`;

/** `.crt` itself: translucent base colour, radial glass tint, inset shadow, border. */
const BACKDROP_FS = `#version 300 es
${FLAT_COMMON}
uniform vec4 u_base;
uniform vec4 u_inner;
uniform vec4 u_outer;
uniform float u_shadow;

void main() {
  vec2 p = boxPos();
  if (p.x < 0.0 || p.y < 0.0 || p.x > u_box.x || p.y > u_box.y) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // radial-gradient(120% 140% at 50% 50%, inner, outer 85%), premultiplied.
  vec2 q = (p - u_box * 0.5) / (u_box * vec2(1.2, 1.4));
  float t = clamp(length(q) / 0.85, 0.0, 1.0);
  vec4 tint = mix(vec4(u_inner.rgb * u_inner.a, u_inner.a), vec4(u_outer.rgb * u_outer.a, u_outer.a), t);
  // Browsers dither gradients; without it the shallow ramp bands visibly.
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  tint.rgb += (noise - 0.5) / 255.0;

  vec4 col = over(tint, vec4(u_base.rgb * u_base.a, u_base.a));

  // box-shadow: inset 0 0 40px rgba(0, 0, 0, u_shadow)
  col = over(vec4(0.0, 0.0, 0.0, u_shadow * insetShadow(p, 0.0, 20.0)), col);
  outColor = col;
}`;

/** `.crt-content` + `.crt-curve`: the window layer, scaled up and colour graded. */
const WINDOWS_FS = `#version 300 es
${FLAT_COMMON}
uniform sampler2D u_windows;
uniform vec2 u_content;
uniform vec3 u_transform;
uniform vec3 u_grade;

void main() {
  vec2 local = (boxPos() + BORDER - u_transform.yz) / u_transform.x;
  if (local.x < 0.0 || local.y < 0.0 || local.x > u_content.x || local.y > u_content.y) discard;
  vec4 w = texture(u_windows, vec2(local.x / u_content.x, 1.0 - local.y / u_content.y));
  if (w.a <= 0.0) discard;

  // filter: contrast() brightness() saturate()
  vec3 c = w.rgb / w.a;
  c = clamp((c - 0.5) * u_grade.x + 0.5, 0.0, 1.0);
  c = clamp(c * u_grade.y, 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, u_grade.z), 0.0, 1.0);
  outColor = vec4(c * w.a, w.a);
}`;

/** Everything stacked above the windows: sweep band, vignette, glass highlight, scanlines. */
const OVERLAY_FS = `#version 300 es
${FLAT_COMMON}
uniform float u_band;
uniform float u_vignette;
uniform float u_curvature;
uniform vec2 u_scan;

// Dark length of the scanline pattern in [0, y): each 3px tile is dark from
// u_scan.y to its end.
float scanDark(float y) {
  float k = floor(y / 3.0);
  return k * (3.0 - u_scan.y) + max(0.0, y - 3.0 * k - u_scan.y);
}

void main() {
  vec2 p = boxPos();
  if (p.x < 0.0 || p.y < 0.0 || p.x > u_box.x || p.y > u_box.y) discard;
  vec4 acc = vec4(0.0);

  // .crt::before: a full-height gradient (transparent at its bottom, white
  // 0.18 at 10%, black 0.15 at its top) at 8% opacity that slides down from
  // above the screen. u_band is its offset in box heights (-1 = hidden).
  if (u_band > -1.0) {
    float v = 1.0 - (p.y / u_box.y - u_band);
    if (v >= 0.0 && v <= 1.0) {
      vec4 band = v < 0.1
        ? vec4(0.18) * (v / 0.1)
        : mix(vec4(0.18), vec4(0.0, 0.0, 0.0, 0.15), (v - 0.1) / 0.9);
      acc = over(band * 0.08, acc);
    }
  }

  // .crt-vignette: box-shadow: inset 0 0 120px 40px rgba(0, 0, 0, u_vignette)
  if (u_vignette > 0.0) {
    acc = over(vec4(0.0, 0.0, 0.0, u_vignette * insetShadow(p, 40.0, 60.0)), acc);
  }

  // .crt-curvature, mix-blend-mode: screen. Its black rim gradient is fully
  // transparent on screen, and screening with white equals compositing white.
  if (u_curvature > 0.5) {
    float r = length((p - u_box * vec2(0.5, 0.45)) / (u_box * vec2(1.25, 1.6)));
    float a = r < 0.35 ? mix(0.06, 0.02, r / 0.35) : 0.02 * clamp(1.0 - (r - 0.35) / 0.2, 0.0, 1.0);
    acc = over(vec4(a), acc);
  }

  // .crt::after: 3px scanline tile at 60% opacity, scrolled by u_scan.x.
  if (u_scan.y < 3.0) {
    float half_ = 0.5 / u_dpr;
    float y = p.y - u_scan.x + 3.0;
    float cover = (scanDark(y + half_) - scanDark(y - half_)) / (2.0 * half_);
    acc = over(vec4(0.0, 0.0, 0.0, 0.35 * 0.6 * cover), acc);
  }

  outColor = acc;
}`;

/** Border + padding of the original `.crt` box around the desktop. */
const INSET = 17;

const IDENTITY: ContentTransform = { scale: 1, offsetX: 0, offsetY: 0 };

export interface CrtRendererOptions {
  canvas: HTMLCanvasElement;
  map: MapData;
  mapImage: HTMLImageElement;
  dark: boolean;
  flat?: boolean;
  seed?: number;
}

export class CrtRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  palette: Palette;
  contentW = 1;
  contentH = 1;
  isMobile = false;
  private layoutKey = "";
  /** Placement of the window layer on the flat (un-warped) screen. */
  transform: ContentTransform = IDENTITY;

  scene!: Scene;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  /** True above 1200px: glass displacement, window zoom and highlight are on. */
  warp = true;
  /** Individual layers can be switched off for inspection. */
  layers = {
    backdrop: true,
    room: true,
    windows: true,
    band: true,
    vignette: true,
    curvature: true,
    scanlines: true,
    displace: true,
  };
  tessFreeze = false;
  private tessTick = 0;
  private tessCached = "";
  private tessCacheSize = "";
  dark: boolean;

  private windowTarget!: RenderTarget;
  private flatTarget!: RenderTarget;
  private post: PostPass;
  private room: Room;
  private tesseract: Tesseract;
  private quad = new QuadBatch();
  private glyph = new GlyphBatch();
  private solid: ProgramInfo;
  private glyphProg: ProgramInfo;
  private backdropProg: ProgramInfo;
  private windowsProg: ProgramInfo;
  private overlayProg: ProgramInfo;
  private fullscreen: WebGLVertexArrayObject;
  private mapTexture: WebGLTexture;
  private map: MapData;
  private field: FieldGeometry;
  private reducedMotion = false;
  private clock = 0;
  private lastTime = 0;

  constructor(opts: CrtRendererOptions) {
    this.canvas = opts.canvas;
    this.map = opts.map;
    this.field = fieldGeometry(1, 1, opts.map.width, opts.map.height);
    this.dark = opts.dark;
    this.palette = palette(opts.dark);
    const gl = opts.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.solid = createProgram(gl, SOLID_VS, SOLID_FS);
    this.glyphProg = createProgram(gl, GLYPH_VS, GLYPH_FS);
    this.backdropProg = createProgram(gl, FULLSCREEN_VS, BACKDROP_FS);
    this.windowsProg = createProgram(gl, FULLSCREEN_VS, WINDOWS_FS);
    this.overlayProg = createProgram(gl, FULLSCREEN_VS, OVERLAY_FS);
    this.fullscreen = createFullscreenTriangle(gl).vao as WebGLVertexArrayObject;

    // The map is data, not colour: exact texels, no filtering or conversion.
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.mapTexture = textureFromSource(gl, opts.mapImage, { premultiply: false, nearest: true });
    this.post = new PostPass(gl);
    this.room = new Room(gl, this.palette);
    this.tesseract = new Tesseract();

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isMobile = window.innerWidth < 768;
    this.resize();
    this.scene = new Scene(this.palette, this.contentW, this.contentH, {
      flat: opts.flat,
      seed: opts.seed,
      mobile: this.isMobile,
      zoom: this.transform.scale,
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cssW === this.cssW && cssH === this.cssH && dpr === this.dpr) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.contentW = Math.max(1, cssW - INSET * 2);
    this.contentH = Math.max(1, cssH - INSET * 2);
    const winW = Math.max(1, Math.round(this.contentW * dpr));
    const winH = Math.max(1, Math.round(this.contentH * dpr));
    if (!this.flatTarget) {
      this.flatTarget = new RenderTarget(this.gl, this.canvas.width, this.canvas.height);
      this.windowTarget = new RenderTarget(this.gl, winW, winH);
    } else {
      this.flatTarget.resize(this.canvas.width, this.canvas.height);
      this.windowTarget.resize(winW, winH);
    }
    this.warp = window.innerWidth > 1200;
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 768;
    this.room.resize(window.innerWidth, window.innerHeight, cssW - 2, cssH - 2, dpr);
    this.transform = createTransform(cssW, cssH, INSET, this.warp);
    this.field = fieldGeometry(cssW, cssH, this.map.width, this.map.height);
    const key = window.innerWidth < 640 ? "phone" : window.innerWidth < 768 ? "tablet" : "desktop";
    if (this.scene && (key !== this.layoutKey || wasMobile !== this.isMobile)) {
      this.scene.layout(this.contentW, this.contentH, {
        mobile: this.isMobile,
        zoom: this.transform.scale,
      });
    }
    this.layoutKey = key;
  }

  setDark(dark: boolean) {
    this.dark = dark;
    const p = palette(dark);
    this.palette = p;
    this.room.setPalette(p);
    if (this.scene) this.scene.palette = p;
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
  }

  setPointerTarget(clientX: number, clientY: number) {
    this.room.targetY = (clientX / window.innerWidth) * 5;
    this.room.targetX = (clientY / window.innerHeight) * 5;
  }

  private get displacing() {
    return this.warp && this.layers.displace;
  }

  /** Window-layer point -> where it is painted (CSS px, canvas-relative). */
  localToScreen(lx: number, ly: number): [number, number] {
    const fx = this.transform.offsetX + lx * this.transform.scale;
    const fy = this.transform.offsetY + ly * this.transform.scale;
    if (!this.displacing) return [fx, fy];
    return flatToPainted(this.map, this.field, this.dpr, fx, fy);
  }

  /**
   * Pointer position -> window-layer point. Runs the pointer through the same
   * displacement the final shader applies to the pixel under it, so hit tests
   * and drags act on exactly what is painted there.
   */
  pointerLocal(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    let fx = clientX - rect.left;
    let fy = clientY - rect.top;
    if (this.displacing) {
      [fx, fy] = paintedToFlat(this.map, this.field, this.dpr, fx, fy);
    }
    return [
      (fx - this.transform.offsetX) / this.transform.scale,
      (fy - this.transform.offsetY) / this.transform.scale,
    ];
  }

  private makeContext(blink: boolean): DrawContext {
    const w = this.contentW;
    const h = this.contentH;
    return {
      palette: this.palette,
      quad: this.quad,
      glyph: this.glyph,
      atlas: (size, weight, mono) =>
        getAtlas(this.gl, size, weight, this.dpr, mono ? MONO_STACK : "Unifont, monospace"),
      // The window layer is rasterised unscaled, like the browser's own
      // layer; the zoom happens when it is composited onto the flat screen.
      transform: IDENTITY,
      cssW: w,
      cssH: h,
      dpr: this.dpr,
      setClip: (rect) => setClip(this.gl, w, h, this.dpr, rect),
      flushQuads: () => {
        this.gl.useProgram(this.solid.program);
        setUniforms(this.gl, this.solid, { u_scale: 1, u_offset: [0, 0] });
        this.quad.flush(this.gl, this.solid, w, h);
      },
      flushGlyphs: () => {
        this.gl.useProgram(this.glyphProg.program);
        const a = this.glyph.atlas;
        setUniforms(this.gl, this.glyphProg, {
          u_scale: 1,
          u_offset: [0, 0],
          u_shadow: [
            this.palette.shadow[0],
            this.palette.shadow[1],
            this.palette.shadow[2],
            this.palette.shadow[3],
          ],
          u_shadowStep: a
            ? [
                (this.palette.shadowBlur * 0.5 * a.pixelScale) / a.canvas.width,
                (this.palette.shadowBlur * 0.5 * a.pixelScale) / a.canvas.height,
              ]
            : [0, 0],
          u_shadowRadius: this.palette.shadowBlur * (a ? a.pixelScale : this.dpr),
        });
        this.glyph.flush(this.gl, this.glyphProg, w, h);
      },
      tesseractText: (bw, bh, fontSize) => {
        const key = `${bw}|${bh}|${fontSize}`;
        // The ASCII pass is CPU heavy (getImageData + per-cell char match).
        // Recompute every other frame; the animation is 0.5x speed anyway.
        if (this.tessCached === "" || key !== this.tessCacheSize || this.tessTick++ % 2 === 0) {
          this.tessCached = this.tesseract.render(bw, bh, fontSize);
          this.tessCacheSize = key;
        }
        return this.tessCached;
      },
      metrics: this.scene.metrics,
      time: this.clock,
      blink,
    };
  }

  private fullscreenPass(program: ProgramInfo, uniforms: Parameters<typeof setUniforms>[2]) {
    const gl = this.gl;
    gl.useProgram(program.program);
    setUniforms(gl, program, {
      u_target: [this.canvas.width, this.canvas.height],
      u_dpr: this.dpr,
      u_box: [this.cssW - 2, this.cssH - 2],
      ...uniforms,
    });
    gl.bindVertexArray(this.fullscreen);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  draw(now: number) {
    const dt = this.lastTime ? Math.min(0.1, now - this.lastTime) : 1 / 60;
    this.lastTime = now;
    this.clock = now;
    this.room.update(dt);
    if (!this.tessFreeze) this.tesseract.update(dt, this.reducedMotion);

    const gl = this.gl;
    const p = this.palette;
    const on = this.layers;
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);

    if (on.room) this.room.prepare();

    // 1. Window layer, unscaled.
    this.windowTarget.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (on.windows) this.scene.draw(this.makeContext(now % 1 < 0.5));
    gl.disable(gl.SCISSOR_TEST);

    // 2. The flat CRT: everything the original `.crt` element paints, in its
    //    stacking order, before the glass filter.
    this.flatTarget.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (on.backdrop) {
      this.fullscreenPass(this.backdropProg, {
        u_base: [p.glass[0], p.glass[1], p.glass[2], p.glass[3]],
        u_inner: [p.crtIn[0], p.crtIn[1], p.crtIn[2], p.crtIn[3]],
        u_outer: [p.crtOut[0], p.crtOut[1], p.crtOut[2], p.crtOut[3]],
        u_shadow: p.vignette,
      });
    }

    if (on.room) {
      // The room is laid out in the padding box, one border width in.
      gl.viewport(
        Math.round(this.dpr),
        Math.round(this.dpr),
        this.canvas.width - 2 * Math.round(this.dpr),
        this.canvas.height - 2 * Math.round(this.dpr),
      );
      this.room.draw(0.8);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    if (on.windows) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.windowTarget.texture);
      const tex = u(gl, this.windowsProg, "u_windows");
      gl.useProgram(this.windowsProg.program);
      if (tex) gl.uniform1i(tex, 0);
      this.fullscreenPass(this.windowsProg, {
        u_content: [this.contentW, this.contentH],
        u_transform: [this.transform.scale, this.transform.offsetX, this.transform.offsetY],
        u_grade: [p.grade.contrast, p.grade.brightness, p.grade.saturate],
      });
    }

    // Sweep band: hidden for 85% of its 8s cycle, then slides down one screen.
    const cycle = (now / 8) % 1;
    const band = cycle > 0.85 ? (cycle - 0.85) / 0.15 - 1 : -1;
    // Scanlines scroll one 3px tile per second in 60 steps. A tile is painted
    // at device resolution with its lower half dark, sampled at pixel centres.
    const scanShift = (Math.floor((now % 1) * 60) / 60) * 3;
    const scanStart = Math.ceil(1.53 * this.dpr - 0.5) / this.dpr;
    this.fullscreenPass(this.overlayProg, {
      u_band: on.band ? band : -1,
      u_vignette: on.vignette ? p.vignette : 0,
      u_curvature: on.curvature && this.warp ? 1 : 0,
      u_scan: [scanShift, on.scanlines ? scanStart : 3],
    });

    // 3. Glass displacement onto the page.
    this.post.draw({
      flat: this.flatTarget.texture,
      map: this.mapTexture,
      mapSize: [this.map.width, this.map.height],
      width: this.canvas.width,
      height: this.canvas.height,
      dpr: this.dpr,
      field: [this.field.ox, this.field.oy, this.field.scale],
      warp: this.displacing,
      page: [p.page[0], p.page[1], p.page[2]],
    });
  }
}
