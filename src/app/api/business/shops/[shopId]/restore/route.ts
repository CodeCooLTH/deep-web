import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { restoreBusinessShop } from "@/services/business-shop.service";

/**
 * POST /api/business/shops/[shopId]/restore — owner กู้คืน Business shop ที่ soft-delete ไว้ (ภายใน grace window)
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 * status ACTIVE/LOCKED มาจาก service (fits quota → ACTIVE ไม่มี lock, เกิน quota → LOCKED
 * ด้วยเหตุผล QUOTA_EXCEEDED_BUSINESS_COUNT) — route แค่ map field ออกตาม shape API.md §4.9
 *
 * API.md §4.9
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId } = await params;

  try {
    const shop = await restoreBusinessShop(ownerId, shopId);
    const status = shop.packageLockedAt ? "LOCKED" : "ACTIVE";
    return NextResponse.json({ shopId: shop.id, status, lockReason: shop.packageLockReason });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_DELETED") {
      return NextResponse.json({ error: "NOT_DELETED" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "RESTORE_WINDOW_EXPIRED") {
      return NextResponse.json({ error: "RESTORE_WINDOW_EXPIRED" }, { status: 410 });
    }
    console.error("[POST /api/business/shops/[shopId]/restore] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
