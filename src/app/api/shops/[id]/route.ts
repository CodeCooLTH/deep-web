import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateShop } from "@/services/shop.service";
import { prisma } from "@/lib/prisma";
import { isShopMember } from "@/lib/shop-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shop = await prisma.shop.findUnique({ where: { id } });
  // membership guard (Phase 4 D5) — แทน ownership-by-userId เดิม: owner หรือ admin ของ shop นี้แก้ได้
  // (Personal shop: owner เป็น ShopMember(OWNER) ของตัวเองอยู่แล้วจาก backfill → ผ่านเหมือนเดิม ไม่ regress)
  if (!shop || !(await isShopMember(id, (session.user as any).id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const updated = await updateShop(id, body);
  return NextResponse.json(updated);
}
