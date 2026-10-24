import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { performance } from "node:perf_hooks";

// Node has no browser ImageData. This narrow shim exercises the same owned RGBA bytes.
globalThis.ImageData = class ImageData {
  constructor(data, width, height, settings = {}) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.colorSpace = settings.colorSpace ?? "srgb";
  }
};
const require = createRequire(import.meta.url);
const { drape, lipTint, blush, tone } = require(
  join(process.env.TINT_TEST_BUILD, "index.js"),
);
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function geometry(overrides = {}) {
  return {
    width: 600,
    height: 750,
    jaw: rect(0.12, 0.08, 0.88, 0.76),
    neck: rect(0.1, 0.7, 0.9, 0.98),
    lip_outer: rect(0.32, 0.49, 0.68, 0.65),
    lip_inner: rect(0.41, 0.54, 0.59, 0.6),
    eye_l: rect(0.23, 0.25, 0.39, 0.34),
    eye_r: rect(0.61, 0.25, 0.77, 0.34),
    brow_l: rect(0.22, 0.18, 0.4, 0.22),
    brow_r: rect(0.6, 0.18, 0.78, 0.22),
    cheek_l: rect(0.15, 0.34, 0.43, 0.59),
    cheek_r: rect(0.57, 0.34, 0.85, 0.59),
    ...overrides,
  };
}
function image(width = 100, height = 100, textured = true) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const shade = textured ? (x * 7 + y * 11) % 45 : 0;
      data.set(
        [160 + shade, 115 + shade, 90 + shade, (x + y) % 5 ? 255 : 143],
        i,
      );
    }
  return new ImageData(data, width, height);
}
function pixel(src, x, y) {
  return src.data.slice((y * src.width + x) * 4, (y * src.width + x) * 4 + 4);
}
function insideRect(x, y, polygon) {
  return (
    x >= polygon[0][0] &&
    x <= polygon[2][0] &&
    y >= polygon[0][1] &&
    y <= polygon[2][1]
  );
}
const operations = {
  lip: (src, g) => lipTint(src, g, "#b42863", 0.85),
  blush: (src, g) => blush(src, g, "#dc4f75", "apple", 0.85),
  tone: (src, g) => tone(src, g, "#e5b873", 0.85),
  drape: (src, g) => drape(src, g, "#174fac"),
};
for (const [name, apply] of Object.entries(operations)) {
  test(`${name}: modifies the target, returns fresh ImageData, keeps input and alpha immutable`, () => {
    const src = image();
    const before = src.data.slice();
    const g = geometry();
    const saved = structuredClone(g);
    const out = apply(src, g);
    assert.ok(out instanceof ImageData);
    assert.notEqual(out, src);
    assert.notEqual(out.data, src.data);
    assert.equal(out.width, src.width);
    assert.equal(out.height, src.height);
    assert.notDeepEqual(out.data, before);
    assert.deepEqual(src.data, before);
    assert.deepEqual(g, saved);
    for (let i = 3; i < out.data.length; i += 4)
      assert.equal(out.data[i], before[i]);
    assert.deepEqual(apply(src, g).data, out.data);
  });
  test(`${name}: every pixel outside the intended target is byte identical`, () => {
    const src = image();
    const g = geometry();
    const out = apply(src, g);
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const nx = (x + 0.5) / src.width,
          ny = (y + 0.5) / src.height;
        const isTarget =
          name === "lip"
            ? insideRect(nx, ny, g.lip_outer)
            : name === "blush"
              ? insideRect(nx, ny, g.cheek_l) || insideRect(nx, ny, g.cheek_r)
              : name === "tone"
                ? insideRect(nx, ny, g.jaw)
                : insideRect(nx, ny, g.neck) && !insideRect(nx, ny, g.jaw);
        if (!isTarget)
          assert.deepEqual(pixel(out, x, y), pixel(src, x, y), `${x},${y}`);
      }
  });
  test(`${name}: both eyes and inner mouth remain byte identical even when targets overlap`, () => {
    const src = image();
    const full = rect(0, 0, 1, 1);
    const g = geometry({
      lip_outer: name === "lip" ? full : geometry().lip_outer,
      cheek_l: full,
      cheek_r: full,
      neck: full,
      jaw: name === "drape" ? [] : full,
    });
    const out = apply(src, g);
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        if (
          [g.eye_l, g.eye_r, g.lip_inner].some((p) =>
            insideRect((x + 0.5) / src.width, (y + 0.5) / src.height, p),
          )
        ) {
          assert.deepEqual(pixel(out, x, y), pixel(src, x, y), `${x},${y}`);
        }
      }
    // The transform must actually run while protecting these features.
    assert.notDeepEqual(out.data, src.data);
  });
  test(`${name}: empty and zero-area targets are harmless fresh copies`, () => {
    const src = image();
    for (const empty of [
      [],
      [[0.1, 0.1]],
      [
        [0.1, 0.1],
        [0.9, 0.9],
      ],
      [
        [0.1, 0.1],
        [0.5, 0.5],
        [0.9, 0.9],
      ],
    ]) {
      const g = geometry({
        lip_outer: empty,
        cheek_l: empty,
        cheek_r: empty,
        jaw: empty,
        neck: empty,
      });
      const out = apply(src, g);
      assert.notEqual(out.data, src.data);
      assert.deepEqual(out.data, src.data);
    }
  });
}
test("zero intensity is an exact copy; finite intensity clamps to 0..1", () => {
  const src = image(),
    g = geometry();
  for (const apply of [
    (i) => lipTint(src, g, "#f14", i),
    (i) => blush(src, g, "#f14", "diagonal", i),
    (i) => tone(src, g, "#f14", i),
  ]) {
    assert.deepEqual(apply(0).data, src.data);
    assert.deepEqual(apply(-2).data, src.data);
    assert.deepEqual(apply(2).data, apply(1).data);
    assert.throws(() => apply(NaN), /intensity/i);
  }
});
test("normalized coordinates scale with ImageData, independently of geometry reference dimensions", () => {
  const src = image(160, 80, false),
    g = geometry();
  const out = lipTint(src, g, "#b1215f", 1);
  assert.notDeepEqual(pixel(out, 56, 41), pixel(src, 56, 41));
  assert.deepEqual(pixel(out, 25, 41), pixel(src, 25, 41));
  assert.deepEqual(
    lipTint(src, { ...g, width: 1, height: 1 }, "#b1215f", 1).data,
    out.data,
  );
});
test("tone excludes brows and the complete outer lip", () => {
  const src = image(),
    g = geometry(),
    out = tone(src, g, "#eeb066", 1);
  for (const [x, y] of [
    [28, 19],
    [68, 19],
    [35, 51],
    [50, 57],
  ])
    assert.deepEqual(pixel(out, x, y), pixel(src, x, y));
});
test("blush placements have distinct radial falloffs and feather inward at cheek edges", () => {
  const src = image(200, 200, false),
    g = geometry();
  const outputs = ["horizontal", "diagonal", "apple"].map((p) =>
    blush(src, g, "#d32b66", p, 1),
  );
  assert.notDeepEqual(outputs[0].data, outputs[1].data);
  assert.notDeepEqual(outputs[1].data, outputs[2].data);
  const difference = (out, x, y) =>
    [0, 1, 2].reduce(
      (sum, c) => sum + Math.abs(pixel(out, x, y)[c] - pixel(src, x, y)[c]),
      0,
    );
  assert.ok(difference(outputs[2], 58, 93) > difference(outputs[2], 30, 93));
  assert.deepEqual(pixel(outputs[2], 29, 93), pixel(src, 29, 93));
});
test("edge-aligned polygons include the last row/column without leaking across a diagonal", () => {
  const src = image(32, 32),
    g = geometry({
      lip_outer: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      lip_inner: [],
      eye_l: [],
      eye_r: [],
    });
  const out = lipTint(src, g, "#f14", 1);
  assert.notDeepEqual(pixel(out, 31, 2), pixel(src, 31, 2));
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < y; x++)
      assert.deepEqual(pixel(out, x, y), pixel(src, x, y));
});
test("invalid color, normalized geometry, placement and image buffers fail clearly", () => {
  const src = image(),
    g = geometry();
  for (const color of ["blue", "#12345", "#ff000000"])
    assert.throws(() => lipTint(src, g, color, 1), /hex/i);
  for (const bad of [
    rect(-0.1, 0, 1, 1),
    [
      [0, 0],
      [NaN, 0],
      [1, 1],
    ],
  ])
    assert.throws(
      () => lipTint(src, { ...g, lip_outer: bad }, "#f14", 1),
      /normalized/i,
    );
  assert.throws(() => tone(src, { ...g, width: 0 }, "#f14", 1), /geometry/i);
  assert.throws(() => blush(src, g, "#f14", "unknown", 1), /placement/i);
  assert.throws(
    () => lipTint({ ...src, data: new Uint8ClampedArray(2) }, g, "#f14", 1),
    /ImageData/i,
  );
});
test("lipTint 1080x1350 indicative timing", (t) => {
  const src = image(1080, 1350),
    g = geometry();
  lipTint(src, g, "#b42863", 0.8);
  const timings = [];
  for (let n = 0; n < 5; n++) {
    const start = performance.now();
    lipTint(src, g, "#b42863", 0.8);
    timings.push(performance.now() - start);
  }
  const median = [...timings].sort((a, b) => a - b)[2];
  t.diagnostic(
    `1080x1350 lipTint warm median ${median.toFixed(2)} ms (${timings.map((n) => n.toFixed(2)).join(", ")}); reference target <60 ms, not a CI gate`,
  );
});

test("CIE Lab conversion matches D65 reference colors and round-trips sRGB bytes", () => {
  const { rgbToLab, labToRgb } = require(
    join(process.env.TINT_TEST_BUILD, "color.js"),
  );
  for (const [rgb, expected] of [
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      [255, 255, 255],
      [100, 0, 0],
    ],
    [
      [255, 0, 0],
      [53.24, 80.09, 67.2],
    ],
  ]) {
    const lab = rgbToLab(...rgb);
    for (let c = 0; c < 3; c++)
      assert.ok(Math.abs(lab[c] - expected[c]) < 0.02, `${rgb}: ${lab}`);
  }
  for (const rgb of [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [12, 97, 203],
    [179, 127, 103],
  ]) {
    assert.deepEqual(labToRgb(...rgbToLab(...rgb)), rgb);
  }
});
test("makeup keeps the original lightness texture instead of painting a flat color", () => {
  const { rgbToLab } = require(join(process.env.TINT_TEST_BUILD, "color.js"));
  const src = image(100, 100, false),
    g = geometry({
      lip_outer: rect(0, 0, 1, 1),
      lip_inner: [],
      eye_l: [],
      eye_r: [],
    });
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++)
      src.data.set(
        x % 2 ? [190, 145, 130, 255] : [130, 85, 70, 255],
        (y * 100 + x) * 4,
      );
  const out = lipTint(src, g, "#ad6660", 1);
  const l = (im, x) => rgbToLab(...pixel(im, x, 50).slice(0, 3))[0];
  assert.ok(l(out, 41) - l(out, 40) > 0.94 * (l(src, 41) - l(src, 40)));
  // Lip shades can shift depth by a bounded uniform L* offset; their local contrast must survive.
  const offsets = [40, 41].map(x => l(out, x) - l(src, x));
  assert.ok(Math.abs(offsets[0] - offsets[1]) < .75);
  for (const offset of offsets) assert.ok(Math.abs(offset) < 15);
});
test("solid drape fills its interior exactly and never changes transparent pixel bytes", () => {
  const src = image(),
    g = geometry();
  src.data.set([11, 22, 33, 0], (85 * 100 + 50) * 4);
  const out = drape(src, g, "#174fac");
  assert.deepEqual([...pixel(out, 51, 85).slice(0, 3)], [23, 79, 172]);
  assert.deepEqual(pixel(out, 50, 85), pixel(src, 50, 85));
});
test("concave, reversed and repeated-endpoint polygons render the same intended region", () => {
  const src = image(100, 100, false);
  const polygon = [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.6, 0.9],
    [0.6, 0.4],
    [0.4, 0.4],
    [0.4, 0.9],
    [0.1, 0.9],
  ];
  const g = geometry({
    lip_outer: polygon,
    lip_inner: [],
    eye_l: [],
    eye_r: [],
  });
  const out = lipTint(src, g, "#b42863", 1);
  assert.deepEqual(pixel(out, 50, 65), pixel(src, 50, 65));
  assert.notDeepEqual(pixel(out, 20, 65), pixel(src, 20, 65));
  for (const p of [[...polygon].reverse(), [...polygon, polygon[0]]])
    assert.deepEqual(
      lipTint(src, { ...g, lip_outer: p }, "#b42863", 1).data,
      out.data,
    );
});
test("sparse normalized coordinates are rejected at the geometry boundary", () => {
  const src = image(),
    g = geometry();
  assert.throws(
    () =>
      lipTint(
        src,
        { ...g, lip_outer: [[0, 0], new Array(2), [1, 1]] },
        "#f14",
        1,
      ),
    /normalized/i,
  );
});
