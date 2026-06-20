// onboarding-checklist — คำนวณ checklist จาก DB fields จริง (ไม่มี flag แยก)
// feature 00001; Trace: SRS TFR-013 / BRD FR-LO-13. รวม optional ทุก item (OD-6)
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ChecklistItemKey =
  | "slug"
  | "sales_channels"
  | "categories"
  | "address"
  | "map_pin"
  | "first_product";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const shop = await prisma.shop.findUnique({
    where: { userId },
    select: {
      slug: true,
      salesChannels: true,
      categories: true,
      address: true,
      latitude: true,
      _count: { select: { products: true } },
    },
  });
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const items: { key: ChecklistItemKey; label: string; done: boolean }[] = [
    { key: "slug", label: "URL ร้าน", done: shop.slug != null },
    { key: "sales_channels", label: "ช่องทางการขาย", done: shop.salesChannels.length >= 1 },
    { key: "categories", label: "หมวดหมู่", done: shop.categories.length >= 1 },
    { key: "address", label: "ที่อยู่", done: !!shop.address?.trim() },
    { key: "map_pin", label: "ปักพิกัด", done: shop.latitude != null },
    { key: "first_product", label: "สร้างสินค้าแรก", done: shop._count.products >= 1 },
  ];
  return NextResponse.json({ items, isComplete: items.every((i) => i.done) });
}
