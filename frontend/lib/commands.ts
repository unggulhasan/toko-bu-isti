export type CommandName =
  | "pay"
  | "new"
  | "deleteSale"
  | "cari"

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
  { name: "deleteSale", label: "Hapus transaksi", aliases: ["hapus"], description: "Hapus transaksi yang aktif" },
  { name: "cari", label: "Cari barang", aliases: ["cari", "find"], description: "Cari barang berdasarkan nama" },
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
