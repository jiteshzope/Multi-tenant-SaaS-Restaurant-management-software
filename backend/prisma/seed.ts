/**
 * Seed data — database/CLAUDE.md § "Seed data".
 *
 * One restaurant, four users, eight tables, five categories, ten items, every
 * table assigned to a waiter. The UUIDs are fixed on purpose: API tests and the
 * Playwright fixtures copy-paste them.
 *
 *   npx prisma db seed
 *
 * Idempotent — safe to run repeatedly.
 */
import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const RESTAURANT_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = 'a0000000-0000-0000-0000-000000000001';
const AMIT_ID = 'a0000000-0000-0000-0000-000000000002';
const SURESH_ID = 'a0000000-0000-0000-0000-000000000003';
const KITCHEN_ID = 'a0000000-0000-0000-0000-000000000004';

const CATEGORY = {
  starters: 'c0000000-0000-0000-0000-000000000001',
  biryani: 'c0000000-0000-0000-0000-000000000002',
  mains: 'c0000000-0000-0000-0000-000000000003',
  drinks: 'c0000000-0000-0000-0000-000000000004',
  desserts: 'c0000000-0000-0000-0000-000000000005',
} as const;

const SEED_PASSWORD = 'password123';

async function main(): Promise<void> {
  const passwordHash = await hash(SEED_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { id: RESTAURANT_ID },
    update: {},
    create: {
      id: RESTAURANT_ID,
      name: 'Spice Garden',
      slug: 'spice-garden',
      phone: '+91-9000000000',
      address: '12 MG Road, Bengaluru 560001',
      taxPercent: new Prisma.Decimal('5.00'),
    },
  });

  const people = [
    { id: OWNER_ID, name: 'Raj', email: 'owner@spice.com', role: 'OWNER' as const },
    { id: AMIT_ID, name: 'Amit', email: 'amit@spice.com', role: 'WAITER' as const },
    { id: SURESH_ID, name: 'Suresh', email: 'suresh@spice.com', role: 'WAITER' as const },
    { id: KITCHEN_ID, name: 'Rahul', email: 'kitchen@spice.com', role: 'KITCHEN' as const },
  ];

  for (const p of people) {
    await prisma.user.upsert({
      where: { id: p.id },
      update: { passwordHash },
      create: { id: p.id, name: p.name, email: p.email, passwordHash },
    });

    await prisma.restaurantUser.upsert({
      where: { restaurantId_userId: { restaurantId: RESTAURANT_ID, userId: p.id } },
      update: { role: p.role, isActive: true },
      create: { restaurantId: RESTAURANT_ID, userId: p.id, role: p.role, createdBy: OWNER_ID },
    });
  }

  for (let n = 1; n <= 8; n++) {
    await prisma.restaurantTable.upsert({
      where: { restaurantId_tableNumber: { restaurantId: RESTAURANT_ID, tableNumber: n } },
      update: {},
      create: { restaurantId: RESTAURANT_ID, tableNumber: n, capacity: n <= 6 ? 4 : 8 },
    });
  }

  const categories = [
    { id: CATEGORY.starters, name: 'Starters', displayOrder: 1 },
    { id: CATEGORY.biryani, name: 'Biryani', displayOrder: 2 },
    { id: CATEGORY.mains, name: 'Main Course', displayOrder: 3 },
    { id: CATEGORY.drinks, name: 'Drinks', displayOrder: 4 },
    { id: CATEGORY.desserts, name: 'Desserts', displayOrder: 5 },
  ];

  for (const c of categories) {
    await prisma.menuCategory.upsert({
      where: { id: c.id },
      update: { name: c.name, displayOrder: c.displayOrder },
      create: { ...c, restaurantId: RESTAURANT_ID },
    });
  }

  const items: {
    categoryId: string;
    name: string;
    price: string;
    isVeg: boolean;
    description: string;
  }[] = [
    { categoryId: CATEGORY.starters, name: 'Paneer Tikka', price: '220.00', isVeg: true,
      description: 'Char-grilled cottage cheese, mint chutney' },
    { categoryId: CATEGORY.starters, name: 'Chicken 65', price: '240.00', isVeg: false,
      description: 'Curry-leaf fried chicken, Chennai style' },
    { categoryId: CATEGORY.biryani, name: 'Chicken Biryani', price: '250.00', isVeg: false,
      description: 'Dum-cooked, served with raita and salan' },
    { categoryId: CATEGORY.biryani, name: 'Mutton Biryani', price: '320.00', isVeg: false,
      description: 'Slow-cooked mutton, long-grain basmati' },
    { categoryId: CATEGORY.biryani, name: 'Veg Biryani', price: '180.00', isVeg: true,
      description: 'Seasonal vegetables, saffron rice' },
    { categoryId: CATEGORY.mains, name: 'Butter Naan', price: '50.00', isVeg: true,
      description: 'Tandoor-baked, brushed with butter' },
    { categoryId: CATEGORY.mains, name: 'Dal Tadka', price: '160.00', isVeg: true,
      description: 'Yellow lentils, ghee and cumin tempering' },
    { categoryId: CATEGORY.drinks, name: 'Coke', price: '60.00', isVeg: true,
      description: '300 ml, chilled' },
    { categoryId: CATEGORY.drinks, name: 'Masala Chai', price: '40.00', isVeg: true,
      description: 'Cardamom, ginger, full-cream milk' },
    { categoryId: CATEGORY.desserts, name: 'Gulab Jamun', price: '90.00', isVeg: true,
      description: 'Two pieces, warm sugar syrup' },
  ];

  for (const [index, item] of items.entries()) {
    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: RESTAURANT_ID, categoryId: item.categoryId, name: item.name },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.menuItem.create({
      data: {
        restaurantId: RESTAURANT_ID,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: new Prisma.Decimal(item.price),
        isVeg: item.isVeg,
        displayOrder: index,
      },
    });
  }

  // Tables 1–4 → Amit, 5–8 → Suresh.
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: RESTAURANT_ID },
    select: { id: true, tableNumber: true },
    orderBy: { tableNumber: 'asc' },
  });

  for (const t of tables) {
    const active = await prisma.tableWaiterAssignment.findFirst({
      where: { tableId: t.id, unassignedAt: null },
      select: { id: true },
    });
    if (active) continue;

    await prisma.tableWaiterAssignment.create({
      data: {
        restaurantId: RESTAURANT_ID,
        tableId: t.id,
        waiterUserId: t.tableNumber <= 4 ? AMIT_ID : SURESH_ID,
        assignedBy: OWNER_ID,
      },
    });
  }

  console.log(`Seeded "${restaurant.name}" (${restaurant.slug})`);
  console.log(`  ${people.length} users — password for all of them: ${SEED_PASSWORD}`);
  console.log(`  ${tables.length} tables, ${categories.length} categories, ${items.length} items`);
  console.log('  owner@spice.com · amit@spice.com · suresh@spice.com · kitchen@spice.com');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
