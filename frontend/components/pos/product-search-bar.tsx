"use client"

import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

export function ProductSearchBar({
  query,
  onQueryChange,
  onNewProduct,
}: {
  query: string
  onQueryChange: (value: string) => void
  onNewProduct: () => void
}) {
  return (
    <div className="flex gap-2.5">
      <InputGroup className="w-62.5">
        <InputGroupAddon>
          <SearchIcon className="size-3.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Cari nama atau barkode"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="text-[13px] md:text-[13px]"
        />
      </InputGroup>
      <Button type="button" onClick={onNewProduct} className="h-10 normal-case">
        + Produk baru
      </Button>
    </div>
  )
}
