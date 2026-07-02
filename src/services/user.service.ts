import { prisma } from "@/lib/prisma";

export async function findOrCreateByPhone(phone: string, displayName?: string) {
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        displayName: displayName || `User_${phone.slice(-4)}`,
        username: `user_${Date.now()}`,
        authAccounts: {
          create: { provider: "PHONE", providerAccountId: phone },
        },
      },
    });
  }
  return user;
}

// P2-3 (feature 00008 Phase 2 cutover): User.shop (1:1) → User.shops (1:N) — include:{shop:true}
// ใช้ไม่ได้อีกต่อไป เปลี่ยนเป็น shops:{where:{kind:'PERSONAL'}} แล้ว remap คง shape เดิม (`.shop`)
// ให้ caller เดิม (u/[username], public/profile) ไม่ต้องแก้
export async function findByUsername(username: string) {
  const u = await prisma.user.findUnique({
    where: { username },
    include: {
      shops: { where: { kind: "PERSONAL" } },
      userBadges: { include: { badge: true } },
    },
  });
  if (!u) return null;
  const { shops, ...rest } = u;
  return { ...rest, shop: shops[0] ?? null };
}

export async function updateProfile(userId: string, data: { displayName?: string; username?: string; avatar?: string }) {
  return prisma.user.update({ where: { id: userId }, data });
}

export async function linkBuyerHistory(userId: string, phone?: string, email?: string) {
  const conditions = [];
  if (phone) conditions.push({ buyerContact: phone });
  if (email) conditions.push({ buyerContact: email });
  if (conditions.length === 0) return;

  await prisma.order.updateMany({
    where: { buyerUserId: null, OR: conditions },
    data: { buyerUserId: userId },
  });

  await prisma.review.updateMany({
    where: { reviewerUserId: null, OR: conditions.map(c => ({ reviewerContact: c.buyerContact })) },
    data: { reviewerUserId: userId },
  });
}
