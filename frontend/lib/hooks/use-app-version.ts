"use client"

import { useQuery } from "@tanstack/react-query"

import * as api from "@/lib/api/app"
import { queryKeys } from "@/lib/api/query-keys"

/** The running backend's version, for display only (debugging). Fetched once;
 * it can only change when the server restarts. */
export function useAppVersion() {
  return useQuery({
    queryKey: queryKeys.appVersion,
    queryFn: api.getAppVersion,
    staleTime: Infinity,
  })
}
