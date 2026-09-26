export type CommandName = "pay" | "new" | "deleteSale" | "cari"

export type CommandDefinition = {
  name: CommandName
  label: string
  aliases: string[]
  description: string
  takesArg?: boolean
}

export const COMMANDS: CommandDefinition[] = [
  {
    name: "pay",
    label: "Bayar",
    aliases: ["bayar"],
    description: "Buka pembayaran tunai · F9",
  },
  {
    name: "new",
    label: "Transaksi baru",
    aliases: ["baru"],
    description: "Mulai transaksi baru",
  },
  {
    name: "deleteSale",
    label: "Hapus transaksi",
    aliases: ["hapus"],
    description: "Hapus transaksi yang aktif",
  },
  {
    name: "cari",
    label: "Cari barang",
    aliases: ["cari", "find"],
    description: "Cari barang berdasarkan nama",
  },
]

export function matchCommandsByAlias(
  alias: string
): CommandDefinition | undefined {
  const needle = alias.toLowerCase()
  return COMMANDS.find((c) => c.aliases.includes(needle))
}

export function matchCommandsByPrefix(prefix: string): CommandDefinition[] {
  const needle = prefix.toLowerCase()
  if (!needle) return COMMANDS
  return COMMANDS.filter((c) => c.aliases.some((a) => a.startsWith(needle)))
}

// Separate from COMMANDS/CommandName above: ScanInput and TransactionLookupInput
// are different inputs on different pages, never composed together, and
// ScanInput's runCommand switch is exhaustive on CommandName. Mixing a
// transactions-page-only command into that union would force ScanInput to
// handle a case that can never fire there.
export type TransactionCommandName = "laporanHarian"

export type TransactionCommandDefinition = {
  name: TransactionCommandName
  label: string
  aliases: string[]
  description: string
}

export const TRANSACTION_COMMANDS: TransactionCommandDefinition[] = [
  {
    name: "laporanHarian",
    label: "Laporan harian",
    aliases: ["laporan-harian", "laporan"],
    description: "Cetak laporan transaksi harian",
  },
]

export function matchTransactionCommandsByAlias(
  alias: string
): TransactionCommandDefinition | undefined {
  const needle = alias.toLowerCase()
  return TRANSACTION_COMMANDS.find((c) => c.aliases.includes(needle))
}

export function matchTransactionCommandsByPrefix(
  prefix: string
): TransactionCommandDefinition[] {
  const needle = prefix.toLowerCase()
  if (!needle) return TRANSACTION_COMMANDS
  return TRANSACTION_COMMANDS.filter((c) =>
    c.aliases.some((a) => a.startsWith(needle))
  )
}
