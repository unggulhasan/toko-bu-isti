/**
 * Smoke test against the real FastAPI backend. Exercises every endpoint in a
 * sequence that mirrors a real shift, asserting the exact wire-format quirks
 * the frontend client depends on (camelCase, the snake_case status_filter
 * outlier, the bare-array /products/search response, the two error shapes,
 * the 200-vs-204 delete asymmetry, and the units aggregate added for the
 * transactions list).
 *
 * DESTRUCTIVE: creates and deletes a product, creates and voids a
 * transaction. Run only against a dev DB seeded with
 * `uv run python -m app.seed --reset`. Never point this at production.
 *
 * Usage:
 *   node scripts/smoke.ts                          # http://127.0.0.1:8000 direct
 *   SMOKE_BASE=http://localhost:3000 node scripts/smoke.ts   # through the Next rewrite
 */

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:8000"

type Json = Record<string, unknown>

let passed = 0
let failed = 0

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`ok   - ${name}`)
  } catch (err) {
    failed++
    console.error(`FAIL - ${name}`)
    console.error(`       ${err instanceof Error ? err.message : String(err)}`)
  }
}

type FetchResult = { status: number; body: unknown; raw: Response }

// Set after login. /api/open-sales routes are scoped to the signed-in cashier,
// so call() attaches X-Cashier-Id to them the way the frontend client does.
let openSalesCashierId = ""

async function call(
  path: string,
  init?: RequestInit & { headers?: Record<string, string> }
): Promise<FetchResult> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(openSalesCashierId && path.startsWith("/api/open-sales")
        ? { "X-Cashier-Id": openSalesCashierId }
        : {}),
      ...init?.headers,
    },
  })
  if (res.status === 204)
    return { status: res.status, body: undefined, raw: res }
  const text = await res.text()
  let body: unknown = undefined
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { status: res.status, body, raw: res }
}

async function main() {
  let cashierId = ""
  let seedProductBarcode = ""
  let newProductId = ""
  let newProductBarcode = ""
  let saleId = ""
  let lineId = ""
  let txnId = ""
  let salesCountBefore = 0
  let voidedCountBefore = 0

  await check("GET /api/health", async () => {
    const { status, body } = await call("/api/health")
    assert(status === 200, `expected 200, got ${status}`)
    assert((body as Json).status === "ok", 'expected {status:"ok"}')
  })

  await check("POST /api/auth/login (valid PIN)", async () => {
    const { status, body } = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin: "1234" }),
    })
    assert(
      status === 200,
      `expected 200, got ${status}: ${JSON.stringify(body)}`
    )
    const cashier = (body as Json).cashier as Json
    assert(
      typeof cashier.id === "string" && cashier.id.length > 0,
      "missing cashier.id"
    )
    assert(
      cashier.name === "Kasir 1",
      `expected "Kasir 1", got ${cashier.name}`
    )
    cashierId = cashier.id as string
    openSalesCashierId = cashierId
  })

  await check("POST /api/auth/login (invalid PIN)", async () => {
    const { status, body } = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin: "0000" }),
    })
    assert(status === 401, `expected 401, got ${status}`)
    const detail = (body as Json).detail as Json
    assert(!Array.isArray(detail), "expected an object detail, not an array")
    assert(
      detail.code === "INVALID_PIN",
      `expected INVALID_PIN, got ${detail.code}`
    )
  })

  await check("GET /api/products (envelope shape)", async () => {
    const { status, body } = await call("/api/products?page=0&pageSize=8")
    assert(status === 200, `expected 200, got ${status}`)
    const page = body as Json
    for (const key of ["items", "total", "page", "pageSize", "pageCount"]) {
      assert(key in page, `missing envelope key "${key}"`)
    }
    assert(page.pageSize === 8, `expected pageSize 8, got ${page.pageSize}`)
    const items = page.items as Json[]
    assert(items.length <= 8, "page returned more than pageSize items")
    assert(items.length > 0, "expected seeded products, got none")
    seedProductBarcode = items[0].barcode as string
  })

  await check("GET /api/products/barcode/{barcode} (hit)", async () => {
    const { status, body } = await call(
      `/api/products/barcode/${encodeURIComponent(seedProductBarcode)}`
    )
    assert(status === 200, `expected 200, got ${status}`)
    assert((body as Json).barcode === seedProductBarcode, "barcode mismatch")
  })

  await check("GET /api/products/barcode/{barcode} (miss)", async () => {
    const { status, body } = await call("/api/products/barcode/9999999999999")
    assert(status === 404, `expected 404, got ${status}`)
    assert(
      (body as Json & { detail: Json }).detail.code === "PRODUCT_NOT_FOUND",
      "expected PRODUCT_NOT_FOUND"
    )
  })

  await check(
    "GET /api/products/search (bare array, not the Page envelope)",
    async () => {
      const q = seedProductBarcode.slice(0, 3)
      const { status, body } = await call(
        `/api/products/search?q=${q}&limit=10`
      )
      assert(status === 200, `expected 200, got ${status}`)
      assert(Array.isArray(body), "expected a bare array")
      assert(
        (body as Json[] as unknown as { items?: unknown })["items" as never] ===
          undefined,
        "expected a bare array with no items envelope"
      )
    }
  )

  await check(
    "POST /api/products without X-Cashier-Id -> 422 array detail",
    async () => {
      const { status, body } = await call("/api/products", {
        method: "POST",
        body: JSON.stringify({
          barcode: "SMOKE-NOHEADER",
          name: "x",
          price: 1000,
        }),
      })
      assert(status === 422, `expected 422, got ${status}`)
      assert(
        Array.isArray((body as Json).detail),
        "expected validation detail to be an array"
      )
    }
  )

  await check(
    "POST /api/products with bogus X-Cashier-Id -> 400 UNKNOWN_CASHIER",
    async () => {
      const { status, body } = await call("/api/products", {
        method: "POST",
        headers: { "X-Cashier-Id": "00000000-0000-0000-0000-000000000000" },
        body: JSON.stringify({
          barcode: "SMOKE-BOGUS",
          name: "x",
          price: 1000,
        }),
      })
      assert(status === 400, `expected 400, got ${status}`)
      assert(
        (body as Json & { detail: Json }).detail.code === "UNKNOWN_CASHIER",
        "expected UNKNOWN_CASHIER"
      )
    }
  )

  await check(
    "POST /api/products (create, server-derives updatedBy)",
    async () => {
      newProductBarcode = `SMOKE-${Date.now()}`
      const { status, body } = await call("/api/products", {
        method: "POST",
        headers: { "X-Cashier-Id": cashierId },
        body: JSON.stringify({
          barcode: newProductBarcode,
          name: "Smoke Test Product",
          price: 12345,
        }),
      })
      assert(
        status === 201,
        `expected 201, got ${status}: ${JSON.stringify(body)}`
      )
      const p = body as Json
      assert(
        p.updatedBy === "Kasir 1",
        `expected updatedBy "Kasir 1", got ${p.updatedBy}`
      )
      newProductId = p.id as string
    }
  )

  await check(
    "POST /api/products (duplicate barcode) -> 409 BARCODE_TAKEN",
    async () => {
      const { status, body } = await call("/api/products", {
        method: "POST",
        headers: { "X-Cashier-Id": cashierId },
        body: JSON.stringify({
          barcode: newProductBarcode,
          name: "Dup",
          price: 1,
        }),
      })
      assert(status === 409, `expected 409, got ${status}`)
      assert(
        (body as Json & { detail: Json }).detail.code === "BARCODE_TAKEN",
        "expected BARCODE_TAKEN"
      )
    }
  )

  await check("PATCH /api/products/{id} (partial update)", async () => {
    const { status, body } = await call(`/api/products/${newProductId}`, {
      method: "PATCH",
      headers: { "X-Cashier-Id": cashierId },
      body: JSON.stringify({ price: 12345 }),
    })
    assert(status === 200, `expected 200, got ${status}`)
    assert((body as Json).price === 12345, "expected price 12345")
  })

  await check("GET /api/products/export (password gate)", async () => {
    const none = await call("/api/products/export")
    assert(none.status === 403, `no password: expected 403, got ${none.status}`)
    const noneCode = ((none.body as Json).detail as Json).code
    assert(
      noneCode === "BACKUP_PASSWORD_INVALID",
      `expected BACKUP_PASSWORD_INVALID, got ${noneCode}`
    )

    // The restore password must not open the backup endpoint.
    const wrong = await call("/api/products/export", {
      headers: { "X-Backup-Password": "CableMan01" },
    })
    assert(wrong.status === 403, `wrong password: expected 403, got ${wrong.status}`)

    const ok = await call("/api/products/export", {
      headers: { "X-Backup-Password": "WildTurkey09" },
    })
    assert(ok.status === 200, `right password: expected 200, got ${ok.status}`)
    const backup = ok.body as Json
    assert(backup.formatVersion === 1, "expected formatVersion 1")
    assert(
      backup.productCount === (backup.products as unknown[]).length,
      "productCount does not match products length"
    )
  })

  await check("POST /api/products/import (password gate)", async () => {
    // Rejected before any row is touched, so the catalog must be unchanged.
    const before = (await call("/api/products?page=0&pageSize=1")).body as Json
    for (const password of [undefined, "WildTurkey09", "wrong"]) {
      const res = await call("/api/products/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Cashier-Id": cashierId,
          ...(password ? { "X-Backup-Password": password } : {}),
        },
        body: "{}",
      })
      assert(
        res.status === 403,
        `password ${password ?? "(none)"}: expected 403, got ${res.status}`
      )
      const code = ((res.body as Json).detail as Json).code
      assert(
        code === "RESTORE_PASSWORD_INVALID",
        `expected RESTORE_PASSWORD_INVALID, got ${code}`
      )
    }
    const after = (await call("/api/products?page=0&pageSize=1")).body as Json
    assert(after.total === before.total, "catalog changed after a rejected import")
  })

  await check(
    "GET /api/open-sales (list, may be non-empty from seed)",
    async () => {
      const { status, body } = await call("/api/open-sales")
      assert(status === 200, `expected 200, got ${status}`)
      assert(Array.isArray((body as Json).items), "expected {items: [...]}")
    }
  )

  await check("POST /api/open-sales (create empty cart)", async () => {
    const { status, body } = await call("/api/open-sales", { method: "POST" })
    assert(status === 201, `expected 201, got ${status}`)
    const sale = body as Json
    assert(
      sale.total === 0 && sale.units === 0 && sale.lineCount === 0,
      "expected an empty cart"
    )
    assert(typeof sale.position === "number", "expected numeric position")
    saleId = sale.id as string
  })

  await check(
    "POST /api/open-sales/{id}/scan (first scan creates a line)",
    async () => {
      const { status, body } = await call(`/api/open-sales/${saleId}/scan`, {
        method: "POST",
        body: JSON.stringify({ barcode: newProductBarcode }),
      })
      assert(
        status === 200,
        `expected 200, got ${status}: ${JSON.stringify(body)}`
      )
      const res = body as Json
      assert(res.created === true, "expected created: true on first scan")
      const sale = res.sale as Json
      assert(
        sale.lineCount === 1 && sale.total === 12345,
        "expected one line, total 12345"
      )
      lineId = res.scannedLineId as string
    }
  )

  await check(
    "POST /api/open-sales/{id}/scan (same barcode merges, qty+1)",
    async () => {
      const { status, body } = await call(`/api/open-sales/${saleId}/scan`, {
        method: "POST",
        body: JSON.stringify({ barcode: newProductBarcode }),
      })
      assert(status === 200, `expected 200, got ${status}`)
      const res = body as Json
      assert(res.created === false, "expected created: false on merge")
      assert(res.scannedLineId === lineId, "expected the same line id on merge")
      const sale = res.sale as Json
      const lines = sale.lines as Json[]
      assert(lines.length === 1, "expected merge, not a second line")
      assert(
        sale.units === 2 && sale.total === 24690,
        "expected qty 2, total 24690"
      )
    }
  )

  await check(
    "POST /api/open-sales/{id}/scan (unknown barcode) -> 404",
    async () => {
      const { status, body } = await call(`/api/open-sales/${saleId}/scan`, {
        method: "POST",
        body: JSON.stringify({ barcode: "NOPE-NOT-A-PRODUCT" }),
      })
      assert(status === 404, `expected 404, got ${status}`)
      const detail = (body as Json).detail as Json
      assert(detail.code === "PRODUCT_NOT_FOUND", "expected PRODUCT_NOT_FOUND")
      assert(
        typeof detail.message === "string" &&
          detail.message.includes("tidak ditemukan"),
        "expected the Indonesian not-found message the UI renders verbatim"
      )
    }
  )

  await check(
    "PATCH /api/open-sales/{id}/lines/{lineId} (set qty)",
    async () => {
      const { status, body } = await call(
        `/api/open-sales/${saleId}/lines/${lineId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ qty: 3 }),
        }
      )
      assert(status === 200, `expected 200, got ${status}`)
      assert((body as Json).units === 3, "expected units 3 after setting qty")
    }
  )

  await check(
    "POST /api/transactions (insufficient tender) -> 400 with numeric extras",
    async () => {
      const { status, body } = await call("/api/transactions", {
        method: "POST",
        headers: { "X-Cashier-Id": cashierId },
        body: JSON.stringify({ openSaleId: saleId, tendered: 1 }),
      })
      assert(status === 400, `expected 400, got ${status}`)
      const detail = (body as Json).detail as Json
      assert(
        detail.code === "INSUFFICIENT_TENDER",
        "expected INSUFFICIENT_TENDER"
      )
      assert(
        typeof detail.total === "number" && typeof detail.tendered === "number",
        "expected numeric total/tendered extras for the dialog to self-correct with"
      )
    }
  )

  await check(
    "POST /api/transactions (checkout) -> 201 with numeric saleNumber",
    async () => {
      const { status, body } = await call("/api/transactions", {
        method: "POST",
        headers: { "X-Cashier-Id": cashierId },
        body: JSON.stringify({ openSaleId: saleId, tendered: 42345 }),
      })
      assert(
        status === 201,
        `expected 201, got ${status}: ${JSON.stringify(body)}`
      )
      const txn = body as Json
      assert(
        typeof txn.saleNumber === "number",
        "expected a numeric saleNumber, not null"
      )
      assert(txn.change === 42345 - 37035, `unexpected change: ${txn.change}`)
      assert(txn.status === "completed", "expected status completed")
      assert(txn.cashierName === "Kasir 1", 'expected cashierName "Kasir 1"')
      txnId = txn.id as string
    }
  )

  await check(
    "GET /api/open-sales/{id} after checkout -> 404 (cart consumed)",
    async () => {
      const { status, body } = await call(`/api/open-sales/${saleId}`)
      assert(status === 404, `expected 404, got ${status}`)
      assert(
        (body as Json & { detail: Json }).detail.code === "OPEN_SALE_NOT_FOUND",
        "expected OPEN_SALE_NOT_FOUND"
      )
    }
  )

  await check(
    "GET /api/transactions (list omits lines, carries units)",
    async () => {
      const { status, body } = await call(
        "/api/transactions?page=0&pageSize=25&status_filter=all"
      )
      assert(status === 200, `expected 200, got ${status}`)
      const items = (body as Json).items as Json[]
      assert(items.length > 0, "expected at least one transaction")
      assert(items[0].lines === undefined, "list items must not carry lines")
      assert(
        typeof items[0].units === "number",
        "expected a numeric units aggregate"
      )
      salesCountBefore = items.filter((t) => t.status === "completed").length
      voidedCountBefore = items.filter((t) => t.status === "voided").length
    }
  )

  await check(
    "GET /api/transactions?status_filter=voided vs statusFilter (casing matters)",
    async () => {
      const snake = await call("/api/transactions?status_filter=voided")
      const camel = await call("/api/transactions?statusFilter=voided")
      const snakeItems = (snake.body as Json).items as Json[]
      const camelItems = (camel.body as Json).items as Json[]
      assert(
        snakeItems.every((t) => t.status === "voided"),
        "status_filter=voided should return only voided transactions"
      )
      assert(
        camelItems.some((t) => t.status === "completed"),
        "statusFilter (camelCase) is silently ignored -- this must still return completed rows too"
      )
    }
  )

  await check("GET /api/transactions/{id} (detail has lines)", async () => {
    const { status, body } = await call(`/api/transactions/${txnId}`)
    assert(status === 200, `expected 200, got ${status}`)
    const lines = (body as Json).lines as Json[]
    assert(
      Array.isArray(lines) && lines.length === 1,
      "expected one line on the detail"
    )
  })

  await check("GET /api/transactions/summary", async () => {
    const { status, body } = await call("/api/transactions/summary")
    assert(status === 200, `expected 200, got ${status}`)
    const s = body as Json
    for (const key of ["salesCount", "gross", "cashInDrawer", "voidedCount"]) {
      assert(typeof s[key] === "number", `expected numeric ${key}`)
    }
    assert(
      (s.salesCount as number) >= 1,
      "expected at least one completed sale today"
    )
  })

  await check(
    "Empty-cart checkout -> 400 EMPTY_SALE, then a clean 204 delete",
    async () => {
      const created = await call("/api/open-sales", { method: "POST" })
      const emptyId = (created.body as Json).id as string
      const { status, body } = await call("/api/transactions", {
        method: "POST",
        headers: { "X-Cashier-Id": cashierId },
        body: JSON.stringify({ openSaleId: emptyId, tendered: 0 }),
      })
      assert(status === 400, `expected 400, got ${status}`)
      assert(
        (body as Json & { detail: Json }).detail.code === "EMPTY_SALE",
        "expected EMPTY_SALE"
      )
      const del = await call(`/api/open-sales/${emptyId}`, { method: "DELETE" })
      assert(del.status === 204, `expected 204, got ${del.status}`)
      assert(del.body === undefined, "expected a truly empty 204 body")
    }
  )

  await check("POST /api/transactions/{id}/void -> 200", async () => {
    const { status, body } = await call(`/api/transactions/${txnId}/void`, {
      method: "POST",
      headers: { "X-Cashier-Id": cashierId },
    })
    assert(status === 200, `expected 200, got ${status}`)
    const txn = body as Json
    assert(txn.status === "voided", "expected status voided")
    assert(
      txn.voidedBy === "Kasir 1",
      `expected voidedBy "Kasir 1", got ${txn.voidedBy}`
    )
    assert(txn.voidedAt !== null, "expected voidedAt to be set")
  })

  await check(
    "POST /api/transactions/{id}/void again -> 409 ALREADY_VOIDED",
    async () => {
      const { status, body } = await call(`/api/transactions/${txnId}/void`, {
        method: "POST",
        headers: { "X-Cashier-Id": cashierId },
      })
      assert(status === 409, `expected 409, got ${status}`)
      assert(
        (body as Json & { detail: Json }).detail.code === "ALREADY_VOIDED",
        "expected ALREADY_VOIDED"
      )
    }
  )

  await check(
    "GET /api/transactions/summary (counts moved after void)",
    async () => {
      const { body } = await call("/api/transactions/summary")
      const s = body as Json
      assert(
        (s.voidedCount as number) >= voidedCountBefore + 1,
        "expected voidedCount to have increased"
      )
    }
  )

  await check(
    "DELETE /api/products/{id} without X-Cashier-Id -> 204 (documented asymmetry)",
    async () => {
      const { status } = await call(`/api/products/${newProductId}`, {
        method: "DELETE",
      })
      assert(status === 204, `expected 204, got ${status}`)
    }
  )

  await check(
    "GET /api/products/barcode/{barcode} after delete -> 404 (soft delete)",
    async () => {
      const { status } = await call(
        `/api/products/barcode/${newProductBarcode}`
      )
      assert(status === 404, `expected 404, got ${status}`)
    }
  )

  console.log("")
  console.log(`${passed} passed, ${failed} failed (base: ${BASE})`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error("Smoke script crashed:", err)
  process.exit(1)
})
