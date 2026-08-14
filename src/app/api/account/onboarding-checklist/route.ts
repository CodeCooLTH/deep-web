// onboarding-checklist — คำนวณ checklist จาก DB fields จริง (ไม่มี flag แยก)
// feature 00001; Trace: SRS TFR-013 / BRD FR-LO-13. รวม optional ทุก item (OD-6)
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/i18n/server";

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

  const shop = await prisma.shop.findFirst({
    where: { userId, kind: "PERSONAL" },
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

  // ป้ายถูกแปลที่นี่ ไม่ใช่ที่ ChecklistSidebar — response ชุดนี้ถูกอ่านเป็น `label` ตรง ๆ
  // ฝั่ง client ถ้าส่งไทยออกไปแล้วค่อยแปลทีหลัง จะต้องมี map คีย์→คำอยู่สองที่ (HR16)
  const t = await getT();

  const items: { key: ChecklistItemKey; label: string; done: boolean }[] = [
    { key: "slug", label: t.dashboard.checklistSlug, done: shop.slug != null },
    { key: "sales_channels", label: t.dashboard.checklistSalesChannels, done: shop.salesChannels.length >= 1 },
    { key: "categories", label: t.dashboard.checklistCategories, done: shop.categories.length >= 1 },
    { key: "address", label: t.dashboard.checklistAddress, done: !!shop.address?.trim() },
    { key: "map_pin", label: t.dashboard.checklistMapPin, done: shop.latitude != null },
    { key: "first_product", label: t.dashboard.checklistFirstProduct, done: shop._count.products >= 1 },
  ];
  return NextResponse.json({ items, isComplete: items.every((i) => i.done) });
}
