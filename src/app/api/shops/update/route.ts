// shop update — ตั้งค่า category / address ของร้าน user ปัจจุบัน (ใช้ใน onboarding step)
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShopCategorySchema } from "@/lib/validations";

const Body = v.object({
  category: v.optional(ShopCategorySchema),
  address: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500))),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(Body, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { category, address } = parsed.output;

  const shop = await prisma.shop.findUnique({ where: { userId }, select: { id: true } });
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  await prisma.shop.update({
    where: { id: shop.id },
    data: { ...(category ? { category } : {}), ...(address !== undefined ? { address } : {}) },
  });
  return NextResponse.json({ ok: true });
}
