import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { SellerWallet, WalletTransaction } from "@prisma/client";

/**
 * getOrCreateWallet — idempotent: คืน wallet เดิมถ้ามีแล้ว, สร้างใหม่ถ้ายังไม่มี
 * ใช้ upsert เพื่อกัน race ตอน shop เพิ่งลงทะเบียน + 2 request พร้อมกัน
 */
export async function getOrCreateWallet(shopId: string): Promise<SellerWallet> {
  return prisma.sellerWallet.upsert({
    where: { shopId },
    update: {}, // ไม่ update อะไร — แค่ดึง record เดิมคืนถ้ามี
    create: {
      shopId,
      balance: 0,
    },
  });
}

/**
 * getBalance — คืน balance (฿) ของ shop; คืน 0 ถ้ายังไม่มี wallet
 */
export async function getBalance(shopId: string): Promise<number> {
  const wallet = await prisma.sellerWallet.findUnique({
    where: { shopId },
    select: { balance: true },
  });
  return wallet?.balance ?? 0;
}

/**
 * getTransactions — ดึงประวัติธุรกรรมของ shop (desc createdAt)
 * limit default 50 เพื่อกัน payload ใหญ่เกิน; caller ปรับได้
 */
export async function getTransactions(
  shopId: string,
  limit = 50,
): Promise<WalletTransaction[]> {
  const wallet = await prisma.sellerWallet.findUnique({
    where: { shopId },
    select: { id: true },
  });
  if (!wallet) return [];

  return prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * deductCredit — RC-3 CRITICAL: หักเครดิต atomic, ไม่มีทางติดลบ
 *
 * ทำไม conditional updateMany ไม่ใช่ read-then-decrement:
 * ถ้า read balance ก่อน แล้ว decrement ทีหลัง (2 query) — concurrent request 2 ตัว
 * อ่าน balance เดียวกัน (เช่น ฿5) พร้อมกัน → ทั้งคู่ผ่าน check → deduct ทั้งคู่ →
 * balance ติดลบ −5 (race double-deduct). conditional WHERE balance >= amount
 * ทำ atomic: DB รับ UPDATE ทีเดียว; ถ้า 2 concurrent → คนแรกชนะ count=1,
 * คนที่สอง WHERE ไม่ตรง → count=0 → rollback → INSUFFICIENT_CREDIT (ไม่มี double-deduct).
 * DB CHECK(balance >= 0) เป็น backstop ชั้นสุดท้าย; WHERE balance >= amount คือ primary guard.
 *
 * @param shopId   - shop เจ้าของ wallet
 * @param amount   - จำนวน ฿ ที่ต้องการหัก (ต้องเป็น integer > 0)
 * @param refId    - reference id เช่น orderId หรือ SmsCode id (optional, ใช้ trace)
 * @param description - คำอธิบายธุรกรรม เช่น "ส่ง SMS order XYZ"
 * @throws Error("INSUFFICIENT_CREDIT") ถ้า balance < amount (หรือไม่มี wallet)
 */
export async function deductCredit(
  shopId: string,
  amount: number,
  refId: string | undefined,
  description: string,
  tx?: Prisma.TransactionClient,
): Promise<WalletTransaction> {
  // guard: amount ต้องเป็น integer บวก — ป้องกัน negative/zero amount ที่ทำให้
  // WHERE balance >= -5 จริงเสมอ → balance - (-5) = balance + 5 (deduct กลายเป็น credit เงียบ ๆ)
  // และ amount=0 สร้าง ledger entry ปลอม; Valibot route เป็น defense-in-depth เท่านั้น
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  // logic หลักใน closure แยกออกมาเพื่อ reuse ระหว่าง branch tx-param vs own-$transaction
  const run = async (client: Prisma.TransactionClient): Promise<WalletTransaction> => {
    // conditional update: WHERE balance >= amount — atomic ใน DB level
    // ถ้า 2 request concurrent ด้วย balance เดิม → คนแรก count=1, คนที่สอง count=0
    const res = await client.sellerWallet.updateMany({
      where: {
        shopId,
        balance: { gte: amount },
      },
      data: {
        balance: { decrement: amount },
      },
    });

    if (res.count === 0) {
      // balance < amount หรือ wallet หายไป → rollback transaction ทั้งหมด
      throw new Error("INSUFFICIENT_CREDIT");
    }

    // อ่าน balance หลัง deduct เพื่อบันทึกใน ledger (ต้องอยู่ใน transaction เดิม)
    const wallet = await client.sellerWallet.findUnique({
      where: { shopId },
      select: { id: true, balance: true },
    });

    // wallet ไม่ควร null ณ จุดนี้ (เพิ่ง updateMany สำเร็จ) แต่ type guard เพื่อ TS strict
    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    return client.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "DEDUCT",
        amount,
        balanceAfter: wallet.balance,
        description,
        refId: refId ?? null,
      },
    });
  };

  if (tx) {
    // caller จัดการ transaction ภายนอก (เช่น T7 wrap order + deduct atomic) — ใช้ tx ตรง ๆ
    // ต้อง getOrCreateWallet ก่อนแต่ต้องอยู่ใน tx เดียวกัน; upsert ผ่าน tx client
    await tx.sellerWallet.upsert({
      where: { shopId },
      update: {},
      create: { shopId, balance: 0 },
    });
    return run(tx);
  }

  // ไม่มี tx จากภายนอก → เปิด $transaction เอง (พฤติกรรมเดิม)
  await getOrCreateWallet(shopId);
  return prisma.$transaction(run);
}

/**
 * creditWallet — เพิ่มเครดิต (topup) atomic; reuse ได้จาก topup.service หรือ route ใดก็ตาม
 * T5 (topup.service) ควรเรียก creditWallet นี้แทนทำเอง — single source of truth สำหรับ topup ledger
 *
 * @param shopId      - shop เจ้าของ wallet
 * @param amount      - จำนวน ฿ ที่ต้องการเพิ่ม (integer > 0)
 * @param refId       - reference id เช่น TopUpRequest.id
 * @param description - คำอธิบาย เช่น "TopUp อนุมัติโดย admin"
 */
export async function creditWallet(
  shopId: string,
  amount: number,
  refId: string | undefined,
  description: string,
  tx?: Prisma.TransactionClient,
): Promise<WalletTransaction> {
  // guard: amount ต้องเป็น integer บวก — ป้องกัน negative amount ที่ทำให้ increment กลายเป็น
  // deduct เงียบ ๆ, และ amount=0 สร้าง ledger entry ปลอม ทั้งคู่เป็น money bug
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  // logic หลักใน closure เพื่อ reuse ระหว่าง branch tx-param vs own-$transaction
  const run = async (client: Prisma.TransactionClient): Promise<WalletTransaction> => {
    // increment balance atomic — topup ไม่มีเงื่อนไข negative (เพิ่มเสมอ)
    await client.sellerWallet.update({
      where: { shopId },
      data: { balance: { increment: amount } },
    });

    const wallet = await client.sellerWallet.findUnique({
      where: { shopId },
      select: { id: true, balance: true },
    });

    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    return client.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "TOPUP",
        amount,
        balanceAfter: wallet.balance,
        description,
        refId: refId ?? null,
      },
    });
  };

  if (tx) {
    // caller (เช่น T5 topup.service) ส่ง tx มา → ใช้ตรง ๆ โดยไม่เปิด $transaction ซ้อน
    // Prisma ไม่รองรับ nested $transaction จริง — ซ้อนแล้ว tx ชั้นในจะได้ client คนละตัว
    // ซึ่งทำให้ atomic ไม่จริง (TopUpRequest.status=APPROVED + credit อาจ partial commit)
    await tx.sellerWallet.upsert({
      where: { shopId },
      update: {},
      create: { shopId, balance: 0 },
    });
    return run(tx);
  }

  // ไม่มี tx จากภายนอก → เปิด $transaction เอง (พฤติกรรมเดิม)
  await getOrCreateWallet(shopId);
  return prisma.$transaction(run);
}
