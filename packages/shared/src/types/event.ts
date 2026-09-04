import { TemplateConfig } from './template';

export type EventStatus = 'draft' | 'ready' | 'active' | 'completed' | 'archived';

export type OutputType = 'photo' | 'gif' | 'both';

export interface EventBranding {
  eventName: string;
  hostNames?: string; // e.g. "Bayu & Irma"
  dateFormatted?: string; // e.g. "29 August 2026"
  primaryColor?: string;
  logoUrl?: string;
  hashtag?: string;
  customMessage?: string;
}

export interface EventConfig {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  date: string; // ISO date string (YYYY-MM-DD)
  status: EventStatus;
  outputType: OutputType;
  countdownSeconds: number; // e.g. 3, 5
  shotsPerSession: number; // e.g. 1 for single, 3-4 for strips
  templates: TemplateConfig[];
  selectedTemplateId: string;
  branding: EventBranding;
  allowRetake?: boolean;
  printCopiesDefault?: number;
  qrBaseUrl: string; // e.g. "https://gallery.minglebooth.com"
  createdAt: string;
  updatedAt: string;
}

export interface EventPackage {
  version: string;
  event: EventConfig;
  templateAssets: {
    templateId: string;
    overlayPngBase64?: string;
    backgroundImageBase64?: string;
  }[];
  generatedAt: string;
  signature?: string;
}
