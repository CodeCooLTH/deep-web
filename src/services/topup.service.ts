import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { TopUpRequest } from "@prisma/client";
import { creditWallet } from "@/services/wallet.service";

// ──────────────────────────────────────────────────────────────────────────────
// createTopUpRequest
// ──────────────────────────────────────────────────────────────────────────────

/**
 * สร้าง TopUpRequest ใหม่ (status = PENDING) หลัง seller อัปโหลด slip แล้ว
 *
 * ทำไม guard amount>0 integer ที่ service ไม่ใช่แค่ Valibot:
 * Valibot เป็น defense-in-depth ที่ route layer; service เป็น invariant จริง —
 * กัน caller อื่น (test / future route) bypass validation แล้วบันทึก amount ติดลบ
 * ซึ่งทำให้ approveTopUp credit wallet ด้วย negative amount = เงินหาย (money bug)
 */
export async function createTopUpRequest(
  shopId: string,
  amount: number,
  slipFileId: string,
): Promise<TopUpRequest> {
  // service invariant — ไม่ trust caller (Valibot T6 เป็น defense-in-depth เท่านั้น)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  return prisma.topUpRequest.create({
    data: {
      shopId,
      amount,
      slipFileId,
      status: "PENDING",
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// approveTopUp
// ──────────────────────────────────────────────────────────────────────────────

/**
 * อนุมัติ TopUpRequest และ credit wallet แบบ atomic
 *
 * ทำไม $transaction:
 * ถ้า status update สำเร็จแต่ creditWallet throw (crash / DB error) — โดยไม่มี
 * $transaction → TopUpRequest.status = "APPROVED" แต่ balance ไม่เพิ่ม = seller
 * เสียเงินโอน แต่ได้ 0 เครดิต (data inconsistency ที่แก้ยากมากใน production).
 * การ wrap ใน $transaction ทำให้ทั้ง status-change + creditWallet + WalletTransaction
 * อยู่ใน PostgreSQL transaction เดียว: commit พร้อมกันทั้งหมด หรือ rollback ทั้งหมด.
 *
 * ทำไม conditional updateMany (where status=PENDING) ไม่ใช่ findUnique+if+update:
 * Prisma $transaction default = READ COMMITTED (ไม่ใช่ serializable). ถ้าใช้
 * findUnique ก่อน → if status===PENDING → update: 2 admin concurrent ต่าง findUnique
 * เห็น PENDING พร้อมกัน (ยังไม่มีใคร commit) → ผ่าน guard ทั้งคู่ → update by id
 * (WHERE มีแค่ id) สำเร็จทั้งคู่ → creditWallet 2 ครั้ง = double-credit (เงินงอก).
 * แก้: ยุบ guard+flip เป็น UPDATE เดียว `updateMany({where:{id,status:PENDING}})`
 * — atomic ที่ระดับ DB row regardless of isolation. concurrent ตัวที่สอง
 * count===0 → throw ALREADY_PROCESSED ก่อนถึง creditWallet. (pattern เดียวกับ
 * deductCredit RC-3 / consumeSmsCode RC-1 ในโปรเจกต์นี้)
 *
 * RC-7 NOTE (boundary — ห้าม implement ที่นี่):
 * self-approve block (`topUpRequest.shop.userId !== admin.id`) ต้องทำที่ ROUTE layer
 * (T10: `/api/admin/topups/[id]/approve|reject`) ก่อนเรียก approveTopUp — service
 * นี้ไม่รู้จัก HTTP session / admin identity เกินกว่า adminId param.
 * Mirror: `src/app/api/admin/verifications/[id]/route.ts:18`.
 */
export async function approveTopUp(
  requestId: string,
  adminId: string,
): Promise<TopUpRequest> {
  return prisma.$transaction(async (tx) => {
    // load เพื่อเอา shopId/amount (จำเป็นต่อ creditWallet) — ยังไม่ถือเป็น gate
    const req = await tx.topUpRequest.findUnique({
      where: { id: requestId },
    });

    if (!req) {
      throw new Error("NOT_FOUND");
    }

    const now = new Date();

    // atomic gate: status flip เกิดก็ต่อเมื่อยังเป็น PENDING — อยู่ใน UPDATE เดียว
    // (ไม่ใช่ check-then-update) → กัน double-approve/double-credit ที่ READ COMMITTED
    const gate = await tx.topUpRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: adminId,
        reviewedAt: now,
      },
    });

    // concurrent ตัวที่สอง (หรือ replay) → count===0 → ไม่ถึง creditWallet
    if (gate.count === 0) {
      throw new Error("ALREADY_PROCESSED");
    }

    // credit wallet พร้อม tx — atomic: balance + WalletTransaction(TOPUP) อยู่ใน
    // transaction เดียวกับ status flip ด้านบน; ถ้า creditWallet throw → rollback ทั้งหมด
    await creditWallet(
      req.shopId,
      req.amount,
      requestId,
      "เติมเครดิต SMS (อนุมัติโดย admin)",
      undefined, // reason — topup ปกติไม่มี reason แยกประเภท (มิเรอร์พฤติกรรมเดิมก่อน extension นี้)
      tx,
    );

    return { ...req, status: "APPROVED", reviewedById: adminId, reviewedAt: now };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// rejectTopUp
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ปฏิเสธ TopUpRequest — ต้องระบุเหตุผลภาษาไทย; ไม่แตะ wallet
 *
 * ทำไม conditional updateMany (เหมือน approveTopUp):
 * กัน TOCTOU — findUnique+if+update ที่ READ COMMITTED ทำให้ 2 admin concurrent
 * (หรือ reject ชน approve) เห็น PENDING พร้อมกัน แล้ว update by-id ทับกัน →
 * overwrite reviewedById/rejectedReason หรือ ดึง APPROVED กลับเป็น REJECTED
 * (= corrupt finalized money record / audit trail). UPDATE เดียวที่ WHERE
 * status=PENDING เป็น atomic gate; count===0 = ถูก finalize ไปแล้ว.
 */
export async function rejectTopUp(
  requestId: string,
  adminId: string,
  reason: string,
): Promise<TopUpRequest> {
  const gate = await prisma.topUpRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectedReason: reason,
    },
  });

  if (gate.count === 0) {
    // แยก NOT_FOUND ออกจาก ALREADY_PROCESSED ให้ caller (route) map error ได้ถูก
    const exists = await prisma.topUpRequest.findUnique({
      where: { id: requestId },
      select: { id: true },
    });
    throw new Error(exists ? "ALREADY_PROCESSED" : "NOT_FOUND");
  }

  const updated = await prisma.topUpRequest.findUnique({
    where: { id: requestId },
  });
  return updated as TopUpRequest;
}

// ──────────────────────────────────────────────────────────────────────────────
// getPendingTopUps
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ดึงคิว TopUpRequest ที่รอ review (admin queue)
 * include shop minimal เพื่อแสดงชื่อร้านใน admin UI โดยไม่ต้อง join เพิ่ม
 * orderBy createdAt asc — first-in-first-out เพื่อความยุติธรรม
 */
export type PendingTopUp = Prisma.TopUpRequestGetPayload<{
  include: { shop: { select: { id: true; shopName: true } } };
}>;

export async function getPendingTopUps(): Promise<PendingTopUp[]> {
  return prisma.topUpRequest.findMany({
    where: { status: "PENDING" },
    include: {
      shop: {
        select: { id: true, shopName: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// getTopUpsByShop
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ดึงประวัติ TopUpRequest ของ shop (seller history)
 * orderBy createdAt desc — ล่าสุดอยู่บนสุด (ตาม UX convention ledger/transaction list)
 */
export async function getTopUpsByShop(shopId: string): Promise<TopUpRequest[]> {
  return prisma.topUpRequest.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });
}
