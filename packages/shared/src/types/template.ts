export interface CanvasDimensions {
  width: number;
  height: number;
}

export type PhotoFitMode = 'cover' | 'contain' | 'fill';

export interface PhotoSlot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: PhotoFitMode;
  rotation?: number;
  borderRadius?: number;
}

export interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string | number;
  color: string;
  textAlign?: 'left' | 'center' | 'right';
  rotation?: number;
}

export interface OverlayLayer {
  path: string; // Relative or absolute path to PNG overlay
  base64?: string;
  opacity?: number;
}

export interface BackgroundLayer {
  type: 'color' | 'image';
  color?: string; // hex or rgba
  imagePath?: string;
}

export interface TemplateConfig {
  id: string;
  name: string;
  description?: string;
  canvas: CanvasDimensions;
  photoSlots: PhotoSlot[];
  background?: BackgroundLayer;
  overlay?: OverlayLayer;
  texts?: TextElement[];
  isDefault?: boolean;
  aspectRatio: string; // '4:5', '2:3', '1:1', '4:6', '2:6' (strips)
  dpi?: number; // default 300 for print, 72 for digital
}

export interface TemplateRenderOptions {
  canvasWidth?: number;
  canvasHeight?: number;
  outputFormat?: 'jpeg' | 'png' | 'webp';
  quality?: number; // 1 - 100
  printReady?: boolean;
}
