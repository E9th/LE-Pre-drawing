declare module 'opentype.js' {
  interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  interface Path {
    getBoundingBox(): BoundingBox;
    toPathData(decimalPlaces?: number): string;
  }

  interface Font {
    getPath(text: string, x: number, y: number, fontSize: number): Path;
  }

  export function load(url: string): Promise<Font>;
}
