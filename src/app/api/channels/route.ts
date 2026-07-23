import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { listChannels, resubscribeShopChannels } from "@/services/shop-channel.service";

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
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

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
 * ไม่รับ body ใด ๆ (ไม่มีอะไรให้ตั้งค่า) — ทำกับ "ร้านที่ active ของผู้เรียก" เท่านั้น
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

  try {
    const result = await resubscribeShopChannels(activeCtx.shopId);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    console.error("[POST /api/channels] shopId:", activeCtx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
