import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { softDeleteBusinessShop } from "@/services/business-shop.service";
import { BUSINESS_DELETE_RETENTION_DAYS } from "@/lib/business-package";

/**
 * DELETE /api/business/shops/[shopId] — owner soft-delete Business shop (ไม่ลบข้อมูลจริง)
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 * purgeDeadline คำนวณที่ route (deletedAt + BUSINESS_DELETE_RETENTION_DAYS) — service คืนแค่ shop record
 *
 * API.md §4.8
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  const { shopId } = await params;
  // 00071 T4: ลบร้าน = เจ้าของหลัก · คงรหัส NOT_OWNER ที่ UI เดิมอ่าน
  const gate = await requireShopCapability(session, "T4", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const ownerId = gate.userId;

  try {
    const shop = await softDeleteBusinessShop(ownerId, shopId);
    const deletedAt = shop.deletedAt as Date;
    const purgeDeadline = new Date(deletedAt.getTime() + BUSINESS_DELETE_RETENTION_DAYS * 86_400_000);
    return NextResponse.json({ shopId: shop.id, deletedAt, purgeDeadline });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "ALREADY_DELETED") {
      return NextResponse.json({ error: "ALREADY_DELETED" }, { status: 409 });
    }
    console.error("[DELETE /api/business/shops/[shopId]] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
