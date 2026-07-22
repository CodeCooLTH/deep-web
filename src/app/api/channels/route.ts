import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import { listChannels } from "@/services/shop-channel.service";

// T1 (feature 00018): list ช่องทาง (ShopChannel) ของร้าน — ใช้โดย Chat Rail filter "เพจ" +
// หน้า /settings/channels
//
// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) เก็บ/serve ทับข้าม user
// (บทเรียนโปรเจกต์ 2026-07-04: default header เป็น public ทำให้ carrier cache ข้าม user)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * GET /api/channels — คืนรายการ ShopChannel ของร้านผู้เรียก (personal shop เท่านั้น)
 *
 * ทำไม shop derive จาก getShopByUserId เท่านั้น (ไม่รับ shopId จาก client):
 * DAL ownership — session.user เป็น single source of truth เดียวกับ pattern
 * GET /api/chat/conversations (seller branch)
 *
 * listChannels() เลือก field แบบ allow-list ไว้แล้ว (ไม่มี accessTokenEnc) — ห้ามแก้ให้ดึงทั้งแถว
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const shop = await getShopByUserId(userId);
  if (!shop) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }

  try {
    const channels = await listChannels(shop.id);
    return NextResponse.json({ items: channels }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    console.error("[GET /api/channels] shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
