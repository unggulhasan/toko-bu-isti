"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const MOCK_PASSWORD = "kasir123"

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "")

  if (password !== MOCK_PASSWORD) {
    redirect("/login?error=1")
  }

  const cookieStore = await cookies()
  cookieStore.set("pos_session", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  })

  redirect("/")
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete("pos_session")
  redirect("/login")
}
