import type { RGBA } from "./color";
import type { GlyphAtlas } from "./font";

export interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}\n${src}`);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram failed");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }

  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info)
      uniforms.set(info.name.replace(/\[0\]$/, ""), gl.getUniformLocation(program, info.name));
  }
  return { program, uniforms } satisfies ProgramInfo;
}

export function u(gl: WebGL2RenderingContext, p: ProgramInfo, name: string) {
  return p.uniforms.get(name) ?? null;
}

export function setUniforms(
  gl: WebGL2RenderingContext,
  p: ProgramInfo,
  values: Record<string, number | number[] | Float32Array | boolean>,
) {
  for (const [name, value] of Object.entries(values)) {
    const loc = p.uniforms.get(name);
    if (!loc) continue;
    if (typeof value === "number") gl.uniform1f(loc, value);
    else if (typeof value === "boolean") gl.uniform1i(loc, value ? 1 : 0);
    else {
      const v = value as number[] | Float32Array;
      if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    }
  }
}

// ---------------------------------------------------------------------------
// Coloured quads (solid and linear gradient)
// ---------------------------------------------------------------------------

const QUAD_STRIDE = 6; // x, y, r, g, b, a

export class QuadBatch {
  private data: number[] = [];
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  clear() {
    this.data.length = 0;
  }

  add(x: number, y: number, w: number, h: number, c: RGBA) {
    if (w <= 0 || h <= 0) return;
    const [r, g, b, a] = c;
    const x1 = x + w;
    const y1 = y + h;
    const v = this.data;
    v.push(x, y, r, g, b, a, x1, y, r, g, b, a, x, y1, r, g, b, a);
    v.push(x1, y, r, g, b, a, x1, y1, r, g, b, a, x, y1, r, g, b, a);
  }

  addGradient(
    x: number,
    y: number,
    w: number,
    h: number,
    from: RGBA,
    to: RGBA,
    direction: "h" | "v" = "h",
  ) {
    if (w <= 0 || h <= 0) return;
    const x1 = x + w;
    const y1 = y + h;
    const c0 = from;
    const c1 = to;
    const topLeft = direction === "h" ? c0 : c0;
    const topRight = direction === "h" ? c1 : c0;
    const bottomLeft = direction === "h" ? c0 : c1;
    const bottomRight = direction === "h" ? c1 : c1;
    const v = this.data;
    v.push(x, y, ...topLeft, x1, y, ...topRight, x, y1, ...bottomLeft);
    v.push(x1, y, ...topRight, x1, y1, ...bottomRight, x, y1, ...bottomLeft);
  }

  /** Arbitrary convex quad (used for 1px diagonal icon strokes). */
  addQuad(points: [number, number][], c: RGBA) {
    const [r, g, b, a] = c;
    const v = this.data;
    const p = points;
    v.push(
      p[0][0],
      p[0][1],
      r,
      g,
      b,
      a,
      p[1][0],
      p[1][1],
      r,
      g,
      b,
      a,
      p[2][0],
      p[2][1],
      r,
      g,
      b,
      a,
    );
    v.push(
      p[0][0],
      p[0][1],
      r,
      g,
      b,
      a,
      p[2][0],
      p[2][1],
      r,
      g,
      b,
      a,
      p[3][0],
      p[3][1],
      r,
      g,
      b,
      a,
    );
  }

  get size() {
    return this.data.length / QUAD_STRIDE;
  }

  flush(gl: WebGL2RenderingContext, p: ProgramInfo, cssW: number, cssH: number) {
    if (this.data.length === 0) return;
    if (!this.buffer) {
      this.buffer = gl.createBuffer();
      this.vao = gl.createVertexArray();
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data), gl.DYNAMIC_DRAW);

    const stride = QUAD_STRIDE * 4;
    const pos = gl.getAttribLocation(p.program, "a_pos");
    const col = gl.getAttribLocation(p.program, "a_color");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(col);
    gl.vertexAttribPointer(col, 4, gl.FLOAT, false, stride, 2 * 4);

    gl.useProgram(p.program);
    const res = u(gl, p, "u_res");
    if (res) gl.uniform2f(res, cssW, cssH);
    gl.drawArrays(gl.TRIANGLES, 0, this.data.length / QUAD_STRIDE);
    this.data.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Glyph quads
// ---------------------------------------------------------------------------

const GLYPH_STRIDE = 8; // x, y, u, v, r, g, b, a

export class GlyphBatch {
  private data: number[] = [];
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  texture: WebGLTexture | null = null;
  atlas: GlyphAtlas | null = null;

  clear() {
    this.data.length = 0;
  }

  add(
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    c: RGBA,
  ) {
    if (w <= 0 || h <= 0) return;
    const [r, g, b, a] = c;
    const x1 = x + w;
    const y1 = y + h;
    const v = this.data;
    v.push(x, y, u0, v0, r, g, b, a, x1, y, u1, v0, r, g, b, a, x, y1, u0, v1, r, g, b, a);
    v.push(x1, y, u1, v0, r, g, b, a, x1, y1, u1, v1, r, g, b, a, x, y1, u0, v1, r, g, b, a);
  }

  flush(gl: WebGL2RenderingContext, p: ProgramInfo, cssW: number, cssH: number) {
    if (this.data.length === 0 || !this.texture) return;
    if (!this.buffer) {
      this.buffer = gl.createBuffer();
      this.vao = gl.createVertexArray();
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data), gl.DYNAMIC_DRAW);

    const stride = GLYPH_STRIDE * 4;
    const pos = gl.getAttribLocation(p.program, "a_pos");
    const uv = gl.getAttribLocation(p.program, "a_uv");
    const col = gl.getAttribLocation(p.program, "a_color");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(col);
    gl.vertexAttribPointer(col, 4, gl.FLOAT, false, stride, 4 * 4);

    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const tex = u(gl, p, "u_atlas");
    if (tex) gl.uniform1i(tex, 0);
    const res = u(gl, p, "u_res");
    if (res) gl.uniform2f(res, cssW, cssH);
    gl.drawArrays(gl.TRIANGLES, 0, this.data.length / GLYPH_STRIDE);
    this.data.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Textures / render targets
// ---------------------------------------------------------------------------

export function textureFromSource(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
  opts: { flipY?: boolean; premultiply?: boolean; nearest?: boolean } = {},
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ?? false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, opts.premultiply ?? false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const filter = opts.nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export class RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;

  constructor(
    private gl: WebGL2RenderingContext,
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
    this.texture = gl.createTexture() as WebGLTexture;
    this.framebuffer = gl.createFramebuffer() as WebGLFramebuffer;
    this.allocate();
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.allocate();
  }

  private allocate() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
  }
}

// ---------------------------------------------------------------------------
// Scissor helper (CSS px, top-left origin)
// ---------------------------------------------------------------------------

let clipState: [number, number, number, number] | null = null;

export function setClip(
  gl: WebGL2RenderingContext,
  cssW: number,
  cssH: number,
  dpr: number,
  rect: [number, number, number, number] | null,
) {
  if (!rect) {
    clipState = null;
    gl.disable(gl.SCISSOR_TEST);
    return;
  }
  const x = Math.max(0, Math.floor(rect[0]));
  const y = Math.max(0, Math.floor(rect[1]));
  const x1 = Math.min(cssW, Math.ceil(rect[0] + rect[2]));
  const y1 = Math.min(cssH, Math.ceil(rect[1] + rect[3]));
  const w = Math.max(0, x1 - x);
  const h = Math.max(0, y1 - y);
  if (w === 0 || h === 0) {
    clipState = null;
    gl.disable(gl.SCISSOR_TEST);
    return;
  }
  clipState = [x, y, w, h];
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    Math.round(x * dpr),
    Math.round((cssH - (y + h)) * dpr),
    Math.round(w * dpr),
    Math.round(h * dpr),
  );
}

export function currentClip() {
  return clipState;
}

// ---------------------------------------------------------------------------
// Fullscreen triangle
// ---------------------------------------------------------------------------

export function createFullscreenTriangle(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, buffer };
}
