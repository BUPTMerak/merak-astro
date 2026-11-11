/** Exact sRGB palette sampled from the reference DOM page. */

export type RGBA = readonly [number, number, number, number];

const c = (r: number, g: number, b: number, a = 1): RGBA => [r / 255, g / 255, b / 255, a];

export interface Palette {
  dark: boolean;
  surface: RGBA;
  surfaceHover: RGBA;
  text: RGBA;
  bevelLight: RGBA;
  bevelLightInner: RGBA;
  bevelDark: RGBA;
  bevelDarkInner: RGBA;
  btnLight: RGBA;
  btnDark: RGBA;
  titleFrom: RGBA;
  titleTo: RGBA;
  titleBorder: RGBA;
  body: RGBA;
  green: RGBA;
  cyan: RGBA;
  yellow: RGBA;
  gray: RGBA;
  white: RGBA;
  dim: RGBA;
  roomLine: RGBA;
  roomStrong: RGBA;
  scrollA: RGBA;
  scrollB: RGBA;
  /** Page colour behind the CRT box. */
  page: RGBA;
  /** Translucent base colour of the CRT box. */
  glass: RGBA;
  crtIn: RGBA;
  crtOut: RGBA;
  border: RGBA;
  grade: { contrast: number; brightness: number; saturate: number };
  shadow: RGBA;
  shadowBlur: number;
  vignette: number;
}

export const LIGHT: Palette = {
  dark: false,
  surface: c(192, 192, 192),
  surfaceHover: c(212, 208, 200),
  text: c(0, 0, 0),
  bevelLight: c(255, 255, 255),
  bevelLightInner: c(223, 223, 223),
  bevelDark: c(128, 128, 128),
  bevelDarkInner: c(0, 0, 0),
  btnLight: c(255, 255, 255),
  btnDark: c(128, 128, 128),
  titleFrom: c(21, 93, 252),
  titleTo: c(25, 60, 184),
  titleBorder: c(106, 114, 130),
  body: c(255, 255, 255),
  green: c(0, 166, 62),
  cyan: c(0, 146, 184),
  yellow: c(208, 135, 0),
  gray: c(30, 41, 57),
  white: c(255, 255, 255),
  dim: c(0, 0, 0, 0.6),
  roomLine: c(0, 166, 244),
  roomStrong: c(0, 89, 138),
  scrollA: c(255, 255, 255),
  scrollB: c(192, 192, 192),
  page: c(243, 244, 246),
  glass: c(243, 244, 246, 0.9),
  crtIn: c(100, 100, 100, 0.3),
  crtOut: c(245, 245, 245),
  border: c(0, 0, 0),
  grade: { contrast: 1.05, brightness: 1.1, saturate: 0.8 },
  shadow: c(100, 100, 100, 0.2),
  shadowBlur: 2,
  vignette: 0.3,
};

export const DARK: Palette = {
  dark: true,
  surface: c(80, 80, 80),
  surfaceHover: c(96, 96, 96),
  text: c(255, 255, 255),
  bevelLight: c(128, 128, 128),
  bevelLightInner: c(0, 0, 0, 0),
  bevelDark: c(0, 0, 0),
  bevelDarkInner: c(0, 0, 0, 0),
  btnLight: c(112, 112, 112),
  btnDark: c(0, 0, 0),
  titleFrom: c(25, 60, 184),
  titleTo: c(28, 57, 142),
  titleBorder: c(74, 85, 101),
  body: c(0, 0, 0),
  green: c(5, 223, 114),
  cyan: c(0, 211, 243),
  yellow: c(253, 199, 0),
  gray: c(255, 255, 255),
  white: c(255, 255, 255),
  dim: c(255, 255, 255, 0.6),
  roomLine: c(0, 96, 69),
  roomStrong: c(0, 188, 125),
  scrollA: c(96, 96, 96),
  scrollB: c(64, 64, 64),
  page: c(0, 0, 0),
  glass: c(0, 0, 0, 0.9),
  crtIn: c(0, 40, 0, 0.55),
  crtOut: c(0, 0, 0),
  border: c(0, 0, 0),
  grade: { contrast: 1.15, brightness: 0.92, saturate: 0.9 },
  shadow: c(32, 200, 120, 0.35),
  shadowBlur: 6,
  vignette: 0.9,
};

export function palette(dark: boolean): Palette {
  return dark ? DARK : LIGHT;
}

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

export function withAlpha(col: RGBA, a: number): RGBA {
  return [col[0], col[1], col[2], a];
}
