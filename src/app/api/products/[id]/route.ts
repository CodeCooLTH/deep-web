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
import { isEntitlementActive } from "@/services/inventory-entitlement.service";

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
