#!/usr/bin/env node
/**
 * Chart-palette validator.
 *
 * The dark chart ramp in `src/index.css` is re-stepped for the dark surface
 * rather than flipped from the light one, and it has to hold four properties at
 * once. This checks them so the ramp is never "adjusted" by eye:
 *
 *   1. lightness  — OKLCH L inside 0.48–0.67, so no mark disappears into the
 *                   card and none glares off it
 *   2. chroma     — OKLCH C ≥ 0.10, or the hue stops being a hue
 *   3. contrast   — ≥ 3:1 against `--card`, the WCAG floor for a graphical mark
 *   4. separation — adjacent pairs stay ≥ 8 ΔE apart under normal vision *and*
 *                   under protanopia, deuteranopia and tritanopia
 *
 * Usage:  node scripts/validate-palette.mjs
 * Exits non-zero when any rule fails, so CI can gate on it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = join(here, '..', 'src', 'index.css');

const L_MIN = 0.48;
const L_MAX = 0.67;
const C_MIN = 0.1;
const CONTRAST_MIN = 3;
const DELTA_E_MIN = 8;

// ---------------------------------------------------------------- colour math

/** OKLCH → OKLab → linear sRGB. */
function oklchToLinearRgb({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  return [
    +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

function toHex(linear) {
  return (
    '#' +
    linear
      .map((v) =>
        Math.round(clamp01(encode(clamp01(v))) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** WCAG relative luminance from linear-light sRGB. */
const luminance = ([r, g, b]) => 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b);

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear sRGB → CIELAB (D65), for ΔE. */
function linearRgbToLab(rgb) {
  const [r, g, b] = rgb.map(clamp01);
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;

  const white = [0.95047, 1, 1.08883];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [X / white[0], Y / white[1], Z / white[2]].map(f);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deltaE = (a, b) => {
  const [l1, a1, b1] = linearRgbToLab(a);
  const [l2, a2, b2] = linearRgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/** Machado et al. (2009) dichromacy matrices at full severity. */
const CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const simulate = (rgb, matrix) => matrix.map((row) => row.reduce((s, k, i) => s + k * rgb[i], 0));

// ------------------------------------------------------------------- parsing

const css = readFileSync(CSS, 'utf8');

/** Pull the `.dark { … }` block, then the tokens we care about out of it. */
function darkBlock() {
  const start = css.indexOf('.dark {');
  if (start === -1) throw new Error('no .dark block in index.css');
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

function readToken(block, name) {
  const m = block.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`),
  );
  if (!m) throw new Error(`token --${name} not found (or not oklch) in .dark`);
  return { l: +m[1], c: +m[2], h: +m[3] };
}

const block = darkBlock();
const card = oklchToLinearRgb(readToken(block, 'card'));

const ramp = [1, 2, 3, 4, 5].map((n) => {
  const token = readToken(block, `chart-${n}`);
  return { name: `--chart-${n}`, ...token, rgb: oklchToLinearRgb(token) };
});

// ------------------------------------------------------------------- checking

const failures = [];
const pass = (ok) => (ok ? 'PASS' : 'FAIL');

console.log(`\nDark chart ramp — validated against --card ${toHex(card)}\n`);
console.log('token      hex      L      C     vs card   lightness  chroma  contrast');
console.log('─'.repeat(74));

for (const swatch of ramp) {
  const ratio = contrast(swatch.rgb, card);
  const okL = swatch.l >= L_MIN && swatch.l <= L_MAX;
  const okC = swatch.c >= C_MIN;
  const okRatio = ratio >= CONTRAST_MIN;

  if (!okL) failures.push(`${swatch.name}: L ${swatch.l} outside ${L_MIN}–${L_MAX}`);
  if (!okC) failures.push(`${swatch.name}: C ${swatch.c} below ${C_MIN}`);
  if (!okRatio)
    failures.push(`${swatch.name}: contrast ${ratio.toFixed(2)}:1 below ${CONTRAST_MIN}:1`);

  console.log(
    `${swatch.name.padEnd(10)} ${toHex(swatch.rgb)}  ${swatch.l.toFixed(2)}  ${swatch.c
      .toFixed(3)
      .padStart(5)}  ${ratio.toFixed(2).padStart(6)}:1   ${pass(okL).padEnd(10)} ${pass(okC).padEnd(
      7,
    )} ${pass(okRatio)}`,
  );
}

console.log('\nadjacent-pair separation (ΔE, CIE76)\n');
console.log('pair                normal  protan  deutan  tritan   result');
console.log('─'.repeat(64));

for (let i = 0; i < ramp.length - 1; i++) {
  const a = ramp[i];
  const b = ramp[i + 1];

  const scores = {
    normal: deltaE(a.rgb, b.rgb),
    protanopia: deltaE(simulate(a.rgb, CVD.protanopia), simulate(b.rgb, CVD.protanopia)),
    deuteranopia: deltaE(simulate(a.rgb, CVD.deuteranopia), simulate(b.rgb, CVD.deuteranopia)),
    tritanopia: deltaE(simulate(a.rgb, CVD.tritanopia), simulate(b.rgb, CVD.tritanopia)),
  };

  const worst = Math.min(...Object.values(scores));
  const ok = worst >= DELTA_E_MIN;
  if (!ok) {
    const [vision] = Object.entries(scores).find(([, v]) => v === worst);
    failures.push(
      `${a.name} vs ${b.name}: ΔE ${worst.toFixed(1)} under ${vision} — below ${DELTA_E_MIN}`,
    );
  }

  console.log(
    `${(a.name + ' / ' + b.name).padEnd(20)}${scores.normal.toFixed(1).padStart(5)}` +
      `${scores.protanopia.toFixed(1).padStart(8)}${scores.deuteranopia.toFixed(1).padStart(8)}` +
      `${scores.tritanopia.toFixed(1).padStart(8)}   ${pass(ok)}`,
  );
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

console.log('\nAll checks passed.\n');
