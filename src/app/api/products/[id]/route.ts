import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { UpdateProductSchema } from "@/lib/validations";
import {
  updateProduct,
  deleteProduct,
  serializeProduct,
} from "@/services/product.service";
import { prisma } from "@/lib/prisma";
import { isEntitlementActive, isProActive } from "@/services/inventory-entitlement.service";
import { isCostEditAllowed } from "@/services/expense-access.service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, include: { shop: true } });
  if (!product || product.shop.userId !== (session.user as any).id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = v.safeParse(UpdateProductSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // stockQty — Inventory Add-on (feature 00003): guard เฉพาะเมื่อ caller ส่ง field นี้มา
  if (parsed.output.stockQty !== undefined) {
    const effectiveType = parsed.output.type ?? product.type;
    if (effectiveType !== "PHYSICAL") {
      return NextResponse.json({ error: "STOCK_QTY_INVALID_PRODUCT_TYPE" }, { status: 400 });
    }
    if (!(await isEntitlementActive(product.shopId))) {
      return NextResponse.json({ error: "INVENTORY_NOT_ACTIVE" }, { status: 403 });
    }
  }

  // lowStockThreshold — Deep Stock Pro (feature 00009): guard เฉพาะเมื่อ caller ส่ง field นี้มา (ต่อจาก guard stockQty ด้านบน — ห้ามแก้ของเดิม)
  if (parsed.output.lowStockThreshold !== undefined) {
    const effectiveType = parsed.output.type ?? product.type;
    if (effectiveType !== "PHYSICAL") {
      return NextResponse.json({ error: "STOCK_QTY_INVALID_PRODUCT_TYPE" }, { status: 400 });
    }
    // effective stockQty: parsed.output.stockQty ถ้าส่งมา, ไม่งั้น fallback product เดิม
    const effectiveStockQty = parsed.output.stockQty !== undefined ? parsed.output.stockQty : product.stockQty;
    if (effectiveStockQty === null || effectiveStockQty === undefined) {
      return NextResponse.json({ error: "PRODUCT_NOT_TRACKED" }, { status: 400 });
    }
    if (!(await isProActive(product.shopId))) {
      return NextResponse.json({ error: "INVENTORY_NOT_PRO" }, { status: 403 });
    }
  }

  // cost — Expense & Cost Tracking (feature 00016): guard เฉพาะเมื่อ caller ส่ง field นี้มา
  // (ownership check ผ่านไปแล้วด้านบน — product.shop.userId === session.user.id — isCostEditAllowed เช็คแค่ package ACTIVE)
  if (parsed.output.cost !== undefined) {
    if (!(await isCostEditAllowed(product.shop))) {
      return NextResponse.json({ error: "COST_REQUIRES_BUSINESS_PACKAGE" }, { status: 403 });
    }
  }

  const updated = await updateProduct(id, parsed.output);
  return NextResponse.json(serializeProduct(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, include: { shop: true } });
  if (!product || product.shop.userId !== (session.user as any).id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteProduct(id);
  return NextResponse.json({ deleted: true });
}
