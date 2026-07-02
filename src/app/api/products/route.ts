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
import { prisma } from "@/lib/prisma";
import { isEntitlementActive, isProActive } from "@/services/inventory-entitlement.service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shop = await prisma.shop.findUnique({ where: { userId: (session.user as any).id } });
  if (!shop) return NextResponse.json([]);

  const products = await getProductsByShop(shop.id);
  return NextResponse.json(products.map(serializeProduct));
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shop = await prisma.shop.findUnique({ where: { userId: (session.user as any).id } });
  if (!shop) return NextResponse.json({ error: "No shop" }, { status: 404 });

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

  const product = await createProduct(shop.id, parsed.output);
  return NextResponse.json(serializeProduct(product), { status: 201 });
}
