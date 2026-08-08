import { normalizeFolderPath, sanitizeAttachmentFilenamePart } from "../core/paths";
import type { RemoteResource, SyncDiagnostic } from "../core/types";
import { appendServerPath } from "../core/url";

export const GENERIC_EXTERNAL_RESOURCE_LABEL = "resource";

export interface PlannedResource {
  kind: "external" | "local";
  markdown: string;
  path?: string;
  url?: string;
  resourceId?: string;
}

export interface ResourcePlanResult {
  items: PlannedResource[];
  diagnostics: SyncDiagnostic[];
}

export interface ResourcePlanOptions {
  apiUrl: string;
  attachmentFolder: string;
  skipImages: boolean;
}

export function planResources(
  resources: RemoteResource[],
  options: ResourcePlanOptions,
): ResourcePlanResult {
  const items: PlannedResource[] = [];
  const diagnostics: SyncDiagnostic[] = [];
  const attachmentFolder = normalizeFolderPath(options.attachmentFolder, "attachments");

  for (const candidate of resources as unknown[]) {
    if (!isRecord(candidate)) {
      diagnostics.push({
        severity: "error",
        stage: "attachment",
        message: "Resource entry is malformed and was skipped.",
      });
      continue;
    }
    const resource = toRemoteResource(candidate);
    const externalLink = nonEmpty(resource.externalLink);
    const image = resource.type?.toLocaleLowerCase().includes("image") ?? false;
    if (image && options.skipImages) {
      continue;
    }

    if (externalLink) {
      const label = resourceLabel(resource);
      items.push({
        kind: "external",
        markdown: image ? `![${label}](${externalLink})` : `[${label}](${externalLink})`,
      });
      continue;
    }

    const nameSegments = pathSegments(resource.name);
    const identity = nonEmpty(resource.id) ?? nonEmpty(resource.uid) ?? nameSegments.at(-1);
    const filename = nonEmpty(resource.filename) ?? usableFilename(nameSegments.at(-1));
    if (!identity || !filename) {
      diagnostics.push({
        severity: "warning",
        stage: "attachment",
        ...(identity ? { resourceId: identity } : {}),
        message: "Resource is missing a local identity or filename and was skipped.",
      });
      continue;
    }

    const endpoint = endpointFor(resource, nameSegments, filename, identity);
    const localFilename = `${sanitizeAttachmentFilenamePart(identity)}-${sanitizeAttachmentFilenamePart(filename)}`;
    const normalizedApiUrl = options.apiUrl.replace(/\/+$/, "");
    items.push({
      kind: "local",
      markdown: `![[${localFilename}]]`,
      path: `${attachmentFolder}/${localFilename}`,
      url: appendServerPath(normalizedApiUrl, endpoint),
      resourceId: identity,
    });
  }

  return { items, diagnostics };
}

function endpointFor(
  resource: RemoteResource,
  nameSegments: string[],
  filename: string,
  identity: string,
): string {
  if (nameSegments[0] === "attachments" && nonEmpty(resource.uid)) {
    return `/file/attachments/${encodeURIComponent(resource.uid!)}/${encodeURIComponent(filename)}`;
  }
  if (nameSegments[0] === "resources" && nameSegments.length > 0) {
    return `/file/resources/${encodeURIComponent(nameSegments.at(-1)!)}${`/${encodeURIComponent(filename)}`}`;
  }
  return `/o/r/${encodeURIComponent(nonEmpty(resource.uid) ?? nonEmpty(resource.id) ?? identity)}`;
}

function resourceLabel(resource: RemoteResource): string {
  return nonEmpty(resource.name) ?? nonEmpty(resource.filename) ?? GENERIC_EXTERNAL_RESOURCE_LABEL;
}

function pathSegments(value: string | undefined): string[] {
  return value?.split("/").filter(Boolean) ?? [];
}

function usableFilename(value: string | undefined): string | undefined {
  const filename = nonEmpty(value);
  return filename === "." || filename === ".." ? undefined : filename;
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function toRemoteResource(value: Record<string, unknown>): RemoteResource {
  return {
    ...(stringValue(value.id) ? { id: stringValue(value.id) } : {}),
    ...(stringValue(value.uid) ? { uid: stringValue(value.uid) } : {}),
    ...(stringValue(value.name) ? { name: stringValue(value.name) } : {}),
    ...(stringValue(value.filename) ? { filename: stringValue(value.filename) } : {}),
    ...(stringValue(value.type) ? { type: stringValue(value.type) } : {}),
    ...(stringValue(value.externalLink) ? { externalLink: stringValue(value.externalLink) } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
