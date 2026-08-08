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
