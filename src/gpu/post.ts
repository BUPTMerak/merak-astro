import { DISPLACEMENT_SCALE } from "./field";
import {
  createFullscreenTriangle,
  createProgram,
  setUniforms,
  u,
  type ProgramInfo,
} from "./glutil";

const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Final pass: the equivalent of the original `filter` on `.crt`.
 *
 * `u_flat` is the whole flat CRT (background, room, windows, vignette,
 * scanlines, border) with premultiplied alpha. Every output pixel copies one
 * flat pixel, displaced by the glass map; sources outside the box are
 * transparent, so the page colour shows there.
 *
 * The original chain ends in an feMerge that stacks the result on itself, which
 * turns the box's alpha a into a(2 - a) before it is composited on the page.
 */
const FS = `#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform sampler2D u_flat;
uniform sampler2D u_map;

uniform vec2 u_target;
uniform float u_dpr;
uniform vec3 u_field;
uniform vec2 u_mapSize;
uniform float u_warp;
uniform vec3 u_page;

vec2 mapTexel(ivec2 p) {
  ivec2 hi = ivec2(u_mapSize) - 1;
  return texelFetch(u_map, clamp(p, ivec2(0), hi), 0).rg;
}

// Must stay in step with sourceOffset() in field.ts.
ivec2 sourceOffset(ivec2 pixel) {
  vec2 m = ((vec2(pixel) + 0.5) / u_dpr - u_field.xy) / u_field.z;
  vec2 c = vec2(0.0);
  if (m.x >= 0.0 && m.y >= 0.0 && m.x < u_mapSize.x && m.y < u_mapSize.y) {
    vec2 uv = m - 0.5;
    ivec2 i = ivec2(floor(uv));
    vec2 f = uv - floor(uv);
    c = mix(
      mix(mapTexel(i), mapTexel(i + ivec2(1, 0)), f.x),
      mix(mapTexel(i + ivec2(0, 1)), mapTexel(i + ivec2(1, 1)), f.x),
      f.y
    );
  }
  return ivec2(floor(${DISPLACEMENT_SCALE.toFixed(1)} * (c - 0.5) * u_dpr + 0.5));
}

void main() {
  ivec2 size = ivec2(u_target);
  ivec2 pixel = ivec2(int(gl_FragCoord.x), size.y - 1 - int(gl_FragCoord.y));
  ivec2 src = pixel;
  if (u_warp > 0.5) src += sourceOffset(pixel);

  vec4 c = vec4(0.0);
  if (src.x >= 0 && src.y >= 0 && src.x < size.x && src.y < size.y) {
    c = texelFetch(u_flat, ivec2(src.x, size.y - 1 - src.y), 0);
  }

  float keep = (1.0 - c.a) * (1.0 - c.a);
  outColor = vec4(c.rgb * (2.0 - c.a) + u_page * keep, 1.0);
}`;

export class PostPass {
  program: ProgramInfo;
  private vao: WebGLVertexArrayObject;

  constructor(private gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, VS, FS);
    this.vao = createFullscreenTriangle(gl).vao as WebGLVertexArrayObject;
  }

  draw(opts: {
    flat: WebGLTexture;
    map: WebGLTexture;
    mapSize: [number, number];
    /** Device pixel size of the canvas / flat target. */
    width: number;
    height: number;
    dpr: number;
    /** Map image origin (CSS px) and CSS px per map texel. */
    field: [number, number, number];
    warp: boolean;
    page: [number, number, number];
  }) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, opts.width, opts.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, opts.map);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, opts.flat);

    const uFlat = u(gl, this.program, "u_flat");
    const uMap = u(gl, this.program, "u_map");
    if (uFlat) gl.uniform1i(uFlat, 0);
    if (uMap) gl.uniform1i(uMap, 1);
    setUniforms(gl, this.program, {
      u_target: [opts.width, opts.height],
      u_dpr: opts.dpr,
      u_field: opts.field,
      u_mapSize: opts.mapSize,
      u_warp: opts.warp ? 1 : 0,
      u_page: opts.page,
    });

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }
}
