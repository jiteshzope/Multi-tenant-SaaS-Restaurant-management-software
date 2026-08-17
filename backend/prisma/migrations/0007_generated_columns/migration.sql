-- 0007_generated_columns
-- order_items.line_total. 0002_init emitted it as a plain nullable numeric
-- (all Prisma can express); drop that and re-add it as a stored generated
-- column so unit_price * quantity can never disagree with its inputs.
--
-- The Prisma model keeps it as `lineTotal Decimal? @db.Decimal(12,2)` and the
-- application NEVER writes to it.

ALTER TABLE order_items DROP COLUMN IF EXISTS line_total;

ALTER TABLE order_items
    ADD COLUMN line_total numeric(12,2)
    GENERATED ALWAYS AS (unit_price * quantity) STORED;
