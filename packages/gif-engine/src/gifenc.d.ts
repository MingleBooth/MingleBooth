declare module 'gifenc' {
  export function GIFEncoder(opts?: any): {
    writeFrame: (index: Uint8Array, width: number, height: number, opts?: any) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    reset: () => void;
  };
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors?: number, opts?: any): number[][];
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: number[][], format?: string): Uint8Array;
}
