import { NextResponse } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "./lib/session";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;

  if (password && cookie) {
    const expected = await sessionToken(password);
    if (safeEqual(cookie, expected)) {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const target = `${pathname}${search}`;
  if (target && target !== "/") {
    url.searchParams.set("next", target);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
