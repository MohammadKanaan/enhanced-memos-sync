import { createRedactedExternalError } from "../core/diagnostics";
import type { RemoteMemo } from "../core/types";
import { appendServerPath } from "../core/url";
import type { RequestPort } from "../sync/ports";
import type { ListMemosResponse } from "./contracts";

export const PAGE_SIZE = 200;
export const MAX_PAGES = 1_000;

export class MemosApiError extends Error {
  readonly cause: unknown;
  readonly consoleMessage: string;

  constructor(message: string, responseBody: string | undefined, token: string, cause?: unknown) {
    const redacted = createRedactedExternalError({
      message,
      responseBody,
      token,
      cause,
    });
    super(redacted.message);
    this.name = "MemosApiError";
    this.cause = cause;
    this.consoleMessage = redacted.consoleMessage;
  }
}

export class MemosClient {
  private readonly baseUrl: string;

  constructor(
    private readonly request: RequestPort,
    apiUrl: string,
    private readonly token: string,
  ) {
    this.baseUrl = apiUrl.replace(/\/+$/, "");
  }

  async list(threshold: number, includeComments = false): Promise<RemoteMemo[]> {
    const memos: RemoteMemo[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      let response;
      try {
        response = await this.request.get({
          url: this.buildListUrl(threshold, pageToken),
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          responseType: "json",
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new MemosApiError(`Request to Memos API failed: ${message}`, undefined, this.token, cause);
      }

      if (response.status < 200 || response.status >= 300) {
        throw new MemosApiError(
          `Memos API returned HTTP ${response.status}.`,
          response.text,
          this.token,
        );
      }

      const payload = validateListResponse(response.json);
      memos.push(...payload.memos);

      if (payload.nextPageToken === undefined || payload.nextPageToken === "") {
        return includeComments ? [...memos, ...await this.listComments(memos)] : memos;
      }
      if (seenTokens.has(payload.nextPageToken)) {
        throw new MemosApiError("Memos API returned a repeated page token.", undefined, this.token);
      }

      seenTokens.add(payload.nextPageToken);
      pageToken = payload.nextPageToken;
    }

    throw new MemosApiError("Memos API pagination exceeded the page limit.", undefined, this.token);
  }

  private buildListUrl(threshold: number, pageToken: string | undefined): string {
    const url = new URL(appendServerPath(this.baseUrl, "api/v1/memos"));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (threshold > 0) {
      url.searchParams.set("filter", `created_ts > ${threshold}`);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    return url.toString();
  }

  /** Memos exposes replies through a per-parent endpoint instead of returning
   * them from ListMemos. Fetch them only for threaded-note reconciliation. */
  private async listComments(memos: RemoteMemo[]): Promise<RemoteMemo[]> {
    const comments: RemoteMemo[] = [];
    for (const parent of memos) {
      if (nonEmptyString(parent.parent)) continue;
      const parentName = nonEmptyString(parent.name);
      if (!parentName) continue;
      const parentId = trailingSegment(parentName);
      if (!parentId) continue;

      const seenTokens = new Set<string>();
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        let response;
        try {
          response = await this.request.get({
            url: this.buildCommentsUrl(parentId, pageToken),
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/json",
            },
            responseType: "json",
          });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          throw new MemosApiError(`Request to Memos comments API failed: ${message}`, undefined, this.token, cause);
        }
        if (response.status < 200 || response.status >= 300) {
          throw new MemosApiError("Memos comments API returned HTTP " + response.status + ".", response.text, this.token);
        }

        const payload = validateListResponse(response.json);
        comments.push(...payload.memos.map((comment) => nonEmptyString(comment.parent)
          ? comment
          : { ...comment, parent: parentName }));
        if (payload.nextPageToken === undefined || payload.nextPageToken === "") break;
        if (seenTokens.has(payload.nextPageToken)) {
          throw new MemosApiError("Memos comments API returned a repeated page token.", undefined, this.token);
        }
        seenTokens.add(payload.nextPageToken);
        pageToken = payload.nextPageToken;
        if (page === MAX_PAGES - 1) {
          throw new MemosApiError("Memos comments API pagination exceeded the page limit.", undefined, this.token);
        }
      }
    }
    return comments;
  }

  private buildCommentsUrl(parentId: string, pageToken: string | undefined): string {
    const url = new URL(appendServerPath(this.baseUrl, `api/v1/memos/${encodeURIComponent(parentId)}/comments`));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    return url.toString();
  }
}

function validateListResponse(value: unknown): ListMemosResponse {
  if (!isRecord(value) || !Array.isArray(value.memos)) {
    throw new MemosApiError("Memos API returned an invalid list response.", undefined, "");
  }
  if (value.nextPageToken !== undefined && typeof value.nextPageToken !== "string") {
    throw new MemosApiError("Memos API returned an invalid page token.", undefined, "");
  }
  return value as unknown as ListMemosResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function trailingSegment(value: string): string | undefined {
  return value.split("/").filter(Boolean).at(-1);
}
