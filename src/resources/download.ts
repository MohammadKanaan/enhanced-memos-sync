import { normalizeServerBody, redactApiToken } from "../core/diagnostics";
import type { SyncDiagnostic } from "../core/types";
import type { RequestPort } from "../sync/ports";
import type { PlannedResource } from "./resources";

export interface AttachmentVaultPort {
  ensureFolder(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  writeBinaryIfAbsent(path: string, data: ArrayBuffer): Promise<"created" | "existing">;
}

export interface DownloadResult {
  downloaded: number;
  diagnostics: SyncDiagnostic[];
}

export async function downloadMissingAttachments(
  resources: PlannedResource[],
  vault: AttachmentVaultPort,
  request: RequestPort,
  token: string,
): Promise<DownloadResult> {
  const localResources = resources.filter(
    (resource): resource is PlannedResource & { path: string; url: string } =>
      resource.kind === "local" && Boolean(resource.path && resource.url),
  );
  const diagnostics: SyncDiagnostic[] = [];
  let downloaded = 0;

  const unavailableFolders = new Set<string>();
  for (const folder of new Set(localResources.map((resource) => resource.path.slice(0, resource.path.lastIndexOf("/"))))) {
    try {
      await vault.ensureFolder(folder);
    } catch (error) {
      unavailableFolders.add(folder);
      diagnostics.push({
        severity: "error",
        stage: "attachment",
        path: folder,
        message: redactApiToken(`Attachment folder setup failed: ${error instanceof Error ? error.message : String(error)}`, token),
      });
    }
  }

  for (const resource of localResources) {
    const folder = resource.path.slice(0, resource.path.lastIndexOf("/"));
    if (unavailableFolders.has(folder)) continue;
    try {
      if (await vault.exists(resource.path)) {
        continue;
      }
      const response = await request.get({
        url: resource.url,
        headers: { Authorization: `Bearer ${token}` },
        responseType: "arrayBuffer",
      });
      if (response.status < 200 || response.status >= 300 || !response.arrayBuffer) {
        diagnostics.push(downloadDiagnostic(resource, response.text, token));
        continue;
      }
      const result = await vault.writeBinaryIfAbsent(resource.path, response.arrayBuffer);
      if (result === "created") {
        downloaded += 1;
      }
    } catch (error) {
      diagnostics.push(
        downloadDiagnostic(
          resource,
          error instanceof Error ? error.message : String(error),
          token,
        ),
      );
    }
  }

  return { downloaded, diagnostics };
}

function downloadDiagnostic(resource: PlannedResource, detail: string, token: string): SyncDiagnostic {
  return {
    severity: "error",
    stage: "attachment",
    ...(resource.resourceId ? { resourceId: resource.resourceId } : {}),
    ...(resource.path ? { path: resource.path } : {}),
    message: `Attachment download failed: ${normalizeServerBody(redactApiToken(detail, token))}`,
  };
}
