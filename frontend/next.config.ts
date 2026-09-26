import type { NextConfig } from "next"

// Server-side only: the browser never learns the API origin, it only ever
// fetches relative "/api/...". No NEXT_PUBLIC_ var, no CORS dependency -- every
// browser request becomes same-origin once this rewrite is in place. Read once
// at server start, so changing it needs a `next build`/`next start` restart, not
// just an .env edit.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000"

const nextConfig: NextConfig = {
  rewrites() {
    return [
      {
        // :path* is used in the destination, so Next does NOT re-append the
        // matched params to the query string -- the original query (including
        // the snake_case status_filter param) passes through verbatim.
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
