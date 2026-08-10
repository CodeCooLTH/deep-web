import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { findOrCreateCustomer } from "@/services/customer.service";
import { recordOrderEvent } from "@/services/order-event.service";

// feature 00015 (Order Claim & Forced Login) — SDS §4.0/§4.1
// resolveOrderAccess() เป็น pure decision core (ไม่มี I/O) แยกออกจาก
// guaranteeOrderLink() (best-effort DB write) ตาม TD-001/TD-002

export type OrderAccessInput = {
  orderId: string;
  buyerUserId: string | null;
  buyerContact: string | null; // raw จาก DB
  status: string; // 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
};

export type SessionInput = {
  userId: string | null; // null = ไม่มี session
  phone: string | null; // เบอร์ที่ resolve จาก DB ของ session user (null ถ้าไม่มี/ไม่มีเบอร์)
  justAuthedViaPhoneOtp: boolean;
};

export type OrderAccessDecision =
  | { kind: "NO_SESSION" }
  | { kind: "OWNER_MATCH" }
  | { kind: "OWNER_MISMATCH" }
  | { kind: "PHONE_MATCH_AUTO_CLAIM" }
  | { kind: "OTP_CLAIM_REQUIRED"; targetPhone: string }
  // PHONE_VERIFY_REQUIRED (แทน OTP_CLAIM_BLOCKED เดิม): บัญชีที่ล็อกอินอยู่ยังพิสูจน์ไม่ได้ว่า
  // เป็นเจ้าของออเดอร์ เพราะไม่มีเบอร์ผูกบัญชี หรือเบอร์ที่ผูกไว้คนละเบอร์กับที่ร้านคีย์
  // เดิมเคสนี้เป็น "ทางตัน" (มีแต่ปุ่มออกจากระบบ) ซึ่งกระทบผู้ซื้อที่ล็อกอินด้วย Facebook
  // เป็นหลัก เพราะ FB ไม่ให้เบอร์มา บัญชีที่เพิ่งสร้างจึงไม่มีเบอร์เสมอ
  // ตอนนี้ให้ไปต่อได้ด้วยการยืนยันเบอร์ที่ใช้สั่งซื้อผ่าน OTP (ดู PhoneVerifyPrompt)
  | { kind: "PHONE_VERIFY_REQUIRED" }
  | { kind: "LEGACY_NO_CLAIM" };

export function resolveOrderAccess(
  order: OrderAccessInput,
  session: SessionInput,
): OrderAccessDecision {
  if (!session.userId) return { kind: "NO_SESSION" };

  if (order.buyerUserId != null) {
    return order.buyerUserId === session.userId
      ? { kind: "OWNER_MATCH" }
      : { kind: "OWNER_MISMATCH" };
  }

  // ออเดอร์ที่ไม่มีเบอร์ผูก = ออเดอร์เก่าก่อน feature 00015 เท่านั้น — ของใหม่เป็นไปไม่ได้
  // แล้วเพราะ TFR-009 บังคับ buyerContact ทั้ง frontend (OrderCreateForm.tsx Yup) และ
  // backend (validations.ts CreateOrderSchema) ส่วนการจองก็เซ็ตเสมอที่ booking.service.ts
  //
  // เดิมเคสนี้คืน OPEN_CLAIM = ใครก็ได้ที่ล็อกอินแล้วถือลิงก์ เข้าดูออเดอร์ได้เต็ม ๆ แล้ว
  // guaranteeOrderLink() จะเซ็ต buyerUserId ให้ทันที → ลิงก์ที่ถูก forward เข้ากลุ่มแชท
  // "ใครเปิดก่อนได้เป็นเจ้าของถาวร" และเจ้าของตัวจริงจะเจอ OWNER_MISMATCH ตลอดไป
  //
  // ตามหลัก "เบอร์โทร = single source of truth ของตัวตน" เมื่อไม่มีเบอร์ให้เทียบก็พิสูจน์
  // ความเป็นเจ้าของไม่ได้ จึงบล็อกทุกกรณี ให้ไปยืนยันกับร้านโดยตรงแทน
  if (order.buyerContact == null) {
    return { kind: "LEGACY_NO_CLAIM" };
  }

  const contactPhone = normalizePhone(order.buyerContact);
  if (!contactPhone) return { kind: "LEGACY_NO_CLAIM" }; // อีเมล/รูปแบบไม่ใช่เบอร์

  if (!session.phone || session.phone !== contactPhone) {
    return { kind: "PHONE_VERIFY_REQUIRED" };
  }

  return session.justAuthedViaPhoneOtp
    ? { kind: "PHONE_MATCH_AUTO_CLAIM" }
    : { kind: "OTP_CLAIM_REQUIRED", targetPhone: session.phone };
}

/**
 * guaranteeOrderLink — best-effort/idempotent ผูก Customer+Customer.userId+
 * Order.buyerUserId+Order.customerId (รวมหน้าที่ "claim" ด้วยตาม TD-001 —
 * ไม่มี claimOrder() แยกต่างหาก)
 *
 * ทำไม try/catch ชั้นนอกสุดไม่ throw: ฟังก์ชันนี้ต้องไม่ทำให้ login/access
 * ล้มเหลว (NFR-Reliability) — error ใด ๆ log แล้ว return เฉย ๆ
 */
export async function guaranteeOrderLink(params: {
  orderId: string;
  userId: string;
  phone: string | null;
}): Promise<void> {
  try {
    if (!params.phone) return;
    const normalized = normalizePhone(params.phone);
    if (!normalized) return;

    const claimed = await prisma.$transaction(async (tx) => {
      const customerId = await findOrCreateCustomer(tx, normalized); // reuse 00014
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { userId: true } });

      if (customer && customer.userId == null) {
        try {
          await tx.customer.update({ where: { id: customerId }, data: { userId: params.userId } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            console.error("[guaranteeOrderLink] Customer.userId conflict — ไม่ override", { customerId, userId: params.userId });
          } else throw e;
        }
      } else if (customer && customer.userId !== params.userId) {
        console.error("[guaranteeOrderLink] Customer ผูกกับ user อื่นแล้ว — ไม่ override", { customerId, existingUserId: customer.userId });
      }

      // count > 0 = แถวถูกอัปเดตจริงในรอบนี้ = "เพิ่ง claim สำเร็จ" (ไม่ใช่ของที่ claim ไปแล้ว)
      // เงื่อนไข buyerUserId: null ทำให้ dedupe เกิดขึ้นเองแบบ atomic — ไม่ต้องมีกลไกนับซ้ำเพิ่ม
      const res = await tx.order.updateMany({ where: { id: params.orderId, buyerUserId: null }, data: { buyerUserId: params.userId } });
      await tx.order.updateMany({ where: { id: params.orderId, customerId: null }, data: { customerId } });
      return res.count > 0;
    });

    // feature 00041 (SRS TFR-013) — instrumentation ของ Login Completion Rate
    //
    // 🛑 ต้องอยู่ "นอก" $transaction ข้างบนเด็ดขาด ห้ามย้ายเข้าไป:
    // $transaction ของ Prisma เป็น all-or-nothing — ถ้า statement ใดใน callback throw มันจะ
    // ROLLBACK ทุกอย่างก่อนหน้ารวมถึงการ claim ที่สำเร็จไปแล้ว. และเพราะทั้งฟังก์ชันนี้ห่อด้วย
    // try/catch ที่กลืน error โดยเจตนา จะ **ไม่มีอะไรฟ้องเลย** — ผู้ซื้อ login สำเร็จแต่ระบบ
    // ไม่รู้ว่าเขาเป็นเจ้าของออเดอร์ = regression กลับไปที่ BUYER_CONFIRMED = 0 ซึ่งคือปัญหา
    // ที่ทั้งฟีเจอร์นี้ตั้งใจแก้ (มีเทส [blocker] มัดลำดับนี้ไว้ที่ order-access-claim.test.ts)
    if (claimed) {
      try {
        await recordOrderEvent(prisma, {
          orderId: params.orderId,
          type: "AUTH_FLOW_COMPLETED",
          actorUserId: params.userId,
        });
      } catch (e) {
        console.error("[guaranteeOrderLink] instrumentation write ล้ม — การ claim ยังสำเร็จปกติ", { orderId: params.orderId }, e);
      }
    }
  } catch (e) {
    console.error("[guaranteeOrderLink] best-effort link failed", { orderId: params.orderId, userId: params.userId }, e);
  }
}
