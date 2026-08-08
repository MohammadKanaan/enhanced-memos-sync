import { Notice } from "obsidian";

export interface NoticePort { show(message: string): void; }

export class ObsidianNoticeAdapter implements NoticePort {
  constructor(private readonly createNotice: (message: string) => void = (message) => void new Notice(message)) {}
  show(message: string): void { this.createNotice(message); }
}
