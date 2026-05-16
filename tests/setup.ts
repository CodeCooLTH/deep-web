import { PrismaClient } from "@prisma/client";

// Guard: ห้ามรัน test ที่ wipe DB บน Supabase (production/shared DB)
// tests ต้องรันต่อ local Docker Postgres เท่านั้น (DATABASE_URL ชี้ localhost)
// วิธีรัน: npx dotenv -e .env -- npx vitest (หรือดู docs/conventions/seed-and-env.md)
const dbUrl = process.env.DATABASE_URL ?? "";
if (dbUrl.includes("supabase.com") || dbUrl.includes("pooler.supabase")) {
  throw new Error(
    "[tests/setup] DATABASE_URL ชี้ไปที่ Supabase — ห้ามรัน test ที่ cleanDatabase() บน shared DB\n" +
    "รัน: npx dotenv -e .env -- npx vitest\n" +
    "หรือดู docs/conventions/seed-and-env.md"
  );
}

export const prisma = new PrismaClient();

export async function cleanDatabase() {
  // Delete in dependency order - sequential to avoid FK constraint violations
  await prisma.trustScoreHistory.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.review.deleteMany();
  await prisma.shipmentTracking.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.verificationRecord.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.user.deleteMany();
}
