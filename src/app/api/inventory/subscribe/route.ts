import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import { subscribeInventoryEntitlement } from "@/services/inventory-entitlement.service";
import { SubscribeInventorySchema } from "@/lib/validations";

/**
 * POST /api/inventory/subscribe — seller สมัคร Inventory Add-on ครั้งแรก (เลือก package BASIC/PRO — ฿ หัก atomic)
 *
 * ทำไม shop derive จาก session เท่านั้น (ไม่รับ shopId จาก body):
 * DAL ownership (S-C7 pattern — ดู src/app/api/wallet/topup/route.ts) — ถ้ารับ
 * shopId จาก client, seller A อาจส่ง shopId ของ seller B เพื่อสมัคร/หักเครดิตแทนคนอื่น.
 * session.user.id เป็น single source of truth สำหรับ identity — ดู API.md §2.
 *
 * Request body: { package: 'BASIC' | 'PRO' } — API.md §4.1 (BREAKING feature 00009 — เดิม {})
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // cast เหมือน pattern ที่มีอยู่ใน src/app/api/wallet/route.ts:29
  const userId = (session.user as any).id as string;

  // 2. DAL: shop derive จาก session userId เท่านั้น — ห้ามรับ shopId จาก client
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }

  // 2.5 parse body — ต้องระบุ package (BASIC/PRO) ตาม API.md §4.1
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = v.safeParse(SubscribeInventorySchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // 3. เรียก service — business logic (idempotency guard + deduct + create) อยู่ใน service
  try {
    const result = await subscribeInventoryEntitlement(shop.id, parsed.output.package);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "ENTITLEMENT_ALREADY_EXISTS") {
      return NextResponse.json({ error: "สมัครใช้งานอยู่แล้ว" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { error: "เครดิตไม่พอ กรุณาเติมเครดิตก่อนสมัคร" },
        { status: 402 },
      );
    }
    console.error("[POST /api/inventory/subscribe] shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
