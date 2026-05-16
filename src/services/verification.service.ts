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

export async function reviewVerification(recordId: string, adminId: string, data: {
  status: "APPROVED" | "REJECTED";
  rejectedReason?: string;
}) {
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
