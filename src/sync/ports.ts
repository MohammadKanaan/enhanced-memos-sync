export interface RequestResponse {
  status: number;
  text: string;
  json?: unknown;
  arrayBuffer?: ArrayBuffer;
}

export interface RequestPort {
  get(options: {
    url: string;
    headers: Record<string, string>;
    responseType: "json" | "arrayBuffer";
  }): Promise<RequestResponse>;
}

export interface VaultPort {
  ensureFolder(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<"created" | "updated" | "unchanged">;
  writeBinaryIfAbsent(path: string, data: ArrayBuffer): Promise<"created" | "existing">;
  listMarkdownFiles(folder: string): Promise<string[]>;
  trash(path: string): Promise<void>;
}
