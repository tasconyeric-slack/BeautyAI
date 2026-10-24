"use client";

import { createAigcMetadata, embedAigcMetadata, type AigcMetadataInput } from "./png-metadata";

/** Export a mounted, unscaled card node. The result always includes its AIGC tEXt metadata. */
export async function exportPng(node: HTMLElement, meta: AigcMetadataInput): Promise<Blob> {
  const metadata = createAigcMetadata(meta); // Fail before rendering when provenance is incomplete.
  const width = Number(node.dataset.exportWidth || node.offsetWidth);
  const height = Number(node.dataset.exportHeight || node.offsetHeight);
  if (!node.isConnected || width <= 0 || height <= 0 || !Number.isFinite(width + height)) {
    throw new Error("PNG export requires a mounted card with positive dimensions.");
  }
  if (node.ownerDocument.fonts) await node.ownerDocument.fonts.ready;
  await Promise.all(Array.from(node.querySelectorAll("img")).map(async img => {
    try { await img.decode(); } catch { throw new Error("A card image is unavailable. Choose an illustration or try again."); }
  }));
  const { toBlob } = await import("html-to-image");
  const rendered = await toBlob(node, {
    width, height, canvasWidth: width, canvasHeight: height, pixelRatio: 1,
    // Preserve signed media URLs exactly; no cache-busting query parameters.
    cacheBust: false,
    style: { width: `${width}px`, height: `${height}px`, transform: "none", margin: "0" },
  });
  if (!rendered) throw new Error("The browser could not create the PNG card.");
  const labeled = embedAigcMetadata(new Uint8Array(await rendered.arrayBuffer()), metadata);
  return new Blob([labeled], { type: "image/png" });
}
