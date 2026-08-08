/**
 * Appends a server-relative API path without allowing a leading slash to
 * replace a configured reverse-proxy subpath.
 */
export function appendServerPath(baseUrl: string, serverPath: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${serverPath.replace(/^\/+/, "")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
