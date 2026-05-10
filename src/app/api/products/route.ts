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

  const product = await createProduct(shop.id, parsed.output);
  return NextResponse.json(serializeProduct(product), { status: 201 });
}
