import { prisma } from "@/lib/prisma";
import { hashIdentifier, maskIdentifier, type IdentifierType } from "@/lib/scam-identifier";

export type ReportIdentifierInput = {
  type: IdentifierType;
  value: string;
  bankName?: string;
};

// typed errors ที่ caller (API route) map เป็น HTTP status ได้ (pattern เดียวกับ verification.service)
export class DuplicateScamReportError extends Error {
  constructor() { super("DUPLICATE_SCAM_REPORT"); this.name = "DuplicateScamReportError"; }
}
export class ScamReportNotFoundError extends Error {
  constructor() { super("SCAM_REPORT_NOT_FOUND"); this.name = "ScamReportNotFoundError"; }
}
export class ScamSelfReviewForbiddenError extends Error {
  constructor() { super("SCAM_SELF_REVIEW_FORBIDDEN"); this.name = "ScamSelfReviewForbiddenError"; }
}

export async function createScamReport(reporterId: string, data: {
  identifiers: ReportIdentifierInput[];
  scamType: string;
  amountLost: number;
  description: string;
  evidence: string[];
}) {
  // กันรายงานซ้ำ: 1 รายงาน/ตัวระบุ/ผู้ใช้ — ถ้า user เคยรายงาน identifier ใดไปแล้ว block ทั้งชุด
  const hashes = data.identifiers.map((i) => hashIdentifier(i.type, i.value));
  const dup = await prisma.scamReportIdentifier.findFirst({
    where: { valueHash: { in: hashes }, report: { reporterId } },
    select: { id: true },
  });
  if (dup) throw new DuplicateScamReportError();

  return prisma.scamReport.create({
    data: {
      reporterId,
      scamType: data.scamType,
      amountLost: data.amountLost,
      description: data.description,
      evidence: data.evidence,
      identifiers: {
        create: data.identifiers.map((i) => ({
          type: i.type,
          valueHash: hashIdentifier(i.type, i.value),
          valueMasked: maskIdentifier(i.type, i.value),
          bankName: i.type === "BANK_ACCOUNT" ? i.bankName : undefined,
        })),
      },
    },
  });
}

export type ScamSearchResult = {
  found: boolean;
  count: number;
  totalLoss: number;
  byType: Record<string, number>;
  lastReportedAt: Date | null;
  masked: string | null;
};

// ค้นหาแบบ exact-match (hash) — นับเฉพาะรายงานที่ admin อนุมัติแล้ว (APPROVED)
// คืนค่าเชิงรวมเท่านั้น (count/มูลค่า/ประเภท) — ไม่มีชื่อผู้รายงาน/ผู้ถูกรายงาน
export async function searchScamByIdentifier(
  type: IdentifierType,
  value: string,
): Promise<ScamSearchResult> {
  const valueHash = hashIdentifier(type, value);
  const rows = await prisma.scamReportIdentifier.findMany({
    where: { type, valueHash, report: { status: "APPROVED" } },
    select: {
      valueMasked: true,
      report: { select: { scamType: true, amountLost: true, createdAt: true } },
    },
  });

  const count = rows.length;
  const totalLoss = rows.reduce((sum, r) => sum + r.report.amountLost, 0);
  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.report.scamType] = (byType[r.report.scamType] ?? 0) + 1;
  }
  const lastReportedAt = rows.length
    ? rows.reduce<Date>((latest, r) => (r.report.createdAt > latest ? r.report.createdAt : latest), rows[0].report.createdAt)
    : null;

  return {
    found: count > 0,
    count,
    totalLoss,
    byType,
    lastReportedAt,
    masked: rows[0]?.valueMasked ?? null,
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getScamReports(status?: string) {
  return prisma.scamReport.findMany({
    where: status ? { status } : {},
    include: {
      identifiers: true,
      reporter: { select: { id: true, displayName: true, username: true } },
    },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
  });
}

export async function reviewScamReport(reportId: string, adminId: string, data: {
  status: "APPROVED" | "REJECTED";
  rejectedReason?: string;
}) {
  // self-review guard ที่ service layer (single source of truth) — admin ที่รายงานเอง ห้ามอนุมัติเอง
  const existing = await prisma.scamReport.findUnique({
    where: { id: reportId },
    select: { reporterId: true },
  });
  if (!existing) throw new ScamReportNotFoundError();
  if (existing.reporterId === adminId) throw new ScamSelfReviewForbiddenError();

  return prisma.scamReport.update({
    where: { id: reportId },
    data: {
      status: data.status,
      rejectedReason: data.rejectedReason,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });
}
