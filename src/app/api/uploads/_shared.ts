import { prisma } from "@/lib/prisma";
import { canAccessShopWith } from "@/lib/shop-capability";
import type { Capability } from "@/lib/shop-permissions";

/**
 * resolve ช่องทางของเธรด + เช็คสิทธิ์ว่า user นี้แตะเธรดนี้ได้จริง (ไม่ใช่แค่มี session)
 *
 * ถ้าไม่เช็ค ใครก็ได้ที่ล็อกอินจะ probe ได้ว่า conversationId ไหนมีอยู่จริง — เดิมโค้ดชุดนี้
 * ฝังอยู่ใน `/api/chat/upload` ที่เดียว ตอนนี้ `/api/uploads/ticket` และ `/api/uploads/commit`
 * ต้องใช้กฎเดียวกัน จึงยกออกมาเป็นตัวเดียว (สองที่ที่ตัดสินสิทธิ์ต่างกัน = ช่องโหว่รอเกิด)
 */
export type ChatChannelResult =
  | { ok: true; channel: string; shopId: string }
  | { ok: false; status: number; error: string };

export async function resolveChatChannelForUser(
  conversationId: string,
  userId: string,
  /** 00071 S-13: cap ที่ฝั่งร้านต้องถือ ('H2' = แนบไฟล์ส่งแชท) — ผู้ซื้อเจ้าของเธรด (buyerUserId) ไม่ใช้ */
  cap: Capability,
): Promise<ChatChannelResult> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { channel: true, shopId: true, buyerUserId: true },
  });
  if (!conv) return { ok: false, status: 404, error: "ไม่พบห้องแชทนี้" };

  // สมาชิกร้านต้องถือ cap (อ่านแถวสมาชิกสด) — BILLING/TECHNICIAN ได้ FORBIDDEN_ROLE (ข้อความเดียวกับ forbiddenRoleResponse)
  const allowed = conv.buyerUserId === userId || (await canAccessShopWith(conv.shopId, userId, cap));
  if (!allowed) return { ok: false, status: 403, error: "FORBIDDEN_ROLE" };

  // shopId เพิ่ม 2026-08-20 (feature 00051 S-5, TFR-CMD-11) — additive: conv.shopId มีอยู่แล้วใน
  // ผลลัพธ์ query ด้านบนตั้งแต่แรก เพียงแต่ไม่เคยถูกส่งออกมาให้ผู้เรียกใช้
  return { ok: true, channel: conv.channel, shopId: conv.shopId };
}

/**
 * ext ที่ปลอดภัยพอจะเอาไปประกอบเป็น storage key
 *
 * ext ถูกฝังใน key (`2026/08/10/<uuid>.<ext>`) ซึ่งกลายเป็นทั้ง path บน S3 และ URL ที่เสิร์ฟ
 * ต่อ — และ `/api/files` **derive Content-Type จาก ext ตัวนี้** ไม่ใช่จากค่าที่ storage เก็บ
 * ค่าที่หลุดกรอบ (เว้นวรรค, `../`, ยาวผิดปกติ) จึงต้องตกไป `bin` ไม่ใช่ถูกส่งต่อ
 */
export function safeStorageExt(ext: string): string {
  const e = (ext || "").toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(e) ? e : "bin";
}
