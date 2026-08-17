/** Room-name builders. Nothing is ever emitted outside a tenant room. */
export const rooms = {
  tenant: (restaurantId: string) => `restaurant:${restaurantId}`,
  kitchen: (restaurantId: string) => `restaurant:${restaurantId}:kitchen`,
  waiter: (restaurantId: string, userId: string) => `restaurant:${restaurantId}:waiter:${userId}`,
} as const;
