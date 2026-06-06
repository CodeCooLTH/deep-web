import { prisma } from "@/lib/prisma";
import { evaluateBadges } from "@/services/badge.service";

export async function submitVerification(userId: string, data: {
  type: string;
  level: number;
  documents?: any;
}) {
  const isOtp = data.type === "EMAIL_OTP" || data.type === "PHONE_OTP";

  return prisma.verificationRecord.create({
    data: {
      userId,
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

export async function getUserVerifications(userId: string) {
  return prisma.verificationRecord.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMaxVerificationLevel(userId: string): Promise<number> {
  const approved = await prisma.verificationRecord.findMany({
    where: { userId, status: "APPROVED" },
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
