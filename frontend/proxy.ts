import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "pos_session"

export function proxy(request: NextRequest) {
  const isLoggedIn = request.cookies.has(SESSION_COOKIE)
  const { pathname } = request.nextUrl

  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
}
