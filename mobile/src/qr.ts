// Import only the encoder. The package's server/browser renderers require Node
// or canvas, neither of which belongs in a React Native screen.
import { create } from "qrcode/lib/core/qrcode";
import { parseTagInput } from "./domain-core";
export function qrMatrix(value: string) {
  const tag = parseTagInput(value);
  if (!tag) throw new Error("A valid Laundry Lounge garment tag is required.");
  // Alphanumeric QR encoding is compact and avoids a browser TextEncoder path.
  const payload = `LAUNDRY-LOUNGE:${tag}`;
  return create(payload, { errorCorrectionLevel: "M" }).modules;
}
export function tagSvg(tagId: string): string {
  const modules = qrMatrix(tagId);
  const extent = modules.size + 8;
  const parts: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.data[row * modules.size + col])
        parts.push(`M${col + 4} ${row + 4}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges"><rect width="${extent}" height="${extent}" fill="white"/><path d="${parts.join("")}" fill="black"/></svg>`;
}
