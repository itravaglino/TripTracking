const ALLOWED_ORIGINS = new Set([
  "https://travaglino.me",
  "https://www.travaglino.me",
  "https://itravaglino.github.io",
]);

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && (ALLOWED_ORIGINS.has(origin) || isLocal(origin))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-headers", "authorization, content-type");
    headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  }
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

function isLocal(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

export function json(request: Request, body: unknown, status = 200, extra?: Headers): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  extra?.forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

export function empty(request: Request, status = 204): Response {
  return new Response(null, { status, headers: corsHeaders(request) });
}

export function redirect(location: string, cookies?: string[]): Response {
  const headers = new Headers({ location, "cache-control": "private, no-store" });
  for (const cookie of cookies ?? []) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}
