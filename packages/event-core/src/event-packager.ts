import { EventConfig, EventPackage } from '@minglebooth/shared';

export class EventPackager {
  /**
   * Bundles an event configuration into a portable offline package
   */
  public static createPackage(event: EventConfig, templateAssets: EventPackage['templateAssets'] = []): EventPackage {
    return {
      version: '1.0.0',
      event,
      templateAssets,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validates and parses an imported event package
   */
  public static parsePackage(jsonString: string): EventPackage {
    try {
      const parsed = JSON.parse(jsonString) as EventPackage;
      if (!parsed.event || !parsed.event.id) {
        throw new Error('Invalid EventPackage structure: missing event config');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`Failed to parse event package: ${err?.message}`);
    }
  }
}
