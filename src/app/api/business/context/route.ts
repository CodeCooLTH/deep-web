import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPersonalShop } from "@/lib/shop-context";
import { getSubscriptionStatus } from "@/services/business-package.service";
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from "@/lib/business-package";

/**
 * GET /api/business/context — คืนข้อมูล switcher + package summary ของ session user ปัจจุบัน
 * เรียกโดย AccountSwitcher และหน้า package matrix (preview ก่อน downgrade/cancel)
 *
 * ทำไม scope ทุก query ด้วย userId จาก session เท่านั้น (ไม่รับ id จาก client):
 * context isolation — ห้าม user A เห็น business ของ user B (ดู memory feedback_rsc_dal_authz)
 *
 * API.md §4.1
 */
export async function GET() {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // 2. personal shop
    const personalShop = await getPersonalShop(userId);
    const personal = personalShop ? { shopId: personalShop.id, shopName: personalShop.shopName } : null;

    // 3. subscription summary — null row = NOT_SUBSCRIBED (FREE pseudo-state)
    const sub = await getSubscriptionStatus(userId);
    const subscription = sub
      ? {
          tier: sub.tier,
          status: sub.status,
          nextRenewalAt: sub.nextRenewalAt,
          quota: {
            maxBusinesses: BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxBusinesses,
            maxAdminsPerBusiness: BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness,
          },
        }
      : null;

    // 4. businesses[] — ShopMember ของ userId ที่ shop.kind='BUSINESS' + ยังไม่ถูก soft-delete
    //    scope ด้วย userId ใน where ของ ShopMember (ไม่ใช่ filter ทีหลัง) — กัน user เห็น shop คนอื่น
    const memberships = await prisma.shopMember.findMany({
      where: { userId, shop: { kind: "BUSINESS", deletedAt: null } },
      select: {
        role: true,
        shop: {
          select: { id: true, shopName: true, logo: true, packageLockedAt: true, packageLockReason: true, deletedAt: true },
        },
      },
    });
    const businesses = memberships.map((m) => ({
      shopId: m.shop.id,
      shopName: m.shop.shopName,
      logo: m.shop.logo,
      role: m.role,
      locked: m.shop.packageLockedAt !== null,
      lockReason: m.shop.packageLockReason,
      deletedAt: m.shop.deletedAt,
    }));

    return NextResponse.json({
      personal,
      subscription,
      businesses,
      hasBusinessMembership: businesses.length > 0,
    });
  } catch (e: unknown) {
    console.error("[GET /api/business/context] userId:", userId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
