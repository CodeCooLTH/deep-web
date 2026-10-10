import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability, listAccessibleShopIds } from "@/lib/shop-capability";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { listChannels, resubscribeShopChannels } from "@/services/shop-channel.service";
import { sessionUserId } from "@/lib/session-user";

// T1 (feature 00018): list ช่องทาง (ShopChannel) ของร้าน — ใช้โดย Chat Rail filter "เพจ" +
// หน้า /settings/channels
//
// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) เก็บ/serve ทับข้าม user
// (บทเรียนโปรเจกต์ 2026-07-04: default header เป็น public ทำให้ carrier cache ข้าม user)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * GET /api/channels — คืนรายการ ShopChannel ของร้านที่ active จริงของผู้เรียก
 *
 * ทำไม shop derive จาก resolveActiveShopContext เท่านั้น (ไม่รับ shopId จาก client):
 * DAL ownership — session.user เป็น single source of truth เดียวกับ pattern
 * GET /api/chat/conversations (seller branch)
 *
 * bug fix (แชทไม่แยกตามร้าน): เดิมใช้ getShopByUserId ซึ่งคืน PERSONAL เสมอ ไม่สนว่ากำลัง
 * active ร้านไหนอยู่ — สลับไปร้าน B แล้วตัวกรอง "เพจ" ยังโชว์ของ PERSONAL. resolve ไม่ได้
 * (ร้านถูกลบ/หลุดสิทธิ์) → 404 ตรง ๆ ห้าม fallback เงียบ ๆ ไป PERSONAL
 *
 * listChannels() เลือก field แบบ allow-list ไว้แล้ว (ไม่มี accessTokenEnc) — ห้ามแก้ให้ดึงทั้งแถว
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  // 00071 S-13: รายการเพจ (ตัวกรอง "เพจ" ของกล่องแชท) = H1 — ผู้ตอบแชทเห็นเพจของร้านได้ แต่เชื่อม/ถอด/ซิงก์ = H3
  // อ่านแถวสมาชิกสด: 401 / 404 ไม่มีร้าน / 403 FORBIDDEN_ROLE
  const gate = await requireShopCapability(session, "H1");
  if (!gate.ok) return gate.response;
  const activeCtx = { shopId: gate.shopId };

  try {
    const channels = await listChannels(activeCtx.shopId);
    return NextResponse.json({ items: channels }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    console.error("[GET /api/channels] shopId:", activeCtx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/**
 * POST /api/channels — ซิงก์ subscription ของทุกเพจในร้าน (subscribed_fields ชุดล่าสุด)
 *
 * ทำไมต้องมี (user report 2026-07-23 "อ่านแล้วแต่ไม่ขึ้นว่าอ่านแล้ว"): Meta ล็อก `subscribed_fields`
 * ไว้ตั้งแต่ตอนกดเชื่อมเพจครั้งแรก — เพจที่เชื่อมก่อนเราเพิ่ม field `message_reads` (read receipt)
 * จะไม่ได้รับ event นั้นเลยตลอดไป ทั้งที่ webhook handler ฝั่งเรารองรับแล้ว. เดิมทางแก้เดียวคือ
 * ถอดเพจแล้วเชื่อมใหม่ผ่าน OAuth ทั้งชุด — หนักเกินเหตุสำหรับการเรียก API เดียวที่ Meta idempotent
 *
 * ไม่รับ body ใด ๆ (ไม่มีอะไรให้ตั้งค่า)
 *
 * ขอบเขต (แก้ 2026-08-08): ซิงก์ **ทุกร้านที่ผู้เรียกเข้าถึงได้** ไม่ใช่แค่ร้านที่ active
 *
 * ทำไมถึงเปลี่ยน: เดิมเจ้าของหลายร้านต้องสลับร้านแล้วกดปุ่มซ้ำทีละร้าน ซึ่งเป็นงานที่ไม่มีใครรู้ว่า
 * ต้องทำ (ปุ่มไม่ได้บอกว่ามันทำแค่ร้านเดียว) และพอลืมร้านใดร้านหนึ่ง เพจนั้นก็เงียบต่อไปโดยไม่มี
 * อะไรฟ้อง — อาการเดียวกับที่เพิ่งเจอ 2026-08-08 (Meta AI ตอบแล้วเธรดไม่เข้าระบบ เพราะเพจไม่เคย
 * subscribe messaging_handovers)
 *
 * ปลอดภัยที่จะทำทุกร้าน: Meta idempotent (เรียกซ้ำได้ไม่กระทบข้อความ/การเชื่อมต่อเดิม) และผู้ใช้
 * ทำสิ่งนี้กับทุกร้านได้อยู่แล้วด้วยการสลับร้านไปกด — เปลี่ยนแค่จำนวนคลิก ไม่ได้เปลี่ยนสิทธิ์
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  // "มี session" ≠ "รู้ว่าเป็นใคร" — ดึงตัวตนจริงก่อนถามรายชื่อร้าน
  const userId = sessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 00071 S-13: ซิงก์เพจ = H3 — เฉพาะร้านที่ผู้ใช้ถือ H3 (ผู้ตอบแชท/ผู้ดูแลบิล/ช่างไม่ถูกนับ)
  // ว่าง = เป็นสมาชิกแต่ไม่มีร้านไหนที่ถือ H3 (ผู้ใช้ทุกคนมีร้านส่วนตัวเป็นเจ้าของ จึงว่างได้เฉพาะสมาชิกล้วน) → 403
  const shopIds = await listAccessibleShopIds(userId, "H3");
  if (shopIds.length === 0) return forbiddenRoleResponse();

  try {
    let ok = 0;
    let failed = 0;
    for (const shopId of shopIds) {
      // ร้านหนึ่งล้มต้องไม่ทำให้ร้านที่เหลือไม่ถูกซิงก์ — ตัวฟังก์ชันนับ ok/failed รายเพจให้อยู่แล้ว
      // แต่ throw ได้ถ้าถามฐานไม่ผ่าน จึงกันเป็นรายร้านอีกชั้น
      try {
        const r = await resubscribeShopChannels(shopId);
        ok += r.ok;
        failed += r.failed;
      } catch (e) {
        failed += 1;
        console.error("[POST /api/channels] shopId:", shopId, e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ ok, failed, shops: shopIds.length }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    console.error("[POST /api/channels]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
