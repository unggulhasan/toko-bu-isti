-- Toko Bu Isti -- authoritative schema for Firebird 5.
--
-- This file, not Alembic, is the source of truth (spec 2.4): autogenerate is
-- unreliable against Firebird's rdb$ system tables, and would not produce the
-- generator, the two triggers or the expression index at all.
--
-- Statements are separated by a sentinel line (two dashes then two at-signs)
-- rather than by `;`, because the trigger bodies below contain semicolons.
-- app/schema_bootstrap.py splits on that sentinel and runs each statement in its
-- own transaction, which also
-- satisfies Firebird's rule that you cannot always alter and then use an object
-- within one transaction.
--
-- Apply with:  uv run python -m app.schema_bootstrap
-- @@
CREATE TABLE cashiers (
    id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    name VARCHAR(80) NOT NULL,
    pin VARCHAR(8) NOT NULL,
    is_active BOOLEAN NOT NULL,
    pin_active VARCHAR(8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_cashiers_pin_live UNIQUE (pin_active)
)
-- @@
CREATE TABLE products (
    id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    price BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL,
    barcode_active VARCHAR(64),
    updated_by VARCHAR(80) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_products_barcode_live UNIQUE (barcode_active),
    CONSTRAINT ck_products_price_positive CHECK (price > 0)
)
-- @@
CREATE TABLE open_sales (
    id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    "position" INTEGER NOT NULL,
    cashier_id CHAR(36) CHARACTER SET OCTETS,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_open_sales_cashier FOREIGN KEY (cashier_id)
        REFERENCES cashiers (id) ON DELETE SET NULL
)
-- @@
CREATE TABLE open_sale_lines (
    id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    sale_id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    product_id CHAR(36) CHARACTER SET OCTETS,
    barcode VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    price BIGINT NOT NULL,
    qty INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_osl_sale_barcode UNIQUE (sale_id, barcode),
    CONSTRAINT ck_osl_qty_positive CHECK (qty > 0),
    FOREIGN KEY (sale_id) REFERENCES open_sales (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
)
-- @@
CREATE TABLE transactions (
    id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    sale_number INTEGER NOT NULL,
    cashier_id CHAR(36) CHARACTER SET OCTETS,
    cashier_name VARCHAR(80) NOT NULL,
    total BIGINT NOT NULL,
    tendered BIGINT NOT NULL,
    change BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    voided_at TIMESTAMP,
    voided_by VARCHAR(80),
    PRIMARY KEY (id),
    CONSTRAINT uq_txn_sale_number UNIQUE (sale_number),
    CONSTRAINT ck_txn_tender_covers_total CHECK (tendered >= total),
    CONSTRAINT ck_txn_change_derived CHECK (change = tendered - total),
    CONSTRAINT ck_txn_status CHECK (status IN ('completed', 'voided')),
    FOREIGN KEY (cashier_id) REFERENCES cashiers (id) ON DELETE SET NULL
)
-- @@
CREATE TABLE transaction_lines (
    id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    transaction_id CHAR(36) CHARACTER SET OCTETS NOT NULL,
    product_id CHAR(36) CHARACTER SET OCTETS,
    barcode VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    price BIGINT NOT NULL,
    qty INTEGER NOT NULL,
    line_total BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
)
-- @@
-- Exact-match scan lookups: the hot path for every barcode scan.
CREATE INDEX ix_products_barcode ON products (barcode)
-- @@
-- Expression index for case-insensitive name search. Alembic would never
-- autogenerate this. Note it indexes upper(name) -- the column -- not the
-- literal string 'NAME'.
CREATE INDEX ix_products_name_upper ON products COMPUTED BY (upper(name))
-- @@
CREATE INDEX ix_open_sales_position ON open_sales ("position")
-- @@
CREATE INDEX ix_open_sale_lines_sale_id ON open_sale_lines (sale_id)
-- @@
-- Carts are scoped to the cashier who created them. app/migrations.py applies the
-- same column/index to databases created before this existed -- keep the two in
-- step.
CREATE INDEX ix_open_sales_cashier_id ON open_sales (cashier_id)
-- @@
-- Serves the transactions list and the daily stat strip.
CREATE INDEX ix_txn_created ON transactions (created_at)
-- @@
CREATE INDEX ix_txn_lines_txn_id ON transaction_lines (transaction_id)
-- @@
-- One shop-wide receipt counter (spec 1.6). A generator, not a locked counter
-- row: Firebird raises a lock conflict on write-write contention rather than
-- queueing, so a locked row would turn every concurrent checkout into a retry.
-- Generators sit outside transaction control and never block.
CREATE SEQUENCE gen_sale_number
-- @@
-- Set so the FIRST allocation returns 1043, continuing the seeded fixtures whose
-- highest saleNumber is 1042. Getting this wrong means the first real sale
-- collides with a seeded row on uq_txn_sale_number.
--
-- Verified empirically on Firebird 5.0.4: RESTART WITH n sets the value that the
-- NEXT `NEXT VALUE FOR` returns, so this yields 1043 and gen_id(...,0) reads 1042
-- beforehand. (RESTART WITH 1043 is NOT off by one here -- do not "correct" it.)
ALTER SEQUENCE gen_sale_number RESTART WITH 1043
-- @@
-- Firebird has no partial unique index. barcode_active holds the barcode while the
-- row is live and NULL once soft-deleted; UNIQUE permits unlimited NULLs, giving
-- "barcode unique among live products only". The trigger keeps it in sync so a
-- stray raw UPDATE cannot desynchronize it.
CREATE TRIGGER products_bi_bu FOR products
ACTIVE BEFORE INSERT OR UPDATE POSITION 0
AS BEGIN
  NEW.barcode_active = IIF(NEW.is_active, NEW.barcode, NULL);
END
-- @@
-- Same pattern, so a retired cashier's PIN can be handed to someone new without
-- colliding with the old row.
CREATE TRIGGER cashiers_bi_bu FOR cashiers
ACTIVE BEFORE INSERT OR UPDATE POSITION 0
AS BEGIN
  NEW.pin_active = IIF(NEW.is_active, NEW.pin, NULL);
END
