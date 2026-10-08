import { request } from "@/lib/api/client"
import type { AppVersion } from "@/lib/types"

export function getAppVersion(): Promise<AppVersion> {
  return request("/api/app/version")
}
