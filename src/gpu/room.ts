import type { Palette } from "./color";
import {
  createFullscreenTriangle,
  createProgram,
  RenderTarget,
  setUniforms,
  u,
  type ProgramInfo,
} from "./glutil";

/**
 * The wireframe room of the original page: five 80vw x 80vh CSS planes pushed
 * back 50px, folded into a box and viewed through a 900px perspective, tilted
 * up to 5deg by the pointer.
 *
 * The browser paints one plane as a flat bitmap (grid, inset shadow, stronger
 * lines) and lets the compositor project it with bilinear filtering. That
 * resampling is what gives the grid its uneven, slightly soft line weights, so
 * the same two steps are kept here: `PATTERN_FS` paints the plane once into a
 * texture, and every wall is that texture drawn as a projected quad.
 */

const PERSPECTIVE = 900;
const DEPTH = -50;
/** Keep geometry strictly in front of the eye; the side walls run past it. */
const NEAR = 1;
/** CSS px each plane's quad overhangs its edges, to carry the antialiasing ramp. */
const EDGE_MARGIN = 2;

const PATTERN_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const PATTERN_FS = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 u_target;
uniform float u_scale;
uniform vec2 u_size;
uniform vec3 u_line;
uniform vec3 u_strong;

float erf1(float x) {
  float s = sign(x);
  float a = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * a);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return s * y;
}

float span(float x, float lo, float hi, float sigma) {
  float k = 0.70710678 / sigma;
  return 0.5 * (erf1((x - lo) * k) - erf1((x - hi) * k));
}

void main() {
  // Plane-local CSS px, origin top-left.
  vec2 p = vec2(gl_FragCoord.x, u_target.y - gl_FragCoord.y) / u_scale;
  // 0deg gradients start at the bottom edge, 90deg ones at the left edge.
  vec2 q = vec2(p.x, u_size.y - p.y);

  // repeating-linear-gradient(line 0 1px, transparent 1px 24px), both axes.
  vec2 cell = mod(q, 24.0);
  float grid = (cell.x < 1.0 || cell.y < 1.0) ? 1.0 : 0.0;
  vec4 col = vec4(u_line * grid, grid);

  // box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.35)
  float shade = 0.35 * (1.0 - span(p.x, 0.0, u_size.x, 30.0) * span(p.y, 0.0, u_size.y, 30.0));
  col = vec4(col.rgb * (1.0 - shade), shade + col.a * (1.0 - shade));

  // ::after: 1px line after every 120px, at 60% opacity.
  vec2 major = mod(q, 121.0);
  float strong = (major.x >= 120.0 || major.y >= 120.0) ? 0.6 : 0.0;
  col = vec4(u_strong * strong, strong) + col * (1.0 - strong);

  outColor = col;
}`;

const PLANE_VS = `#version 300 es
layout(location = 0) in vec3 a_clip;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_clip.xy, 0.0, a_clip.z);
}`;

const PLANE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_pattern;
uniform float u_opacity;
uniform vec2 u_snap;

vec4 pattern(vec2 uv) {
  return texture(u_pattern, clamp(uv, 0.0, 1.0));
}

void main() {
  // Edge antialiasing as the compositor does it for transformed quads:
  // coverage ramps over one pixel centred on the plane's edge.
  vec2 inside = min(v_uv, 1.0 - v_uv);
  vec2 perPixel = vec2(
    length(vec2(dFdx(v_uv.x), dFdy(v_uv.x))),
    length(vec2(dFdx(v_uv.y), dFdy(v_uv.y)))
  );
  vec2 cover = clamp(inside / max(perPixel, vec2(1e-6)) + 0.5, 0.0, 1.0);
  vec4 col;
  if (u_snap == vec2(0.0)) {
    col = pattern(v_uv);
  } else {
    // A wall that faces the viewer squarely is resampled onto a pixel grid
    // that starts at its own (fractional) corner and then shifted into place,
    // which softens its lines a little more than one bilinear pass would.
    // u_snap is that fraction; y is counted downwards.
    vec2 dx = dFdx(v_uv);
    vec2 dy = -dFdy(v_uv);
    vec2 base = v_uv + dx * u_snap.x + dy * u_snap.y;
    col = mix(
      mix(pattern(base), pattern(base - dx), u_snap.x),
      mix(pattern(base - dy), pattern(base - dx - dy), u_snap.x),
      u_snap.y
    );
  }
  outColor = col * (u_opacity * cover.x * cover.y);
}`;

interface Vertex {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
}

function vert(x: number, y: number, z: number, uu: number, vv: number): Vertex {
  return { x, y, z, u: uu, v: vv };
}

function rotateX(p: Vertex, deg: number): Vertex {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { ...p, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function rotateY(p: Vertex, deg: number): Vertex {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { ...p, x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
}

type Vec3 = [number, number, number];

/**
 * The five planes in scene space (x right, y down, z towards the viewer),
 * with (u, v) the plane-local CSS position in units of the plane size. Each
 * quad overhangs its plane by EDGE_MARGIN so the shader can antialias the edge.
 */
function buildPlanes(planeW: number, planeH: number): Vertex[][] {
  const w = planeW / 2;
  const h = planeH / 2;
  const back = DEPTH;

  // [corner at (u, v) = (0, 0), the plane's width vector, its height vector]
  const frames: [Vec3, Vec3, Vec3][] = [
    // Back wall.
    [[-w, -h, back], [planeW, 0, 0], [0, planeH, 0]],
    // Floor: hinged on its bottom edge, so its top edge is nearest the viewer.
    [[-w, h, back + planeH], [planeW, 0, 0], [0, 0, -planeH]],
    // Ceiling: hinged on its top edge.
    [[-w, -h, back], [planeW, 0, 0], [0, 0, planeH]],
    // Left wall: hinged on its left edge.
    [[-w, -h, back], [0, 0, planeW], [0, planeH, 0]],
    // Right wall: hinged on its right edge.
    [[w, -h, back + planeW], [0, 0, -planeW], [0, planeH, 0]],
  ];

  const mu = EDGE_MARGIN / planeW;
  const mv = EDGE_MARGIN / planeH;
  const corners: [number, number][] = [
    [-mu, -mv],
    [1 + mu, -mv],
    [1 + mu, 1 + mv],
    [-mu, 1 + mv],
  ];
  return frames.map(([o, du, dv]) =>
    corners.map(([cu, cv]) =>
      vert(
        o[0] + du[0] * cu + dv[0] * cv,
        o[1] + du[1] * cu + dv[1] * cv,
        o[2] + du[2] * cu + dv[2] * cv,
        cu,
        cv,
      ),
    ),
  );
}

/** Homogeneous clip-space vertex: x, y in [-w, w] are on screen. */
interface ClipVertex {
  x: number;
  y: number;
  w: number;
  u: number;
  v: number;
}

const CLIP_PLANES: ((p: ClipVertex) => number)[] = [
  (p) => p.w - NEAR,
  (p) => p.w + p.x,
  (p) => p.w - p.x,
  (p) => p.w + p.y,
  (p) => p.w - p.y,
];

/**
 * Clip a convex polygon to the view frustum. The side walls run past the eye,
 * so their unclipped triangles span a huge range of w; leaving that to the
 * rasteriser costs enough interpolation precision to visibly stretch the grid.
 */
function clipToFrustum(poly: ClipVertex[]): ClipVertex[] {
  for (const dist of CLIP_PLANES) {
    const out: ClipVertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = dist(a);
      const db = dist(b);
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          w: a.w + (b.w - a.w) * t,
          u: a.u + (b.u - a.u) * t,
          v: a.v + (b.v - a.v) * t,
        });
      }
    }
    poly = out;
    if (poly.length < 3) return [];
  }
  return poly;
}

export class Room {
  private patternProgram: ProgramInfo;
  private planeProgram: ProgramInfo;
  private fullscreen: WebGLVertexArrayObject;
  private vao: WebGLVertexArrayObject;
  private buffer: WebGLBuffer;
  private pattern: RenderTarget;
  private patternKey = "";
  private planes: Vertex[][] = [];
  private cssW = 1;
  private cssH = 1;
  private planeW = 1;
  private planeH = 1;
  private dpr = 1;
  rotX = 0;
  rotY = 0;
  targetX = 0;
  targetY = 0;

  constructor(
    private gl: WebGL2RenderingContext,
    private palette: Palette,
  ) {
    this.patternProgram = createProgram(gl, PATTERN_VS, PATTERN_FS);
    this.planeProgram = createProgram(gl, PLANE_VS, PLANE_FS);
    this.fullscreen = createFullscreenTriangle(gl).vao as WebGLVertexArrayObject;
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.buffer = gl.createBuffer() as WebGLBuffer;
    this.pattern = new RenderTarget(gl, 1, 1);
    this.resize(1440, 900, 1440, 900, 1);
  }

  /**
   * @param viewportW,viewportH window viewport (the planes are 80vw x 80vh)
   * @param boxW,boxH the box the room is projected into, in CSS px
   */
  resize(viewportW: number, viewportH: number, boxW: number, boxH: number, dpr: number) {
    this.planeW = Math.max(1, viewportW * 0.8);
    this.planeH = Math.max(1, viewportH * 0.8);
    this.planes = buildPlanes(this.planeW, this.planeH);
    this.cssW = Math.max(1, boxW);
    this.cssH = Math.max(1, boxH);
    this.dpr = dpr;
  }

  setPalette(p: Palette) {
    this.palette = p;
  }

  update(dt: number) {
    // The original eases the tilt with a linear 80ms CSS transition.
    const k = Math.min(1, dt / 0.08);
    this.rotX += (this.targetX - this.rotX) * k;
    this.rotY += (this.targetY - this.rotY) * k;
  }

  /** Repaint the plane bitmap if its size or colours changed. Binds its own framebuffer. */
  prepare() {
    const gl = this.gl;
    const line = this.palette.roomLine;
    const strong = this.palette.roomStrong;
    const key = [this.planeW, this.planeH, this.dpr, ...line, ...strong].join("|");
    if (key === this.patternKey) return;
    this.patternKey = key;

    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    // The original rasterises the plane bitmaps at CSS resolution (the
    // perspective transform then resamples them); painting at 1x and letting
    // the projection filter keeps the same soft 1px grid on hidpi screens.
    const scale = Math.min(1, max / this.planeW, max / this.planeH);
    const w = Math.max(1, Math.round(this.planeW * scale));
    const h = Math.max(1, Math.round(this.planeH * scale));
    this.pattern.resize(w, h);
    this.pattern.bind();
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.patternProgram.program);
    setUniforms(gl, this.patternProgram, {
      u_target: [w, h],
      u_scale: scale,
      u_size: [this.planeW, this.planeH],
      u_line: [line[0], line[1], line[2]],
      u_strong: [strong[0], strong[1], strong[2]],
    });
    gl.bindVertexArray(this.fullscreen);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  /** Draw into the currently bound target (premultiplied "over" blending). */
  draw(opacity: number) {
    const gl = this.gl;
    const verts: number[] = [];
    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;

    let backCount = 0;
    for (const [index, plane] of this.planes.entries()) {
      // transform: rotateX(x) rotateY(y) applies the Y rotation first.
      const poly = clipToFrustum(
        plane.map((p) => {
          const r = rotateX(rotateY(p, this.rotY), this.rotX);
          return {
            x: (r.x * PERSPECTIVE) / halfW,
            y: (-r.y * PERSPECTIVE) / halfH,
            w: PERSPECTIVE - r.z,
            u: r.u,
            v: r.v,
          };
        }),
      );
      for (let i = 1; i + 1 < poly.length; i++) {
        for (const p of [poly[0], poly[i], poly[i + 1]]) {
          verts.push(p.x, p.y, p.w, p.u, 1 - p.v);
        }
      }
      if (index === 0) backCount = verts.length / 5;
    }
    if (verts.length === 0) return;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    const stride = 5 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * 4);

    gl.useProgram(this.planeProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pattern.texture);
    const tex = u(gl, this.planeProgram, "u_pattern");
    if (tex) gl.uniform1i(tex, 0);
    const facing = this.rotX === 0 && this.rotY === 0;
    const scale = (PERSPECTIVE / (PERSPECTIVE - DEPTH)) * this.dpr;
    const fract = (v: number) => v - Math.floor(v);
    const snap = facing
      ? [
          fract((this.cssW * this.dpr) / 2 - (this.planeW / 2) * scale),
          fract((this.cssH * this.dpr) / 2 - (this.planeH / 2) * scale),
        ]
      : [0, 0];
    // The back wall comes first in `planes`.
    setUniforms(gl, this.planeProgram, { u_opacity: opacity, u_snap: snap });
    gl.drawArrays(gl.TRIANGLES, 0, backCount);
    setUniforms(gl, this.planeProgram, { u_snap: [0, 0] });
    gl.drawArrays(gl.TRIANGLES, backCount, verts.length / 5 - backCount);
    gl.bindVertexArray(null);
  }
}
