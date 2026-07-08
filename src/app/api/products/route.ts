import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateProductSchema } from "@/lib/validations";
import {
  createProduct,
  getProductsByShop,
  serializeProduct,
} from "@/services/product.service";
import { isEntitlementActive, isProActive } from "@/services/inventory-entitlement.service";
import { requireActiveShop } from "@/lib/shop-context";
import { isCostEditAllowed } from "@/services/expense-access.service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) return NextResponse.json([]);
  const shop = active.shop;

  const products = await getProductsByShop(shop.id);
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

  // cost — Expense & Cost Tracking (feature 00016): guard เฉพาะเมื่อ caller ส่ง field นี้มา
  // (ownership check ผ่านไปแล้วโดย requireActiveShop ด้านบน — isCostEditAllowed เช็คแค่ package ACTIVE)
  if (parsed.output.cost !== undefined) {
    if (!(await isCostEditAllowed(shop))) {
      return NextResponse.json({ error: "COST_REQUIRES_BUSINESS_PACKAGE" }, { status: 403 });
    }
  }

  const product = await createProduct(shop.id, parsed.output);
  return NextResponse.json(serializeProduct(product), { status: 201 });
}
