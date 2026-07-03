import { PrismaClient } from "@prisma/client";

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: connectionUrl } } });

async function seed() {
  const SELLER_ID = 'e7e8d500-600a-4484-a741-3a6475a6b969';
  const SHOP_ID = '9226d13a-8b25-4ab6-8c50-d77bce4086af';
  const ADMIN_ID = 'f0eb0238-a37a-4aea-b125-a78b7c4e7b61';

  // 1. Seed L2 DOCUMENT APPROVED verification for test seller
  const existingL2 = await prisma.verificationRecord.findFirst({
    where: { userId: SELLER_ID, type: 'DOCUMENT', level: 2 }
  });
  if (!existingL2) {
    await prisma.verificationRecord.create({
      data: {
        userId: SELLER_ID,
        type: 'DOCUMENT',
        level: 2,
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedById: ADMIN_ID,
      }
    });
    console.log('Seeded L2 DOCUMENT APPROVED for test seller');
  } else {
    console.log('L2 verification already exists:', existingL2.status);
    // Ensure it's APPROVED
    if (existingL2.status !== 'APPROVED') {
      await prisma.verificationRecord.update({
        where: { id: existingL2.id },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: ADMIN_ID }
      });
      console.log('Updated L2 to APPROVED');
    }
  }

  // 2. Create wallet if not exists (balance=0 for deduct-block test)
  const existingWallet = await prisma.sellerWallet.findUnique({ where: { shopId: SHOP_ID } });
  if (!existingWallet) {
    const w = await prisma.sellerWallet.create({ data: { shopId: SHOP_ID, balance: 0 } });
    console.log('Created SellerWallet balance=0, id=', w.id);
  } else {
    console.log('Wallet exists, balance=', existingWallet.balance, 'id=', existingWallet.id);
  }

  // 3. Check orders
  const orderWithContact = await prisma.order.findFirst({
    where: { shopId: SHOP_ID, buyerContact: { not: null } },
    select: { id: true, publicToken: true, buyerContact: true, status: true }
  });
  const orderWithoutContact = await prisma.order.findFirst({
    where: { shopId: SHOP_ID, buyerContact: null },
    select: { id: true, publicToken: true, buyerContact: true, status: true }
  });
  console.log('Order with buyerContact:', JSON.stringify(orderWithContact));
  console.log('Order without buyerContact:', JSON.stringify(orderWithoutContact));

  // 4. Check admin is not linked to shop (for RC-7 self-approve test)
  // Admin should NOT be owner of shop (different userId)
  const adminShop = await prisma.shop.findFirst({ where: { userId: ADMIN_ID, kind: 'PERSONAL' } });
  console.log('Admin has shop:', adminShop !== null, '(RC-7 self-block only if admin owns shop)');

  await prisma.$disconnect();
}

seed().catch(e => { console.error(e.message); console.error(e.stack); process.exit(1); });
