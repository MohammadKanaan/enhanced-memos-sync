import type { RequestPort, RequestResponse } from "../sync/ports";

export interface ObsidianRequestUrl {
  (options: { url: string; method: "GET"; throw: false; headers: Record<string, string> }): Promise<RequestResponse>;
}

export class ObsidianRequestAdapter implements RequestPort {
  constructor(private readonly requestUrl: ObsidianRequestUrl) {}

  get(options: Parameters<RequestPort["get"]>[0]): Promise<RequestResponse> {
    return this.requestUrl({
      url: options.url,
      method: "GET",
      throw: false,
      headers: options.headers,
    });
  }
}
