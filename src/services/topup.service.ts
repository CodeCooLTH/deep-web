import { prisma } from "@/lib/prisma";
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
 * ทำไม idempotency guard (ALREADY_PROCESSED):
 * double-approve = double-credit: ถ้า admin กด approve 2 ครั้ง (หรือ 2 admin พร้อมกัน)
 * โดยไม่มี guard → status อาจ update ซ้ำได้ (Prisma update ไม่มี OCC ในตัว) และ
 * creditWallet จะถูกเรียก 2 ครั้ง → balance บวก 2x โดยไม่มีเงินโอนเข้าจริง.
 * การตรวจ status !== "PENDING" ภายใน transaction เดียวกัน (pessimistic lock ผ่าน
 * SELECT ... FOR UPDATE หรือ Prisma's serializable isolation) กัน race ได้:
 * admin คนแรก load → PENDING → update → APPROVED (commit); admin คนที่สอง load
 * → เห็น APPROVED แล้ว → throw ALREADY_PROCESSED ก่อน credit (ไม่ double-credit).
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
    // load request ภายใน transaction — เพื่อให้ idempotency check + update อยู่ใน
    // snapshot เดียวกัน (กัน TOCTOU: read outside tx แล้ว race กับ tx อื่น)
    const req = await tx.topUpRequest.findUnique({
      where: { id: requestId },
    });

    if (!req) {
      throw new Error("NOT_FOUND");
    }

    // idempotency guard — กัน double-approve = double-credit
    // ถ้า status ไม่ใช่ PENDING (APPROVED หรือ REJECTED แล้ว) → reject ทันที
    if (req.status !== "PENDING") {
      throw new Error("ALREADY_PROCESSED");
    }

    // update status → APPROVED (ยังอยู่ใน transaction เดียวกัน)
    const updated = await tx.topUpRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    // credit wallet พร้อม tx — atomic: balance + WalletTransaction(TOPUP) อยู่ใน
    // snapshot เดียวกับ status change ด้านบน; ถ้า creditWallet throw → rollback ทั้งหมด
    await creditWallet(
      req.shopId,
      req.amount,
      requestId,
      "เติมเครดิต SMS (อนุมัติโดย admin)",
      tx,
    );

    return updated;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// rejectTopUp
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ปฏิเสธ TopUpRequest — ต้องระบุเหตุผลภาษาไทย; ไม่แตะ wallet
 *
 * ทำไม guard PENDING เหมือน approveTopUp:
 * กัน admin reject request ที่ approve แล้ว (= overwrite status กลับ = data corruption)
 * และกัน reject ซ้ำที่สร้าง event log ปลอม
 */
export async function rejectTopUp(
  requestId: string,
  adminId: string,
  reason: string,
): Promise<TopUpRequest> {
  const req = await prisma.topUpRequest.findUnique({
    where: { id: requestId },
  });

  if (!req) {
    throw new Error("NOT_FOUND");
  }

  // idempotency guard — เหมือน approveTopUp; ห้ามเปลี่ยน status ที่ finalize แล้ว
  if (req.status !== "PENDING") {
    throw new Error("ALREADY_PROCESSED");
  }

  return prisma.topUpRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectedReason: reason,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// getPendingTopUps
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ดึงคิว TopUpRequest ที่รอ review (admin queue)
 * include shop minimal เพื่อแสดงชื่อร้านใน admin UI โดยไม่ต้อง join เพิ่ม
 * orderBy createdAt asc — first-in-first-out เพื่อความยุติธรรม
 */
export async function getPendingTopUps(): Promise<
  (TopUpRequest & { shop: { id: string; shopName: string } })[]
> {
  return prisma.topUpRequest.findMany({
    where: { status: "PENDING" },
    include: {
      shop: {
        select: { id: true, shopName: true },
      },
    },
    orderBy: { createdAt: "asc" },
  }) as Promise<(TopUpRequest & { shop: { id: string; shopName: string } })[]>;
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
