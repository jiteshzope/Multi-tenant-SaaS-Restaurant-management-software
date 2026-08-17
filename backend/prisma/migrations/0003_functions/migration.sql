-- 0003_functions
-- Helper functions. Created before 0004_triggers, which attaches them.

-- ---------------------------------------------------------------------------
-- Auto-maintain updated_at on every UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- An order may never be attached to a session that is already billed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_session_open()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status session_status;
BEGIN
    SELECT status INTO v_status
    FROM table_sessions
    WHERE id = NEW.table_session_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Table session % does not exist', NEW.table_session_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_status <> 'OPEN' THEN
        RAISE EXCEPTION 'Cannot add an order to a % session', v_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- restaurant_tables.status follows table_sessions — one source of truth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_table_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE restaurant_tables
        SET status = 'OCCUPIED'
        WHERE id = NEW.table_id;

    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'CLOSED'
          AND OLD.status = 'OPEN' THEN
        UPDATE restaurant_tables
        SET status = 'VACANT'
        WHERE id = NEW.table_id;
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Per-restaurant order numbering (#1, #2 …). Atomic upsert: two waiters
-- submitting in the same millisecond get different numbers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_order_number(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_next integer;
BEGIN
    INSERT INTO restaurant_counters AS c (restaurant_id, last_order_number)
    VALUES (p_restaurant_id, 1)
    ON CONFLICT (restaurant_id)
    DO UPDATE SET last_order_number = c.last_order_number + 1
    RETURNING c.last_order_number INTO v_next;

    RETURN v_next;
END;
$$;
