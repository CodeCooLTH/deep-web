import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// charset ตัด 0/O/1/I ออก (สับสนตาแมว) — เหลือ 32 สัญลักษณ์ [A-Z2-9]
// 12 chars * 5 bit/char = 60-bit entropy ซึ่งเป็น threshold ของ D1 spec
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// อายุ code 72 ชั่วโมง ตาม OQ-3
const EXPIRY_HOURS = 72;

/**
 * สุ่ม 12-char code จาก charset [A-Z2-9] ด้วย crypto.randomBytes
 * ห้ามใช้ Math.random() หรือ sequential — RC-8 / D1 entropy requirement
 */
function generateSecureCode(): string {
  // randomBytes(12) → 12 bytes; แต่เราใช้ทีละ 1 byte ต่อตัวอักษร (byte % 32)
  // map: byte % 32 → ไม่มี modulo bias มาก (256/32=8 exact) — สม่ำเสมอทุก symbol
  const bytes = crypto.randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += CHARSET[bytes[i] % 32];
  }
  return code;
}

function hashCode(rawCode: string): string {
  return crypto.createHash("sha256").update(rawCode).digest("hex");
}

/**
 * ออก SmsCode ใหม่สำหรับ order + buyerPhone
 *
 * - rawCode: คืนให้ caller เพื่อใส่ SMS เท่านั้น — ห้าม log (RC-8)
 * - smsCodeId: id ของ row ที่สร้าง — caller ใช้ส่งต่อให้ markSmsCodeDelivery
 *   (ไม่ต้อง re-hash หรือ expose codeHash ออกนอก service layer)
 * - เก็บ codeHash (SHA-256) ใน DB — ไม่เก็บ raw
 * - expiresAt = now + 72h (OQ-3)
 * - deliveryStatus เริ่มที่ "PENDING" ให้ route อัปเดตเป็น SENT/FAILED (RC-3 reconcile)
 */
export async function issueSmsCode(
  orderId: string,
  buyerPhone: string,
): Promise<{ rawCode: string; smsCodeId: string }> {
  const rawCode = generateSecureCode();
  const codeHash = hashCode(rawCode);

  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

  const smsCodeRow = await prisma.smsCode.create({
    data: {
      codeHash,
      orderId,
      buyerPhone,
      expiresAt,
      // usedAt: null → single-use enforce ใน consumeSmsCode
      deliveryStatus: "PENDING",
    },
  });

  // RC-8: ห้าม log rawCode — caller รับไปใส่ SMS แล้วทิ้ง; ห้าม persist/log
  // คืน smsCodeId ด้วยเพื่อให้ caller ส่งต่อ markSmsCodeDelivery โดยไม่ต้อง re-hash
  return { rawCode, smsCodeId: smsCodeRow.id };
}

/**
 * Consume SMS code เพื่อ unlock order
 *
 * Return: { order } เมื่อสำเร็จ, null ทุกกรณีที่ไม่ผ่าน
 *
 * RC-2 (no-oracle / timing-flatten): ทุก failure path เดิน query ในปริมาณใกล้เคียงกัน
 * — flatten early-return กระจาย depth ออก: ทำ updateMany guard ก่อน จากนั้น load order
 * เสมอ แม้จะยัง fail ที่ buyerContact check ทีหลัง — ทุก failure path cost ≈ 3 queries
 * Residual timing: updateMany สำเร็จ (count=1) vs ล้มเหลว (count=0) ยังต่างอยู่เล็กน้อย
 * เนื่องจาก PostgreSQL WAL write; rate-limit ที่ T-route (endpoint T13/consume) ลด
 * exploitability ให้อยู่ในระดับ MVP-acceptable — Phase-5 security จะเพิ่ม
 * constant-time padding หรือ delay
 *
 * RC-1 (single-use / TOCTOU fix): ใช้ conditional updateMany แทน update ธรรมดา
 * เหตุผล: READ COMMITTED default ของ Prisma interactive tx → 2 concurrent request
 * ที่ findFirst พร้อมกันจะเห็น usedAt:null ทั้งคู่ก่อน commit → ถ้าใช้ update ธรรมดา
 * ทั้งคู่ update สำเร็จ = double-consume (auth bypass). updateMany + WHERE usedAt IS NULL
 * ทำให้คนที่สอง count=0 → reject ทันที atomic (mirror wallet.service.ts deduct pattern)
 *
 * RC-6 (buyerContact lock): ถ้า order.buyerContact ยัง null → set เป็น buyerPhone
 * ของ SmsCode ใน tx เดียว (ปิด free open-claim) ถ้า order.buyerContact มีแล้วและ
 * ไม่ตรงกับ smsCode.buyerPhone → reject (null) ทันที
 *
 * NOTE: rate-limit per-IP/per-order เป็นหน้าที่ของ route layer (endpoint T13/consume)
 * ไม่ใช่ service layer นี้ — reviewer ต้องตรวจ route ด้วย
 */
export async function consumeSmsCode(
  rawCode: string,
): Promise<{ order: Awaited<ReturnType<typeof prisma.order.findFirst>> } | null> {
  const codeHash = hashCode(rawCode);

  // RC-8: ห้าม log codeHash หรือ rawCode
  const result = await prisma.$transaction(async (tx) => {
    // RC-2 flatten step 1: ค้นหา smsCode (not-found / expired / already-used รวมใน WHERE)
    const smsCode = await tx.smsCode.findFirst({
      where: {
        codeHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    // RC-1 + RC-2 flatten step 2: conditional updateMany guard — ทำก่อน load order เสมอ
    // ทำไม updateMany แทน update: ถ้า 2 request race กัน คนแรก count=1 ผ่าน;
    // คนที่สอง WHERE usedAt IS NULL ไม่ match → count=0 → null ทันที (ไม่ไปแตะ order)
    // ถ้า findFirst ไม่เจอ smsCode ให้ส่ง updateMany ที่ id='' เพื่อ flatten timing
    // (ยังคง cost 1 DB round-trip เหมือน path ที่เจอ smsCode แต่ count=0 เสมอ)
    const guardRes = await tx.smsCode.updateMany({
      where: {
        id: smsCode?.id ?? "",
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // RC-2 flatten step 3: load order เสมอ — ไม่ว่า guard จะผ่านหรือไม่
    // เพื่อให้ทุก failure path cost ≈ 3 queries (findFirst + updateMany + findFirst order)
    const order = await tx.order.findFirst({
      where: { id: smsCode?.orderId ?? "" },
      include: {
        items: true,
        shop: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                username: true,
                trustScore: true,
                userBadges: { include: { badge: true } },
              },
            },
          },
        },
        buyer: { select: { id: true, displayName: true, username: true } },
        shipmentTracking: true,
        review: true,
      },
    });

    // RC-1: guard ล้มเหลว (count=0) → double-consume หรือ code ไม่ถูกต้อง → reject
    // ทำหลัง load order เพื่อ flatten timing (ทุก path ผ่าน 3 queries แล้ว)
    if (!smsCode || guardRes.count === 0) return null;

    // RC-2: order ไม่เจอ → null (ไม่แยกจาก smsCode ไม่เจอ)
    if (!order) return null;

    // RC-6: buyerContact lock
    // ถ้า order.buyerContact มีแล้ว และไม่ตรงกับ smsCode.buyerPhone → reject
    // ป้องกันคนอื่น unlock order ด้วย code ที่ผูก phone ต่างกัน
    if (order.buyerContact !== null && order.buyerContact !== smsCode.buyerPhone) {
      // RC-2: คืน null เหมือนกัน — ไม่บอก caller ว่า phone mismatch
      return null;
    }

    // RC-6: ถ้า order.buyerContact ยัง null → ปิด open-claim ทันทีใน tx เดียวกัน
    // (กัน race ที่คนอื่นจะ claim ด้วยเบอร์อื่นผ่าน UUID link ในช่วงเวลาเดียวกัน)
    if (order.buyerContact === null) {
      await tx.order.update({
        where: { id: order.id },
        data: { buyerContact: smsCode.buyerPhone },
      });
      // อัปเดต object ใน-memory ด้วยเพื่อ return ที่ถูกต้อง
      order.buyerContact = smsCode.buyerPhone;
    }

    return { order };
  });

  return result;
}

/**
 * อัปเดต deliveryStatus ของ SmsCode หลัง SMS ส่ง
 *
 * รับ smsCodeId (primary key ของ row) จาก issueSmsCode response —
 * ไม่ใช้ codeHash อีกต่อไปเพื่อลด surface area ที่ hash ต้องวิ่งนอก service layer
 * RC-3 / AR-1: caller ส่ง smsCodeId → SENT หรือ FAILED หลัง SMS gateway ตอบ
 * RC-8: ห้าม log smsCodeId ที่รับมา (เป็น internal DB id ไม่ใช่ secret แต่ยึด policy)
 */
export async function markSmsCodeDelivery(
  smsCodeId: string,
  status: "SENT" | "FAILED",
): Promise<void> {
  await prisma.smsCode.updateMany({
    where: { id: smsCodeId },
    data: { deliveryStatus: status },
  });
}
