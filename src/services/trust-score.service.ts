import { prisma } from "@/lib/prisma";
import { BADGE_SCORE_MAX, BADGE_SCORE_PER_BADGE } from "@/lib/badge-score-rule";

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

// TrustScope — scope ร่วมของ calc helper (00008 P5-3b): personal (userId, PERSONAL shop derive
// เองเหมือนเดิม) หรือ business (shopId ตรง — ไม่ derive). ทำให้ helper เดิมนำมาใช้ซ้ำได้ทั้ง 2 flow
// โดย personal path คงผลลัพธ์เป๊ะเดิม (zero-regression)
type TrustScope = { kind: "personal"; userId: string } | { kind: "business"; shopId: string };

async function calcVerificationScore(scope: TrustScope): Promise<number> {
  // shopId:null = personal/user-level เท่านั้น (00008 P5-1) — ไม่นับ verification ของ Business shop
  // เข้า personal trust score; business scope นับตรงจาก shopId (แยกจาก owner)
  const where =
    scope.kind === "personal"
      ? { userId: scope.userId, shopId: null, status: "APPROVED" }
      : { shopId: scope.shopId, status: "APPROVED" };
  const approved = await prisma.verificationRecord.findMany({
    where,
    select: { level: true },
  });
  const maxLevel = approved.length > 0 ? Math.max(...approved.map((v) => v.level)) : 0;
  if (maxLevel >= 3) return 35;
  if (maxLevel >= 2) return 25;
  if (maxLevel >= 1) return 10;
  return 0;
}

async function resolveOrderScopeShopId(scope: TrustScope): Promise<string | null> {
  if (scope.kind === "business") return scope.shopId;
  const shop = await prisma.shop.findFirst({ where: { userId: scope.userId, kind: "PERSONAL" } });
  return shop?.id ?? null;
}

async function calcOrderScore(scope: TrustScope): Promise<number> {
  const shopId = await resolveOrderScopeShopId(scope);
  if (!shopId) return 0;

  const count = await prisma.order.count({
    where: { shopId, status: "CONFIRMED" },
  });
  return Math.min(25, Math.round(Math.sqrt(count) * 2.5));
}

async function calcRatingScore(scope: TrustScope): Promise<number> {
  const shopId = await resolveOrderScopeShopId(scope);
  if (!shopId) return 0;

  const reviews = await prisma.review.findMany({
    where: { order: { shopId }, deletedAt: null },
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

async function calcBadgeScore(scope: TrustScope): Promise<number> {
  // shopId:null = personal/buyer badge เดิม (00008 P5-2) — ไม่นับ badge ของ Business shop เข้า
  // personal trust score; business scope นับตรงจาก shopId (แยกจาก owner)
  const where = scope.kind === "personal" ? { userId: scope.userId, shopId: null } : { shopId: scope.shopId };
  const count = await prisma.userBadge.count({ where });
  // ตัวเลขมาจาก badge-score-rule.ts ตัวเดียวกับที่ BadgeDetailModal ใช้เขียนประโยคบนจอ
  // (HR16 — เคยหลุดคนละทิศ: จอสัญญา "เพิ่มขึ้น 10%" ขณะที่ของจริงคือ 1 คะแนน เพดาน 10)
  return Math.min(BADGE_SCORE_MAX, count * BADGE_SCORE_PER_BADGE);
}

export async function recalculateTrustScore(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const scope: TrustScope = { kind: "personal", userId };
  const verification = await calcVerificationScore(scope);
  const orders = await calcOrderScore(scope);
  const rating = await calcRatingScore(scope);
  const age = calcAgeScore(user.createdAt);
  const badges = await calcBadgeScore(scope);

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

/**
 * recalculateShopTrustScore — คำนวณ trust score ของ BUSINESS shop เอง (00008 P5-3b)
 *
 * แยกจาก User.trustScore ของ owner โดยสิ้นเชิง: สูตร % เดิมเป๊ะ (verification 35% / orders 25% /
 * rating 20% / age 10% / badges 10%) แต่ scope ทุก component ด้วย shopId ตรง (ไม่ derive จาก userId)
 * - kind !== 'BUSINESS' → no-op (personal shop ใช้ recalculateTrustScore(userId) เดิม)
 * - soft-deleted (deletedAt ไม่ null) → no-op (shop ที่ถูกลบไม่ต้อง recalc ต่อ)
 * - age: shop.createdAt (แทน user.createdAt — วันที่เปิด business shop ไม่ใช่วันสมัครสมาชิก)
 * - monotonic: Math.max(shop.trustScore, computed) เหมือน user เดิม
 * - TrustScoreHistory.userId (required field) = shop.userId (owner) — เก็บ shopId แยกเพื่อ scope query
 */
export async function recalculateShopTrustScore(shopId: string): Promise<number> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return 0;
  if (shop.kind !== "BUSINESS") return 0;
  if (shop.deletedAt) return 0;

  const scope: TrustScope = { kind: "business", shopId };
  const verification = await calcVerificationScore(scope);
  const orders = await calcOrderScore(scope);
  const rating = await calcRatingScore(scope);
  const age = calcAgeScore(shop.createdAt);
  const badges = await calcBadgeScore(scope);

  const computed = verification + orders + rating + age + badges;

  // monotonic rule คงเดิม (ต่อ shop แทนต่อ user) — ดูเหตุผลใน recalculateTrustScore ด้านบน
  const persisted = Math.max(shop.trustScore, computed);

  await prisma.shop.update({ where: { id: shopId }, data: { trustScore: persisted } });
  await prisma.trustScoreHistory.create({
    data: {
      userId: shop.userId,
      shopId,
      score: computed,
      breakdown: { verification, orders, rating, age, badges },
    },
  });

  return persisted;
}
