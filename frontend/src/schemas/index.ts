import { z } from 'zod';

/**
 * One schema per backend DTO. Zod 4 syntax: string formats are top-level
 * (`z.email()`, not the deprecated `z.string().email()`), and messages use the
 * single `error` param rather than Zod 3's `message`/`required_error` trio.
 *
 * Every constraint here mirrors a CHECK in database/CLAUDE.md — capacity 1–50,
 * tax 0–100, quantity > 0, price >= 0. Client validation is UX; the database is
 * the guarantee.
 *
 * Ids use `z.guid()`, not `z.uuid()`. Zod 4's `uuid()` enforces the RFC 9562
 * version and variant nibbles, which the fixed seed ids
 * (`11111111-1111-…`, `c0000000-0000-…`) deliberately do not carry. `guid()` is
 * the plain 8-4-4-4-12 hex check, and matches what Nest's `ParseUUIDPipe`
 * accepts on the other side.
 */

const password = z.string().min(8, { error: 'At least 8 characters' }).max(128);
const personName = z.string().trim().min(1, { error: 'Required' }).max(120);

/* --- auth ---------------------------------------------------------------- */

export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email' }),
  password,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerRestaurantSchema = z
  .object({
    restaurantName: z.string().trim().min(1, { error: 'Required' }).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, { error: 'At least 3 characters' })
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        error: 'Lowercase letters, digits and single dashes only',
      }),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    ownerName: personName,
    ownerEmail: z.email({ error: 'Enter a valid email' }),
    ownerPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.ownerPassword === v.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterRestaurantInput = z.infer<typeof registerRestaurantSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: password,
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/* --- staff --------------------------------------------------------------- */

export const createStaffSchema = z.object({
  name: personName,
  email: z.email({ error: 'Enter a valid email' }),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  password,
  role: z.enum(['WAITER', 'KITCHEN']),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/* --- tables -------------------------------------------------------------- */

export const createTableSchema = z.object({
  tableNumber: z.coerce.number().int().min(1, { error: 'Must be 1 or more' }).max(100_000),
  label: z.string().trim().max(40).optional().or(z.literal('')),
  capacity: z.coerce
    .number()
    .int()
    .min(1, { error: 'At least 1 seat' })
    .max(50, { error: 'At most 50 seats' }),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

export const bulkTablesSchema = z
  .object({
    from: z.coerce.number().int().min(1),
    to: z.coerce.number().int().min(1),
    capacity: z.coerce.number().int().min(1).max(50),
  })
  .refine((v) => v.to >= v.from, { error: '“To” must be at least “From”', path: ['to'] })
  .refine((v) => v.to - v.from <= 99, { error: 'At most 100 tables at once', path: ['to'] });
export type BulkTablesInput = z.infer<typeof bulkTablesSchema>;

export const assignWaiterSchema = z.object({
  waiterUserId: z.guid({ error: 'Pick a waiter' }),
});
export type AssignWaiterInput = z.infer<typeof assignWaiterSchema>;

/* --- menu ---------------------------------------------------------------- */

export const categorySchema = z.object({
  name: z.string().trim().min(1, { error: 'Required' }).max(120),
  displayOrder: z.coerce.number().int().min(0).max(999),
});
export type CategoryInput = z.infer<typeof categorySchema>;

/** Price is text, validated by regex, sent as a string — never `type="number"`. */
export const menuItemSchema = z.object({
  categoryId: z.guid({ error: 'Pick a category' }),
  name: z.string().trim().min(1, { error: 'Required' }).max(120),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  price: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, { error: 'Like 250 or 250.00' }),
  isVeg: z.enum(['veg', 'nonveg', 'unspecified']),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;

/* --- sessions & orders --------------------------------------------------- */

export const openSessionSchema = z.object({
  guestCount: z.coerce.number().int().min(1).max(50).optional(),
  customerName: z.string().trim().max(120).optional().or(z.literal('')),
  customerPhone: z.string().trim().max(20).optional().or(z.literal('')),
});
export type OpenSessionInput = z.infer<typeof openSessionSchema>;

/** No price field. Ever. */
export const placeOrderSchema = z.object({
  sessionId: z.guid(),
  items: z
    .array(
      z.object({
        menuItemId: z.guid(),
        quantity: z.number().int().min(1),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, { error: 'Add at least one item' }),
  note: z.string().trim().max(500).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

/* --- settings ------------------------------------------------------------ */

export const settingsSchema = z.object({
  name: z.string().trim().min(1, { error: 'Required' }).max(120),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  taxPercent: z
    .string()
    .trim()
    .regex(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/, { error: 'A number from 0 to 100' }),
  timezone: z.string().trim().min(1).max(64),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
