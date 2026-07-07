import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { findOrCreateCustomer } from "@/services/customer.service";

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
  | { kind: "OPEN_CLAIM" }
  | { kind: "PHONE_MATCH_AUTO_CLAIM" }
  | { kind: "OTP_CLAIM_REQUIRED"; targetPhone: string }
  | { kind: "OTP_CLAIM_BLOCKED" }
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

  if (order.buyerContact == null) {
    return order.status === "PENDING"
      ? { kind: "OPEN_CLAIM" }
      : { kind: "LEGACY_NO_CLAIM" }; // defensive — ไม่ควรเกิดตาม state machine ปัจจุบัน
  }

  const contactPhone = normalizePhone(order.buyerContact);
  if (!contactPhone) return { kind: "LEGACY_NO_CLAIM" }; // อีเมล/รูปแบบไม่ใช่เบอร์

  if (!session.phone || session.phone !== contactPhone) {
    return { kind: "OTP_CLAIM_BLOCKED" };
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

    await prisma.$transaction(async (tx) => {
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

      await tx.order.updateMany({ where: { id: params.orderId, buyerUserId: null }, data: { buyerUserId: params.userId } });
      await tx.order.updateMany({ where: { id: params.orderId, customerId: null }, data: { customerId } });
    });
  } catch (e) {
    console.error("[guaranteeOrderLink] best-effort link failed", { orderId: params.orderId, userId: params.userId }, e);
  }
}
