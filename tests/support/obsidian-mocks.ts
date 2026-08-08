export interface MockFile {
  path: string;
  extension?: string;
}

export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

export function requireApiVersion(_version: string): boolean {
  return false;
}

export const moment = (value: string) => ({
  format: (format: string) => (format === "YYYY-MM-DD" ? value : value),
});

export class Notice {
  static messages: string[] = [];

  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export class MockElement {
  readonly children: MockElement[] = [];
  text = "";
  className = "";

  get textContent(): string { return this.text; }
  set textContent(value: string) { this.text = value; }

  empty(): void {
    this.children.splice(0);
    this.text = "";
  }

  createDiv(options: { cls?: string; text?: string } = {}): MockElement {
    return this.createEl("div", options);
  }

  createEl(_tag: string, options: { cls?: string; text?: string } = {}): MockElement {
    const child = new MockElement();
    child.className = options.cls ?? "";
    child.text = options.text ?? "";
    this.children.push(child);
    return child;
  }
}

export class TextComponent {
  readonly inputEl = { type: "text" };
  value = "";
  private changed?: (value: string) => unknown;

  setValue(value: string): this { this.value = value; return this; }
  onChange(callback: (value: string) => unknown): this { this.changed = callback; return this; }
  async trigger(value: string): Promise<void> { this.value = value; await this.changed?.(value); }
}

export class ToggleComponent {
  value = false;
  private changed?: (value: boolean) => unknown;

  setValue(value: boolean): this { this.value = value; return this; }
  onChange(callback: (value: boolean) => unknown): this { this.changed = callback; return this; }
  async trigger(value: boolean): Promise<void> { this.value = value; await this.changed?.(value); }
}

export class Setting {
  static instances: Setting[] = [];
  readonly descEl = new MockElement();
  readonly settingEl = new MockElement();
  name = "";
  description = "";
  text?: TextComponent;
  toggle?: ToggleComponent;

  constructor(_container: unknown) { Setting.instances.push(this); }
  setName(name: string): this { this.name = name; return this; }
  setDesc(description: string): this { this.description = description; return this; }
  setHeading(): this { return this; }
  addText(callback: (component: TextComponent) => unknown): this {
    this.text = new TextComponent();
    callback(this.text);
    return this;
  }
  addToggle(callback: (component: ToggleComponent) => unknown): this {
    this.toggle = new ToggleComponent();
    callback(this.toggle);
    return this;
  }
}

export class PluginSettingTab {
  readonly containerEl = new MockElement();
  constructor(readonly app: unknown, readonly plugin: unknown) {}
}

export class Plugin {
  app: any;
  data: unknown;
  readonly commands: any[] = [];
  readonly ribbon: Array<{ icon: string; title: string; callback: () => unknown }> = [];
  readonly settingTabs: unknown[] = [];

  constructor(app: unknown = {}, _manifest?: unknown) { this.app = app; }
  async loadData(): Promise<unknown> { return this.data; }
  async saveData(data: unknown): Promise<void> { this.data = data; }
  addCommand(command: unknown): unknown { this.commands.push(command); return command; }
  addRibbonIcon(icon: string, title: string, callback: () => unknown): unknown {
    this.ribbon.push({ icon, title, callback });
    return {};
  }
  addSettingTab(tab: unknown): void { this.settingTabs.push(tab); }
}

export async function requestUrl(_options: unknown): Promise<unknown> {
  return { status: 200, text: "", json: { memos: [] } };
}
