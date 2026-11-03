declare module "qrcode/lib/core/qrcode" {
  export interface QRMatrix {
    modules: { size: number; data: Uint8Array };
  }
  export function create(
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): QRMatrix;
}
