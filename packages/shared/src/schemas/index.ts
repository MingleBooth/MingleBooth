import { z } from 'zod';

export const CanvasDimensionsSchema = z.object({
  width: z.number().int().positive().max(8000),
  height: z.number().int().positive().max(8000),
});

export const PhotoSlotSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  rotation: z.number().optional().default(0),
  borderRadius: z.number().optional().default(0),
});

export const TextElementSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  fontSize: z.number().positive(),
  fontFamily: z.string().default('Inter, sans-serif'),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  color: z.string().default('#FFFFFF'),
  textAlign: z.enum(['left', 'center', 'right']).optional().default('left'),
  rotation: z.number().optional().default(0),
});

export const TemplateConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  aspectRatio: z.string(),
  canvas: CanvasDimensionsSchema,
  photoSlots: z.array(PhotoSlotSchema).min(1),
  background: z
    .object({
      type: z.enum(['color', 'image']),
      color: z.string().optional(),
      imagePath: z.string().optional(),
    })
    .optional(),
  overlay: z
    .object({
      path: z.string(),
      base64: z.string().optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
  texts: z.array(TextElementSchema).optional(),
  dpi: z.number().optional().default(300),
  isDefault: z.boolean().optional(),
});

export const EventConfigSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1),
  date: z.string(),
  status: z.enum(['draft', 'ready', 'active', 'completed', 'archived']),
  outputType: z.enum(['photo', 'gif', 'both']),
  countdownSeconds: z.number().int().min(1).max(15).default(3),
  shotsPerSession: z.number().int().min(1).max(10).default(1),
  selectedTemplateId: z.string(),
  branding: z.object({
    eventName: z.string(),
    hostNames: z.string().optional(),
    dateFormatted: z.string().optional(),
    primaryColor: z.string().optional(),
    logoUrl: z.string().optional(),
    hashtag: z.string().optional(),
    customMessage: z.string().optional(),
  }),
  qrBaseUrl: z.string().url(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
