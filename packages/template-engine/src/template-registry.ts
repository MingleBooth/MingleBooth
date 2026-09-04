import {
  DEFAULT_PORTRAIT_TEMPLATE,
  DEFAULT_STRIP_TEMPLATE,
  TemplateConfig,
  TemplateConfigSchema,
} from '@minglebooth/shared';

export class TemplateRegistry {
  private templates: Map<string, TemplateConfig> = new Map();

  constructor() {
    this.registerTemplate(DEFAULT_PORTRAIT_TEMPLATE);
    this.registerTemplate(DEFAULT_STRIP_TEMPLATE);
  }

  public registerTemplate(template: TemplateConfig): void {
    const validated = TemplateConfigSchema.parse(template);
    this.templates.set(validated.id, validated as TemplateConfig);
  }

  public getTemplate(id: string): TemplateConfig | undefined {
    return this.templates.get(id);
  }

  public getDefaultTemplate(): TemplateConfig {
    return this.templates.get(DEFAULT_PORTRAIT_TEMPLATE.id) || Array.from(this.templates.values())[0];
  }

  public getAllTemplates(): TemplateConfig[] {
    return Array.from(this.templates.values());
  }
}
