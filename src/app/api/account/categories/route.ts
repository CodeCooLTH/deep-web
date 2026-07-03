// categories — บันทึกหมวดหมู่ร้าน multi-select ≤5 (feature 00001 onboarding step 2)
// submit ต้องเลือก ≥1 (Valibot); ข้ามได้ที่ client โดยไม่เรียก API. Trace: SRS TFR-008
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CategoriesSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(CategoriesSchema, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" }, select: { id: true } });
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  // เขียน categories (SSOT ใหม่) + sync category (legacy single) = ตัวแรก เพื่อ backward-compat
  await prisma.shop.update({
    where: { id: shop.id },
    data: { categories: parsed.output.categories, category: parsed.output.categories[0] },
  });
  return NextResponse.json({ ok: true });
}
