import { prisma } from "@/lib/prisma";

export type TrustLevel = "A+" | "A" | "B+" | "B" | "C" | "D";

export function getTrustLevel(score: number): TrustLevel {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

// Score → tier แสดงผล ตาม SSOT `docs/10 - Business Rules/Tier Lists.md`
// (5-tier: Classic/Silver/Gold/Diamond/Star; D,C รวมเป็น Classic). ห้ามตั้ง mapping ใหม่ที่อื่น.
const TIER_BY_LETTER: Record<TrustLevel, { tier: string; dots: number }> = {
  "A+": { tier: "Deep Star", dots: 5 },
  A: { tier: "Deep Diamond", dots: 4 },
  "B+": { tier: "Deep Gold", dots: 3 },
  B: { tier: "Deep Silver", dots: 2 },
  C: { tier: "Deep Classic", dots: 1 },
  D: { tier: "Deep Classic", dots: 0 },
};

export function getTierDisplay(score: number): {
  letter: TrustLevel;
  tier: string;
  dots: number;
} {
  const letter = getTrustLevel(score);
  return { letter, ...TIER_BY_LETTER[letter] };
}

async function calcVerificationScore(userId: string): Promise<number> {
  const approved = await prisma.verificationRecord.findMany({
    where: { userId, status: "APPROVED" },
    select: { level: true },
  });
  const maxLevel = approved.length > 0 ? Math.max(...approved.map((v) => v.level)) : 0;
  if (maxLevel >= 3) return 35;
  if (maxLevel >= 2) return 25;
  if (maxLevel >= 1) return 10;
  return 0;
}

async function calcOrderScore(userId: string): Promise<number> {
  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
  if (!shop) return 0;

  const count = await prisma.order.count({
    where: { shopId: shop.id, status: "CONFIRMED" },
  });
  return Math.min(25, Math.round(Math.sqrt(count) * 2.5));
}

async function calcRatingScore(userId: string): Promise<number> {
  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
  if (!shop) return 0;

  const reviews = await prisma.review.findMany({
    where: { order: { shopId: shop.id } },
    select: { rating: true },
  });
  if (reviews.length < 3) return 0;

  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return Math.round((avg - 1) * 5);
}

function calcAgeScore(createdAt: Date): number {
  const daysOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.min(10, Math.round((daysOld / 365) * 10));
}

async function calcBadgeScore(userId: string): Promise<number> {
  const count = await prisma.userBadge.count({ where: { userId } });
  return Math.min(10, count);
}

export async function recalculateTrustScore(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const verification = await calcVerificationScore(userId);
  const orders = await calcOrderScore(userId);
  const rating = await calcRatingScore(userId);
  const age = calcAgeScore(user.createdAt);
  const badges = await calcBadgeScore(userId);

  const computed = verification + orders + rating + age + badges;

  // PRD FR-3.5: MVP "มีแต่ขึ้น" (monotonic-increasing) — trust score ที่
  // แสดงบน User ต้องไม่ลดลง แม้ formula จะคำนวณต่ำกว่าของเดิม (เช่น
  // average rating ลดเพราะมีรีวิวแย่ ทำให้ rating term ตก) ใช้ max เพื่อกัน
  // drop. TrustScoreHistory ยัง snapshot ค่าที่คำนวณ (computed) + breakdown
  // ให้ดู trend จริง ได้ — ไม่ซ่อนประวัติ
  const persisted = Math.max(user.trustScore, computed);

  await prisma.user.update({ where: { id: userId }, data: { trustScore: persisted } });
  await prisma.trustScoreHistory.create({
    data: {
      userId,
      score: computed,
      breakdown: { verification, orders, rating, age, badges },
    },
  });

  return persisted;
}
