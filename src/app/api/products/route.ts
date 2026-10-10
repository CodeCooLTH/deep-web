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
import { requireShopCapability } from "@/lib/shop-capability";
import { can } from "@/lib/shop-permissions";
import { isBillingOnlyFor } from "@/lib/order-role-rules";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  /**
   * `?shopId=` = ร้านของเธรดที่เปิดอยู่ (feature 00037) — ไม่ส่ง = ร้านที่ active (พฤติกรรมเดิม)
   *
   * 🛑 ทำไม read ก็ต้องกั้น ไม่ใช่แค่ write: แผงเลือกสินค้าในแชท (`ProductPickerPanel`,
   * `ProductMultiSelectSheet`) ใช้ผลจาก endpoint นี้ไปส่ง "การ์ดสินค้า" ให้ลูกค้า —
   * หยิบผิดร้าน = ส่งชื่อ/ราคา/รูปของอีกร้านออกไปหาลูกค้าจริง โดยไม่มีอะไรบนจอบอกว่าผิด
   * (คลาสเดียวกับบั๊กสร้างออเดอร์ที่ปิดไปเมื่อ 2026-08-11 — ดู requireShopForRequest)
   */
  const requestedShopId = request.nextUrl.searchParams.get("shopId");
  if (requestedShopId !== null && !v.is(v.pipe(v.string(), v.uuid()), requestedShopId)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const gate = await requireShopCapability(session, "P1", { shopId: requestedShopId });
  if (!gate.ok) {
    // เป็นสมาชิกแต่ไม่มี P1 → 403 FORBIDDEN_ROLE ตามเดิมของทะเบียนสิทธิ์
    // ไม่ใช่สมาชิก/ไม่มีร้าน → [] ตามสัญญาข้อ 3 ของ 00037 API.md ("รายการ" ไม่ใช่ทรัพยากรที่ระบุ — 403 จะยืนยันว่าร้านมีอยู่)
    return gate.reason === "FORBIDDEN_ROLE" ? gate.response : NextResponse.json([]);
  }
  const shop = gate.active.shop;
  // 00071 P3: ต้นทุนสินค้า = เจ้าของเท่านั้น — role ของร้านที่ขอ (ไม่ใช่ร้าน active)
  const canSeeCost = can(gate.roles, "P3");
  // P1 ของ BILLING = เฉพาะสินค้าประเภทบริการ — กรองที่ server ไม่ใช่แค่ซ่อนในฟอร์ม (ยิงตรงต้องไม่เห็นสินค้าจัดส่ง/ต้นทุนร้านอื่น)
  const serviceOnly = isBillingOnlyFor(gate.roles, "P1");

  const products = (await getProductsByShop(shop.id)).filter((p) => !serviceOnly || p.type === "SERVICE");

  // ?sort=best — เรียงขายดีก่อน (feature 00018: แถบเลือกสินค้าในช่องพิมพ์ user สั่ง 2026-07-23)
  // คืน "สินค้าทั้งหมด" เหมือนเดิม แค่สลับลำดับ: ตัวที่เคยขายได้เรียงตามยอดขายรวม desc แล้วต่อด้วย
  // ตัวที่ยังไม่เคยขาย (คงลำดับ createdAt desc เดิม) — client จึงค้นหาได้ครบทั้งแคตตาล็อกเหมือนเดิม
  if (request.nextUrl.searchParams.get("sort") === "best") {
    const best = (await getBestSellerProducts(shop.id, 50)).filter((p) => !serviceOnly || p.type === "SERVICE");
    const rank = new Map(best.map((p, i) => [p.id, i]));
    const soldById = new Map(best.map((p) => [p.id, p.soldCount]));
    const ranked = products.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const rest = products.filter((p) => !rank.has(p.id));
    // แนบ soldCount ("สั่งซื้อแล้ว X ชิ้น" — นับทุกสถานะยกเว้น CANCELLED) ให้ UI แสดงแบบเดียวกับ BestSellerStrip บน command center
    return NextResponse.json(
      [...ranked, ...rest].map((p) => ({ ...serializeProduct(p, { canSeeCost }), soldCount: soldById.get(p.id) ?? 0 })),
    );
  }

  return NextResponse.json(products.map((p) => serializeProduct(p, { canSeeCost })));
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireShopCapability(session, "P2");
  if (!gate.ok) return gate.response;
  const active = gate.active;
  if (active.locked) return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
  const shop = active.shop;

  const body = await request.json();
  const parsed = v.safeParse(CreateProductSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // 00071 D-7: ผู้ไม่ใช่เจ้าของส่งคีย์ cost มา (แม้ null) = 403 · ไม่ส่งคีย์ = ผ่านปกติ
  const canSeeCost = can(gate.roles, "P3");
  if (!canSeeCost && body !== null && typeof body === "object" && "cost" in body) return forbiddenRoleResponse();

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
  return NextResponse.json(serializeProduct(product, { canSeeCost }), { status: 201 });
}
