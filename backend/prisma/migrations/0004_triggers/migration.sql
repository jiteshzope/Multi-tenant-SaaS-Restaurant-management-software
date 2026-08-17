-- 0004_triggers
-- Attach the functions from 0003 to their tables.

-- updated_at maintenance -----------------------------------------------------
CREATE TRIGGER trg_restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_restaurant_users_updated_at
    BEFORE UPDATE ON restaurant_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_restaurant_tables_updated_at
    BEFORE UPDATE ON restaurant_tables
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_categories_updated_at
    BEFORE UPDATE ON menu_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- business rules -------------------------------------------------------------
CREATE TRIGGER trg_session_sync_table
    AFTER INSERT OR UPDATE ON table_sessions
    FOR EACH ROW EXECUTE FUNCTION sync_table_status();

CREATE TRIGGER trg_orders_session_open
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION assert_session_open();
