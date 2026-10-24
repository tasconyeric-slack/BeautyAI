import assert from "node:assert/strict";
import { test } from "node:test";
import { embedAigcMetadata, createAigcMetadata } from "./png-metadata";

const original = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAf8AAAAASUVORK5CYII=", "base64");
// Independent chunk reader: no production parsing helpers are used for assertions.
function chunks(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  const result: { type: string; data: Buffer; crc: number }[] = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    result.push({ type: data.toString("ascii", offset + 4, offset + 8), data: data.subarray(offset + 8, offset + 8 + length), crc: data.readUInt32BE(offset + 8 + length) });
    offset += length + 12;
  }
  return result;
}

test("PNG AIGC tEXt roundtrip uses the normative Annex E wrapper and exact seven fields", () => {
  const meta = createAigcMetadata({ ContentProducer: "AestheticPassport", ProduceID: "synthetic-001" });
  const output = embedAigcMetadata(original, meta);
  const parsed = chunks(output);
  const text = parsed.filter(c => c.type === "tEXt" && c.data.subarray(0, 5).toString("ascii") === "AIGC\0");
  assert.equal(text.length, 1);
  assert.deepEqual(JSON.parse(text[0].data.subarray(5).toString("latin1")), { AIGC: {
    Label: "1", ContentProducer: "AestheticPassport", ProduceID: "synthetic-001", ReservedCode1: "", ContentPropagator: "AestheticPassport", PropagateID: "synthetic-001", ReservedCode2: "",
  } });
  assert.equal(parsed.at(-1)?.type, "IEND");
  assert.deepEqual(parsed.filter(c => c.type === "IDAT").map(c => c.data), chunks(original).filter(c => c.type === "IDAT").map(c => c.data));
  assert.deepEqual(original, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAf8AAAAASUVORK5CYII=", "base64"));
});

test("relabeling replaces AIGC instead of duplicating it and writes a valid CRC", () => {
  const a = createAigcMetadata({ ContentProducer: "producer", ProduceID: "one" });
  const b = createAigcMetadata({ ContentProducer: "producer", ProduceID: "two", ContentPropagator: "distributor", PropagateID: "share-two" });
  const output = embedAigcMetadata(embedAigcMetadata(original, a), b);
  const text = chunks(output).filter(c => c.type === "tEXt");
  assert.equal(text.length, 1);
  assert.equal(JSON.parse(text[0].data.subarray(5).toString()).AIGC.ProduceID, "two");
  // Node's standard zlib CRC implementation is independent of the writer.
  const { crc32 } = require("node:zlib") as { crc32: (bytes: Uint8Array) => number };
  assert.equal(text[0].crc, crc32(Buffer.concat([Buffer.from("tEXt"), text[0].data])));
});

test("metadata safely roundtrips non-Latin provider names in Latin-1 PNG tEXt via JSON escapes", () => {
  const output = embedAigcMetadata(original, createAigcMetadata({ ContentProducer: "形象护照", ProduceID: 'id-"quote"' }));
  const text = chunks(output).find(c => c.type === "tEXt")!;
  assert.ok(text.data.every(byte => byte < 128));
  assert.equal(JSON.parse(text.data.subarray(5).toString("latin1")).AIGC.ContentProducer, "形象护照");
});

test("invalid PNGs and incomplete or unsafe metadata are rejected before export", () => {
  const meta = createAigcMetadata({ ContentProducer: "producer", ProduceID: "id" });
  for (const bytes of [new Uint8Array(), original.subarray(0, 21), Buffer.from("not a PNG"), original.subarray(0, original.length - 12)]) assert.throws(() => embedAigcMetadata(bytes, meta), /PNG/);
  assert.throws(() => createAigcMetadata({ ContentProducer: "", ProduceID: "id" }), /ContentProducer/);
  assert.throws(() => createAigcMetadata({ ContentProducer: "p", ProduceID: "" }), /ProduceID/);
  assert.throws(() => createAigcMetadata({ ContentProducer: "p", ProduceID: "line\nbreak" }), /ProduceID/);
  assert.throws(() => createAigcMetadata({ ContentProducer: "p", ProduceID: "id", ContentPropagator: "other" }), /PropagateID/);
  assert.throws(() => embedAigcMetadata(original, { ...meta, Label: "AIGC" } as unknown as typeof meta), /Label/);
});
