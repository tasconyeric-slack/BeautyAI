/** GB 45438—2025, normative Annex E (not the inconsistent informative Annex F example).
 * https://www.tc260.org.cn/upload/2025-03-15/1742009439794081593.pdf
 * PNG tEXt stores ASCII-escaped JSON so its bytes remain valid ISO-8859-1.
 */
export interface AigcMetadata {
  Label: "1";
  ContentProducer: string;
  ProduceID: string;
  ReservedCode1: string;
  ContentPropagator: string;
  PropagateID: string;
  ReservedCode2: string;
}

export interface AigcMetadataInput {
  ContentProducer: string;
  /** Unique ID for this generated card, supplied by the caller; never a photo URL. */
  ProduceID: string;
  Label?: "1";
  ReservedCode1?: string;
  ContentPropagator?: string;
  PropagateID?: string;
  ReservedCode2?: string;
}

function field(name: string, value: unknown, required = true): string {
  if (typeof value !== "string" || (required && !value.trim()) || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`AIGC ${name} must be ${required ? "a nonempty" : "a"} string without control characters.`);
  }
  return value;
}

/** First write: propagator and propagation ID equal producer and production ID (Annex E note 1). */
export function createAigcMetadata(input: AigcMetadataInput): AigcMetadata {
  if (input.Label !== undefined && input.Label !== "1") throw new Error('AIGC Label must be "1" for generated cards.');
  const ContentProducer = field("ContentProducer", input.ContentProducer);
  const ProduceID = field("ProduceID", input.ProduceID);
  if (input.ContentPropagator && input.ContentPropagator !== ContentProducer && !input.PropagateID) {
    throw new Error("A distinct ContentPropagator requires its own PropagateID.");
  }
  if (input.PropagateID && !input.ContentPropagator) throw new Error("PropagateID requires ContentPropagator.");
  return {
    Label: "1", ContentProducer, ProduceID,
    ReservedCode1: field("ReservedCode1", input.ReservedCode1 ?? "", false),
    ContentPropagator: field("ContentPropagator", input.ContentPropagator ?? ContentProducer),
    PropagateID: field("PropagateID", input.PropagateID ?? ProduceID),
    ReservedCode2: field("ReservedCode2", input.ReservedCode2 ?? "", false),
  };
}

const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function textChunk(text: string) {
  const data = encoder.encode(`AIGC\0${text}`);
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(encoder.encode("tEXt"), 4);
  chunk.set(data, 8);
  let crc = 0xFFFFFFFF;
  for (const byte of chunk.subarray(4, 8 + data.length)) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  view.setUint32(data.length + 8, (crc ^ 0xFFFFFFFF) >>> 0);
  return chunk;
}

/** Inserts/replaces only the AIGC text chunk. Image data and unrelated metadata are preserved byte-for-byte. */
export function embedAigcMetadata(png: Uint8Array, input: AigcMetadataInput): Uint8Array<ArrayBuffer> {
  if (png.length < 33 || !signature.every((byte, i) => png[i] === byte)) throw new Error("Invalid PNG signature or header.");
  const metadata = createAigcMetadata(input);
  const json = JSON.stringify({ AIGC: metadata }).replace(/[\u007F-\uFFFF]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const addition = textChunk(json);
  const pieces: Uint8Array[] = [signature];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let ended = false;
  let imageData = false;
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error("Truncated PNG chunk.");
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("Invalid PNG chunk length.");
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (offset === 8 && (type !== "IHDR" || length !== 13)) throw new Error("Invalid PNG IHDR.");
    if (type === "IDAT") imageData = true;
    // Replace AIGC in any standard PNG textual chunk to avoid stale conflicting labels.
    const oldLabel = ["tEXt", "iTXt", "zTXt"].includes(type) && length >= 5 &&
      png[offset + 8] === 65 && png[offset + 9] === 73 && png[offset + 10] === 71 && png[offset + 11] === 67 && png[offset + 12] === 0;
    if (type === "IEND") {
      if (length !== 0 || !imageData || end !== png.length) throw new Error("Invalid PNG end or missing image data.");
      pieces.push(addition);
      ended = true;
    }
    if (!oldLabel) pieces.push(png.subarray(offset, end));
    offset = end;
    if (ended) break;
  }
  if (!ended) throw new Error("PNG has no IEND chunk.");
  const result = new Uint8Array(pieces.reduce((size, piece) => size + piece.length, 0));
  let at = 0;
  for (const piece of pieces) { result.set(piece, at); at += piece.length; }
  return result;
}
