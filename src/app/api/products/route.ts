import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateProductSchema } from "@/lib/validations";
import {
  createProduct,
  getProductsByShop,
  getBestSellerProducts,
  serializeProduct,
} from "@/services/product.service";
import { isEntitlementActive, isProActive } from "@/services/inventory-entitlement.service";
import { requireActiveShop } from "@/lib/shop-context";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) return NextResponse.json([]);
  const shop = active.shop;

  const products = await getProductsByShop(shop.id);

  // ?sort=best — เรียงขายดีก่อน (feature 00018: แถบเลือกสินค้าในช่องพิมพ์ user สั่ง 2026-07-23)
  // คืน "สินค้าทั้งหมด" เหมือนเดิม แค่สลับลำดับ: ตัวที่เคยขายได้เรียงตามยอดขายรวม desc แล้วต่อด้วย
  // ตัวที่ยังไม่เคยขาย (คงลำดับ createdAt desc เดิม) — client จึงค้นหาได้ครบทั้งแคตตาล็อกเหมือนเดิม
  if (request.nextUrl.searchParams.get("sort") === "best") {
    const best = await getBestSellerProducts(shop.id, 50);
    const rank = new Map(best.map((p, i) => [p.id, i]));
    const soldById = new Map(best.map((p) => [p.id, p.soldCount]));
    const ranked = products.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const rest = products.filter((p) => !rank.has(p.id));
    // แนบ soldCount ("สั่งซื้อแล้ว X ชิ้น" — นับทุกสถานะยกเว้น CANCELLED) ให้ UI แสดงแบบเดียวกับ BestSellerStrip บน command center
    return NextResponse.json(
      [...ranked, ...rest].map((p) => ({ ...serializeProduct(p), soldCount: soldById.get(p.id) ?? 0 })),
    );
  }

  return NextResponse.json(products.map(serializeProduct));
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (active.locked) return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
  const shop = active.shop;

  const body = await request.json();
  const parsed = v.safeParse(CreateProductSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // stockQty — Inventory Add-on (feature 00003): guard เฉพาะเมื่อ caller ส่ง field นี้มา
  if (parsed.output.stockQty !== undefined) {
    if (parsed.output.type !== "PHYSICAL") {
      return NextResponse.json({ error: "STOCK_QTY_INVALID_PRODUCT_TYPE" }, { status: 400 });
    }
    if (!(await isEntitlementActive(shop.id))) {
      return NextResponse.json({ error: "INVENTORY_NOT_ACTIVE" }, { status: 403 });
    }
  }

  // lowStockThreshold — Deep Stock Pro (feature 00009): guard เฉพาะเมื่อ caller ส่ง field นี้มา (ต่อจาก guard stockQty ด้านบน — ห้ามแก้ของเดิม)
  if (parsed.output.lowStockThreshold !== undefined) {
    // POST ไม่มี product เดิม — effective type มาจาก parsed.output.type อย่างเดียว
    if (parsed.output.type !== "PHYSICAL") {
      return NextResponse.json({ error: "STOCK_QTY_INVALID_PRODUCT_TYPE" }, { status: 400 });
    }
    // effective stockQty มาจาก parsed.output.stockQty (POST ไม่มี product เดิมให้ fallback)
    const effectiveStockQty = parsed.output.stockQty;
    if (effectiveStockQty === null || effectiveStockQty === undefined) {
      return NextResponse.json({ error: "PRODUCT_NOT_TRACKED" }, { status: 400 });
    }
    if (!(await isProActive(shop.id))) {
      return NextResponse.json({ error: "INVENTORY_NOT_PRO" }, { status: 403 });
    }
  }

  // cost — ไม่มี guard แล้ว (D-EXT-1 2026-08-07): ราคาทุนเปิดฟรีทุกร้าน
  // ownership ของสินค้ามาจาก requireActiveShop ด้านบนอยู่แล้ว ซึ่งเป็นด่านที่จำเป็นจริง
  // ส่วนด่านเดิม (isCostEditAllowed) เช็คแค่ว่า owner จ่ายค่าแพ็กเกจหรือยัง = billing ล้วน

  // feature 00028 (BR-SBT-22) — ส่ง shopVertical เข้า service ให้ override fulfillmentMode default
  const product = await createProduct(shop.id, { ...parsed.output, shopVertical: shop.vertical });
  return NextResponse.json(serializeProduct(product), { status: 201 });
}
