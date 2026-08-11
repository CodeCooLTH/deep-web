import { prisma } from "@/lib/prisma";
import { evaluateBadges, evaluateSellerBadgesForShop } from "@/services/badge.service";
import {
  approvedVerificationWhere,
  businessScope,
  verificationRecordWhere,
  type VerificationReadScope,
} from "@/lib/verification-scope";

/** VerificationScope — Personal (shopId=null, ผูก userId) หรือ Business (shopId=active.shop.id)
 *  P5-1: verification ผูก active shop context (Personal เดิม 100% / Business แยกต่อร้าน) */
export interface VerificationScope {
  userId: string;
  shopId: string | null;
}

/** submitVerification — เขียน record ผูก userId เสมอ (audit ว่าใครส่ง) + shopId ตาม active context
 *  shopId=null (default) = personal-level เดิม; shopId=<businessId> = ของ business นั้น */
export async function submitVerification(
  userId: string,
  data: {
    type: string;
    level: number;
    documents?: any;
  },
  shopId: string | null = null,
) {
  const isOtp = data.type === "EMAIL_OTP" || data.type === "PHONE_OTP";

  return prisma.verificationRecord.create({
    data: {
      userId,
      shopId,
      type: data.type,
      level: data.level,
      status: isOtp ? "APPROVED" : "PENDING",
      documents: data.documents,
      reviewedAt: isOtp ? new Date() : undefined,
    },
  });
}

// throw codes ที่ caller (API route) map เป็น HTTP status ได้
export class VerificationNotFoundError extends Error {
  constructor() { super("VERIFICATION_NOT_FOUND"); this.name = "VerificationNotFoundError"; }
}
export class SelfReviewForbiddenError extends Error {
  constructor() { super("SELF_REVIEW_FORBIDDEN"); this.name = "SelfReviewForbiddenError"; }
}

export async function reviewVerification(recordId: string, adminId: string, data: {
  status: "APPROVED" | "REJECTED";
  rejectedReason?: string;
}) {
  // Self-review guard ที่ "service layer" (FR-2.6 / retro P2 mandate) — single source of truth
  // เคยมี guard แค่ที่ API layer ของ admin route ทำให้ route อื่นที่เรียก service ตรง bypass ได้
  // (orphan POST /api/verification/[id]/review ลบไปแล้ว แต่ guard ที่นี่กันทุก caller ในอนาคต)
  const existing = await prisma.verificationRecord.findUnique({
    where: { id: recordId },
    select: { userId: true },
  });
  if (!existing) throw new VerificationNotFoundError();
  if (existing.userId === adminId) throw new SelfReviewForbiddenError();

  const record = await prisma.verificationRecord.update({
    where: { id: recordId },
    data: {
      status: data.status,
      rejectedReason: data.rejectedReason,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });

  if (data.status === "APPROVED") {
    // 00008 P5-2: business verification (record.shopId ไม่ null) → seller-badge ของ business
    // shop นั้น (FULL_VERIFICATION ใช้ verification where{shopId} ตาม P5-1); personal (shopId
    // null) → evaluateBadges(record.userId) เดิม (user-level, zero-regression)
    if (record.shopId) {
      const shop = await prisma.shop.findUnique({
        where: { id: record.shopId },
        select: { id: true, userId: true, kind: true },
      });
      if (shop) {
        await evaluateSellerBadgesForShop(shop);
      }
    } else {
      await evaluateBadges(record.userId);
    }
  }

  return record;
}

/** resolveReadScope — แปลง VerificationScope เดิมเป็น scope ของ SSOT ฝั่งอ่าน
 *  business ต้องยึด "เจ้าของร้าน" ไม่ใช่ผู้ใช้ที่กำลังเปิดหน้าอยู่ (พนักงานที่ถูกเชิญยืนยันเบอร์ตัวเอง
 *  แล้วไม่ได้แปลว่าร้านยืนยันแล้ว) → ต้อง query หา Shop.userId ไม่ใช่หยิบ scope.userId มาใช้
 *  หาเจ้าของไม่เจอ → คงพฤติกรรมเดิม `{ shopId }` (ไม่ตกไป personal ซึ่งจะกลายเป็นเอา verification
 *  ของคนที่เปิดหน้าอยู่มาแสดงแทนของร้าน) */
async function resolveReadScope(scope: VerificationScope): Promise<VerificationReadScope> {
  if (!scope.shopId) return { kind: "personal", userId: scope.userId };
  const shop = await prisma.shop.findUnique({
    where: { id: scope.shopId },
    select: { userId: true },
  });
  return businessScope(scope.shopId, shop?.userId ?? null);
}

/** getVerifications — scope-aware list. Business: แถวของร้าน + L1 ของเจ้าของร้าน (ดู
 *  `src/lib/verification-scope.ts` — L1 เขียน shopId=null เสมอทุกทางเข้า). Personal: เดิม */
export async function getVerifications(scope: VerificationScope) {
  return prisma.verificationRecord.findMany({
    where: verificationRecordWhere(await resolveReadScope(scope)),
    orderBy: { createdAt: "desc" },
  });
}

/** getUserVerifications — alias เดิม (personal-level เท่านั้น) คงไว้กัน caller เดิมพัง
 *  (buyer-app / admin app-route / auction ยังเรียกแบบ userId เดียว — P5-3/P5-4 จะ migrate ทีหลัง) */
export async function getUserVerifications(userId: string) {
  return getVerifications({ userId, shopId: null });
}

/** getMaxVerificationLevel — รับได้ทั้ง userId เดิม (string, personal path) และ scope object ใหม่
 *  (ห้าม caller เดิมพัง — overload string ยังทำงานเหมือนเดิมทุกจุด) */
export async function getMaxVerificationLevel(scope: string | VerificationScope): Promise<number> {
  const normalized: VerificationScope = typeof scope === "string" ? { userId: scope, shopId: null } : scope;
  const approved = await prisma.verificationRecord.findMany({
    where: approvedVerificationWhere(await resolveReadScope(normalized)),
    select: { level: true },
  });
  if (approved.length === 0) return 0;
  return Math.max(...approved.map((v) => v.level));
}

export async function getPendingVerifications() {
  return prisma.verificationRecord.findMany({
    where: { status: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}
