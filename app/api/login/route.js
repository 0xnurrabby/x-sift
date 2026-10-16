import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, safeEqual, sessionToken } from "../../../lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json(
      { error: "This site has no APP_PASSWORD configured yet." },
      { status: 500 }
    );
  }

  let submitted = "";
  try {
    const body = await request.json();
    submitted = typeof body?.password === "string" ? body.password : "";
  } catch {
    submitted = "";
  }

  if (!submitted || !safeEqual(submitted, password)) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await sessionToken(password),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
