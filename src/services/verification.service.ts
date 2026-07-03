import { prisma } from "@/lib/prisma";
import { evaluateBadges } from "@/services/badge.service";

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
    await evaluateBadges(record.userId);
  }

  return record;
}

/** getVerifications — scope-aware list. Business: filter เฉพาะ shopId (verification ของ business
 *  ไม่ใช่ของ user คนใดคนหนึ่ง — ไม่ผูก userId ในการ filter). Personal: {userId, shopId:null} เดิม */
export async function getVerifications(scope: VerificationScope) {
  return prisma.verificationRecord.findMany({
    where: scope.shopId ? { shopId: scope.shopId } : { userId: scope.userId, shopId: null },
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
    where: normalized.shopId
      ? { shopId: normalized.shopId, status: "APPROVED" }
      : { userId: normalized.userId, shopId: null, status: "APPROVED" },
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
