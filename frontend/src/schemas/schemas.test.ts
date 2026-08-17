import { describe, expect, it } from 'vitest';
import {
  bulkTablesSchema,
  createTableSchema,
  menuItemSchema,
  placeOrderSchema,
  settingsSchema,
} from './index';

/**
 * Boundary values that mirror the CHECK constraints in database/CLAUDE.md.
 * Client validation is UX; the database is the guarantee — these tests only
 * prove the two agree.
 */
describe('schemas', () => {
  it('accepts capacity 1–50 and rejects 0 and 51 (ck_table_capacity)', () => {
    const base = { tableNumber: 1, label: '' };
    expect(createTableSchema.safeParse({ ...base, capacity: 1 }).success).toBe(true);
    expect(createTableSchema.safeParse({ ...base, capacity: 50 }).success).toBe(true);
    expect(createTableSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(createTableSchema.safeParse({ ...base, capacity: 51 }).success).toBe(false);
  });

  it('rejects table number 0 (ck_table_number)', () => {
    expect(createTableSchema.safeParse({ tableNumber: 0, capacity: 4 }).success).toBe(false);
    expect(createTableSchema.safeParse({ tableNumber: 1, capacity: 4 }).success).toBe(true);
  });

  it('rejects tax above 100 (ck_restaurants_tax)', () => {
    const base = { name: 'Spice', phone: '', address: '', timezone: 'Asia/Kolkata' };
    expect(settingsSchema.safeParse({ ...base, taxPercent: '0' }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, taxPercent: '100' }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, taxPercent: '101' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, taxPercent: '5.005' }).success).toBe(false);
  });

  it('accepts a price as a decimal string and rejects three decimals (numeric(10,2))', () => {
    const base = {
      categoryId: '11111111-1111-1111-1111-111111111111',
      name: 'Chicken Biryani',
      description: '',
      isVeg: 'nonveg' as const,
    };
    expect(menuItemSchema.safeParse({ ...base, price: '250' }).success).toBe(true);
    expect(menuItemSchema.safeParse({ ...base, price: '250.00' }).success).toBe(true);
    expect(menuItemSchema.safeParse({ ...base, price: '12.345' }).success).toBe(false);
    expect(menuItemSchema.safeParse({ ...base, price: '-5.00' }).success).toBe(false);
    expect(menuItemSchema.safeParse({ ...base, price: 'free' }).success).toBe(false);
  });

  it('rejects quantity 0 and an empty cart (ck_order_item_qty)', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const menuItemId = '22222222-2222-2222-2222-222222222222';

    expect(placeOrderSchema.safeParse({ sessionId, items: [] }).success).toBe(false);
    expect(
      placeOrderSchema.safeParse({ sessionId, items: [{ menuItemId, quantity: 0 }] }).success,
    ).toBe(false);
    expect(
      placeOrderSchema.safeParse({ sessionId, items: [{ menuItemId, quantity: 1 }] }).success,
    ).toBe(true);
  });

  it('strips a price smuggled into the order payload', () => {
    const parsed = placeOrderSchema.parse({
      sessionId: '11111111-1111-1111-1111-111111111111',
      items: [
        {
          menuItemId: '22222222-2222-2222-2222-222222222222',
          quantity: 2,
          unitPrice: '1.00',
        },
      ],
    });
    expect(parsed.items[0]).not.toHaveProperty('unitPrice');
  });

  it('requires `to` >= `from` and caps a bulk range at 100 tables', () => {
    expect(bulkTablesSchema.safeParse({ from: 5, to: 4, capacity: 4 }).success).toBe(false);
    expect(bulkTablesSchema.safeParse({ from: 1, to: 100, capacity: 4 }).success).toBe(true);
    expect(bulkTablesSchema.safeParse({ from: 1, to: 101, capacity: 4 }).success).toBe(false);
  });
});
