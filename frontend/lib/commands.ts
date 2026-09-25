export type CommandName =
  | "pay"
  | "new"
  | "next"
  | "void"
  | "qty"

export type CommandDefinition = {
  name: CommandName
  label: string
  aliases: string[]
  description: string
  takesArg?: boolean
}

export const COMMANDS: CommandDefinition[] = [
  { name: "pay", label: "Bayar", aliases: ["bayar"], description: "Buka pembayaran tunai · F9" },
  { name: "new", label: "Transaksi baru", aliases: ["baru"], description: "Mulai transaksi baru" },
  { name: "next", label: "Transaksi berikutnya", aliases: ["lanjut", "next"], description: "Pindah ke transaksi lain · F3" },
  { name: "void", label: "Hapus baris", aliases: ["hapus", "void", "remove"], description: "Hapus baris yang dipilih" },
  { name: "qty", label: "Ubah jumlah", aliases: ["qty", "jumlah"], description: "Ubah jumlah baris yang dipilih", takesArg: true },
]

export function matchCommandsByAlias(alias: string): CommandDefinition | undefined {
  const needle = alias.toLowerCase()
  return COMMANDS.find((c) => c.aliases.includes(needle))
}

export function matchCommandsByPrefix(prefix: string): CommandDefinition[] {
  const needle = prefix.toLowerCase()
  if (!needle) return COMMANDS
  return COMMANDS.filter((c) => c.aliases.some((a) => a.startsWith(needle)))
}
