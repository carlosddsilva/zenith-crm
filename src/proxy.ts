import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/validation/uuid";

const SESSION_COOKIE_NAME =
  process.env.AUTH_SESSION_COOKIE_NAME ?? "zenith_session";

const protectedPaths = [
  "/dashboard",
  "/inbox",
  "/contacts",
  "/companies",
  "/pipelines",
  "/tasks",
  "/broadcasts",
  "/automations",
  "/zenith-calls",
  "/ivr",
  "/settings",
] as const;

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const uuidResources = new Set([
  "automations", "broadcasts", "calls", "companies", "contacts", "conversations",
  "custom-fields", "deals", "ivr-flows", "messaging-channels", "notes", "appointments", "pipelines",
  "tags", "tasks", "voice-channels",
]);
function hasMalformedResourceId(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "zenith" || !uuidResources.has(segments[2]) || !segments[3]) return false;
  if (segments[2] === "contacts" && segments[3] === "bulk") return false;
  return !isUuid(segments[3]);
}

function isProtectedPath(pathname: string) {
  return protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function requestOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.slice(0, -1);

  return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === requestOrigin(request);
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (hasMalformedResourceId(pathname)) {
    return NextResponse.json({ error: "Invalid resource identifier" }, { status: 400 });
  }

  if (pathname === "/zenith-login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedPath(pathname) && !hasSession) {
    return NextResponse.redirect(new URL("/zenith-login", request.url));
  }

  const isCookieMutation =
    unsafeMethods.has(request.method) &&
    (pathname.startsWith("/api/zenith/") ||
      pathname === "/api/auth/zenith/logout");

  if (isCookieMutation && !hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
