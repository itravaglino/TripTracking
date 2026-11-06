import { json, redirect } from "@/lib/http";
import { allowsMutation, clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!allowsMutation(request)) return json(request, { error: "forbidden" }, 403);
  const headers = new Headers();
  headers.append("set-cookie", clearSessionCookie());
  return json(request, { ok: true }, 200, headers);
}

export async function GET(request: Request) {
  return redirect(new URL("/", request.url).toString(), [clearSessionCookie()]);
}
