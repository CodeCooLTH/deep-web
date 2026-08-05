import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { softDeleteBusinessShop, updateBusinessShop } from "@/services/business-shop.service";
import * as v from "valibot";
import { UpdateBusinessShopSchema } from "@/lib/validations";
import { BUSINESS_DELETE_RETENTION_DAYS } from "@/lib/business-package";

/**
 * DELETE /api/business/shops/[shopId] — owner soft-delete Business shop (ไม่ลบข้อมูลจริง)
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 * purgeDeadline คำนวณที่ route (deletedAt + BUSINESS_DELETE_RETENTION_DAYS) — service คืนแค่ shop record
 *
 * API.md §4.8
 */
/**
 * PATCH /api/business/shops/[shopId] — แก้ข้อมูลธุรกิจจากหน้า settings (feature 00030 ext)
 * guard เดียวกับ DELETE: ownerId จาก session เท่านั้น + service verify ownership อีกชั้น
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateBusinessShopSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const shop = await updateBusinessShop(ownerId, shopId, parsed.output);
    return NextResponse.json({ shopId: shop.id });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "ALREADY_DELETED") {
      return NextResponse.json({ error: "ALREADY_DELETED" }, { status: 409 });
    }
    console.error("[PATCH /api/business/shops/[shopId]] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId } = await params;

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
