-- 0006_check_constraints
-- CHECK constraints and the one composite foreign key Prisma cannot declare
-- (Order already owns a composite relation to TableSession on
-- (table_session_id, restaurant_id); a second relation to the same model on
-- (table_session_id, table_id) is not expressible in schema.prisma).

-- restaurants ---------------------------------------------------------------
ALTER TABLE restaurants
    ADD CONSTRAINT ck_restaurants_name CHECK (length(btrim(name)) > 0),
    ADD CONSTRAINT ck_restaurants_tax  CHECK (tax_percent >= 0 AND tax_percent <= 100);

-- users ---------------------------------------------------------------------
ALTER TABLE users
    ADD CONSTRAINT ck_users_email CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    ADD CONSTRAINT ck_users_name  CHECK (length(btrim(name)) > 0);

-- refresh_tokens ------------------------------------------------------------
ALTER TABLE refresh_tokens
    ADD CONSTRAINT ck_refresh_expiry CHECK (expires_at > created_at),
    ADD CONSTRAINT ck_refresh_revoked
        CHECK ((revoked_at IS NULL AND revoked_reason IS NULL)
            OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL));

-- restaurant_tables ---------------------------------------------------------
ALTER TABLE restaurant_tables
    ADD CONSTRAINT ck_table_number   CHECK (table_number > 0),
    ADD CONSTRAINT ck_table_capacity CHECK (capacity BETWEEN 1 AND 50);

-- table_waiter_assignments --------------------------------------------------
ALTER TABLE table_waiter_assignments
    ADD CONSTRAINT ck_twa_dates
        CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at);

-- menu ----------------------------------------------------------------------
ALTER TABLE menu_categories
    ADD CONSTRAINT ck_category_name CHECK (length(btrim(name)) > 0);

ALTER TABLE menu_items
    ADD CONSTRAINT ck_item_price CHECK (price >= 0),
    ADD CONSTRAINT ck_item_name  CHECK (length(btrim(name)) > 0);

-- table_sessions ------------------------------------------------------------
-- status and closed_at can never contradict each other.
ALTER TABLE table_sessions
    ADD CONSTRAINT ck_session_closed
        CHECK (
            (status = 'OPEN'   AND closed_at IS NULL) OR
            (status = 'CLOSED' AND closed_at IS NOT NULL)
        );

-- orders --------------------------------------------------------------------
-- Guarantees orders.table_id always equals its session's table_id.
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_session_table
        FOREIGN KEY (table_session_id, table_id)
        REFERENCES table_sessions (id, table_id) ON DELETE CASCADE;

-- order_items ---------------------------------------------------------------
ALTER TABLE order_items
    ADD CONSTRAINT ck_order_item_qty   CHECK (quantity > 0),
    ADD CONSTRAINT ck_order_item_price CHECK (unit_price >= 0);
