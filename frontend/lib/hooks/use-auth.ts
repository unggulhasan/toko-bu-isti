import { useMutation } from "@tanstack/react-query"

import * as api from "@/lib/api/auth"

export function useLogin() {
  return useMutation({
    mutationFn: (pin: string) => api.login(pin),
  })
}
