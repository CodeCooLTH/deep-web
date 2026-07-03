import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setShopSlug } from "@/services/shop.service";
import { createProduct } from "@/services/product.service";
import { ShopSlugSchema, ShopCategorySchema } from "@/lib/validations";

// Body รวม 3 ขั้นตอนของ onboarding (ข้อมูลร้าน/slug/สินค้าแรก) — client เรียก endpoint นี้ทีละครั้ง
// ส่งแค่ field group ของ step ปัจจุบัน (partial) ยกเว้น product ที่ต้องมาคู่ name+price
const Body = v.object({
  shopName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
  category: v.optional(ShopCategorySchema),
  logo: v.optional(v.pipe(v.string(), v.maxLength(200))),
  slug: v.optional(ShopSlugSchema),
  product: v.optional(
    v.object({
      name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
      price: v.pipe(v.number(), v.minValue(0.01)),
    }),
  ),
});

/**
 * POST /api/business/shops/[shopId]/onboarding — feat 00008 Phase 4 (P4-7)
 *
 * ตั้งค่าร้าน Business ครั้งแรกก่อนใช้งาน: ชื่อร้าน/หมวดหมู่/โลโก้ (step ข้อมูลร้าน) →
 * slug (step บังคับ, public URL /{slug}) → สินค้าแรก (step skippable) — client เรียก
 * endpoint นี้ 2-3 ครั้งทีละ step. ไม่มี phone/OTP (Business ไม่มี auth แยก ใช้ login ของ owner)
 *
 * Guard: owner-only (mirror src/services/business-shop.service.ts softDeleteBusinessShop —
 *   `shop.userId !== ownerId` = NOT_OWNER) — ไม่ใช้ isShopMember เฉย ๆ เพราะ onboard = ตั้งค่า
 *   เริ่มต้นร้าน สงวนสิทธิ์เจ้าของ ไม่ใช่ admin member ที่ owner เชิญมาทีหลัง
 *
 * slug: reuse setShopSlug (src/services/shop.service.ts) — เหมือน
 *   src/app/api/shops/slug/route.ts (personal) ต่างแค่ scope shopId มาจาก path param
 *   แทน getPersonalShop(userId) — Shop.slug @unique ไม่แยก PERSONAL/BUSINESS จึงใช้ service เดิม
 *   ได้ตรง ๆ ไม่ต้อง fork logic
 *
 * product: reuse createProduct (src/services/product.service.ts) ตรง ๆ ไม่ผ่าน requireActiveShop
 *   (session-based, src/lib/shop-context.ts) — เพราะช่วง onboard session.user.activeShopId ยังไม่ถูก
 *   สลับมาที่ business นี้แน่นอน (D4 force-redirect ยังไม่ wire — P4-5) ต้อง scope ด้วย shopId จาก
 *   path param ตรง ๆ กันสินค้าไปสร้างผิดร้าน (ไม่แตะ product.service.ts เดิม — import ใช้เฉย ๆ)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { shopId } = await params;

  const parsed = v.safeParse(Body, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, userId: true, kind: true, deletedAt: true },
  });
  // ไม่มี/ไม่ใช่ BUSINESS/ถูกลบ → 404 (context isolation — ไม่บอก caller ว่า shop มีอยู่จริงไหม)
  if (!shop || shop.kind !== "BUSINESS" || shop.deletedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // owner-only — onboard สงวนสิทธิ์เจ้าของ (mirror business-shop.service.ts NOT_OWNER)
  if (shop.userId !== userId) {
    return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
  }

  const { shopName, category, logo, slug, product } = parsed.output;

  try {
    // slug ก่อน (มี TOCTOU guard ใน setShopSlug เอง — unique index เป็นด่านสุดท้าย)
    if (slug) {
      await setShopSlug(shop.id, slug);
    }

    const updateData: { shopName?: string; category?: string; logo?: string } = {};
    if (shopName) updateData.shopName = shopName;
    if (category) updateData.category = category;
    if (logo) updateData.logo = logo;
    if (Object.keys(updateData).length > 0) {
      await prisma.shop.update({ where: { id: shop.id }, data: updateData });
    }

    let productId: string | undefined;
    if (product) {
      const created = await createProduct(shop.id, { name: product.name, price: product.price, type: "PHYSICAL" });
      productId = created.id;
    }

    return NextResponse.json({ ok: true, ...(productId ? { productId } : {}) });
  } catch (e) {
    if (e instanceof Error && e.message === "SLUG_UNAVAILABLE") {
      return NextResponse.json({ error: "URL นี้มีคนใช้แล้ว" }, { status: 409 });
    }
    console.error("[POST /api/business/shops/[shopId]/onboarding] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
