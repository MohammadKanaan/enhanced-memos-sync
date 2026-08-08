import type { RequestPort, RequestResponse } from "../../src/sync/ports";

export class FakeRequestPort implements RequestPort {
  readonly calls: Parameters<RequestPort["get"]>[0][] = [];

  constructor(
    private readonly respond: (
      call: Parameters<RequestPort["get"]>[0],
      index: number,
    ) => Promise<RequestResponse> | RequestResponse,
  ) {}

  async get(options: Parameters<RequestPort["get"]>[0]): Promise<RequestResponse> {
    this.calls.push(options);
    return this.respond(options, this.calls.length - 1);
  }
}
