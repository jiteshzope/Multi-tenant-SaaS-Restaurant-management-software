-- 0005_partial_indexes
-- Every WHERE-filtered unique + performance index. Prisma cannot declare these.

-- Uniqueness rules the application must never be able to violate ------------

-- Exactly one active OWNER and one active KITCHEN handler per restaurant.
-- Waiters are unconstrained.
CREATE UNIQUE INDEX uq_one_active_owner_per_restaurant
    ON restaurant_users (restaurant_id)
    WHERE role = 'OWNER' AND is_active;

CREATE UNIQUE INDEX uq_one_active_kitchen_per_restaurant
    ON restaurant_users (restaurant_id)
    WHERE role = 'KITCHEN' AND is_active;

-- One active waiter per table; closed rows keep the history.
CREATE UNIQUE INDEX uq_active_assignment_per_table
    ON table_waiter_assignments (table_id)
    WHERE unassigned_at IS NULL;

-- One OPEN session per table — two waiters tapping at once cannot both win.
CREATE UNIQUE INDEX uq_one_open_session_per_table
    ON table_sessions (table_id)
    WHERE status = 'OPEN';

-- Performance indexes -------------------------------------------------------

CREATE INDEX idx_ru_restaurant       ON restaurant_users (restaurant_id, role) WHERE is_active;

CREATE INDEX idx_refresh_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

CREATE INDEX idx_tables_restaurant   ON restaurant_tables (restaurant_id, table_number)
                                     WHERE is_active;

CREATE INDEX idx_twa_waiter_active   ON table_waiter_assignments (restaurant_id, waiter_user_id)
                                     WHERE unassigned_at IS NULL;

CREATE INDEX idx_categories_rest     ON menu_categories (restaurant_id, display_order)
                                     WHERE is_active;

CREATE INDEX idx_items_category      ON menu_items (restaurant_id, category_id, display_order)
                                     WHERE is_active;

-- Search bar:  WHERE name ILIKE '%biry%'
CREATE INDEX idx_items_name_trgm     ON menu_items USING gin (name gin_trgm_ops);

CREATE INDEX idx_sessions_open       ON table_sessions (restaurant_id, table_id)
                                     WHERE status = 'OPEN';

-- The kitchen board's main query. Stays tiny forever: COMPLETED rows are excluded.
CREATE INDEX idx_orders_kitchen      ON orders (restaurant_id, status, placed_at)
                                     WHERE status IN ('PENDING', 'PREPARING');
