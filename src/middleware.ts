import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    if (req.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    },
  }
)

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/cases/:path*",
    "/network/:path*",
    "/hotspots/:path*",
    "/settings/:path*",
    "/fir/upload"
  ]
}
