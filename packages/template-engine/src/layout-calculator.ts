import { CanvasDimensions, PhotoFitMode, PhotoSlot } from '@minglebooth/shared';

export interface CalculatedSlotCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
}

export class LayoutCalculator {
  /**
   * Calculates precise source crop and target placement for a captured photo inside a template slot
   */
  public static calculateSlotTransform(
    sourceWidth: number,
    sourceHeight: number,
    slot: PhotoSlot,
    canvas: CanvasDimensions
  ): CalculatedSlotCrop {
    const slotAspect = slot.width / slot.height;
    const sourceAspect = sourceWidth / sourceHeight;

    let srcX = 0;
    let srcY = 0;
    let srcW = sourceWidth;
    let srcH = sourceHeight;

    if (slot.fit === 'cover') {
      if (sourceAspect > slotAspect) {
        // Source is wider than slot: crop left and right
        srcW = sourceHeight * slotAspect;
        srcX = (sourceWidth - srcW) / 2;
      } else {
        // Source is taller than slot: crop top and bottom
        srcH = sourceWidth / slotAspect;
        srcY = (sourceHeight - srcH) / 2;
      }
    } else if (slot.fit === 'contain') {
      // Fit entire image inside slot bounds
      // Slot target can be adjusted if needed, default is full slot placement
    }

    return {
      sourceX: Math.round(srcX),
      sourceY: Math.round(srcY),
      sourceWidth: Math.round(srcW),
      sourceHeight: Math.round(srcH),
      targetX: Math.round(slot.x),
      targetY: Math.round(slot.y),
      targetWidth: Math.round(slot.width),
      targetHeight: Math.round(slot.height),
    };
  }

  /**
   * Rescales canvas coordinates proportionally for responsive preview or printing
   */
  public static scaleSlot(slot: PhotoSlot, scaleFactor: number): PhotoSlot {
    return {
      ...slot,
      x: slot.x * scaleFactor,
      y: slot.y * scaleFactor,
      width: slot.width * scaleFactor,
      height: slot.height * scaleFactor,
      borderRadius: slot.borderRadius ? slot.borderRadius * scaleFactor : undefined,
    };
  }
}
