import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { reactivateInventoryEntitlement } from "@/services/inventory-entitlement.service";
import { requireActiveShop } from "@/lib/shop-context";
import { ReactivateInventorySchema } from "@/lib/validations";
import { requireOnlineSalesVertical } from "@/lib/shop-api-guard";

/**
 * POST /api/inventory/reactivate — seller เปิดใช้ Inventory Add-on อีกครั้งจากสถานะ LOCKED
 * (เลือก package BASIC/PRO ใหม่ตอน reactivate — ไม่ auto-restore ค่าก่อนล็อก — ฿ หัก atomic)
 *
 * ทำไม shop derive จาก session เท่านั้น (ไม่รับ shopId จาก body):
 * DAL ownership (S-C7 pattern — ดู src/app/api/wallet/topup/route.ts) — ถ้ารับ
 * shopId จาก client, seller A อาจส่ง shopId ของ seller B เพื่อ reactivate/หักเงินแทนคนอื่น.
 * session.user.id เป็น single source of truth สำหรับ identity — ดู API.md §2.
 *
 * Request body: { package: 'BASIC' | 'PRO' } — API.md §4.3 (BREAKING feature 00009 — เดิม {})
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. DAL: shop derive จาก active shop context ของ session เท่านั้น — ห้ามรับ shopId จาก client
  // ไม่ gate locked — route นี้มีไว้เพื่อปลดล็อก shop ที่ locked อยู่แล้ว (service เองมี LOCKED guard)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }
  const shop = active.shop;

  // 2.4 vertical gate — Inventory Add-on เปิดเฉพาะ ONLINE_SALES (feature 00028 BR-SBT-10)
  const verticalGate = requireOnlineSalesVertical(shop.vertical);
  if (verticalGate) return verticalGate;

  // 2.5 parse body — ต้องระบุ package (BASIC/PRO) ตาม API.md §4.3
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = v.safeParse(ReactivateInventorySchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // 3. เรียก service — business logic (LOCKED guard + deduct + update) อยู่ใน service
  try {
    const result = await reactivateInventoryEntitlement(shop.id, parsed.output.package);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "ENTITLEMENT_NOT_LOCKED") {
      return NextResponse.json({ error: "บัญชีนี้ไม่ได้ถูกล็อก" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { error: "ยอดเงินไม่พอ กรุณาเติมเงินก่อนเปิดใช้อีกครั้ง" },
        { status: 402 },
      );
    }
    console.error("[POST /api/inventory/reactivate] shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
