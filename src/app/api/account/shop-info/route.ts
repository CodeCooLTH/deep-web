// shop-info — บันทึกข้อมูลร้าน step 1 ของ onboarding (FB user / ยังไม่ครบ):
// displayName (= ชื่อร้าน), username (เช็คซ้ำ), category. update user + shop เดิม (layout fallback สร้างไว้).
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShopCategorySchema } from "@/lib/validations";

const Body = v.object({
  displayName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  username: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(/^[a-z0-9_]{3,30}$/)),
  category: v.optional(ShopCategorySchema),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(Body, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { displayName, username, category } = parsed.output;

  // username ห้ามซ้ำ user อื่น (ของตัวเองได้)
  const taken = await prisma.user.findFirst({
    where: { username, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) return NextResponse.json({ error: "ชื่อผู้ใช้นี้มีคนใช้แล้ว" }, { status: 409 });

  // shop อาจยังไม่มี — onboarding ไม่ผ่าน (dashboard) layout ที่ auto-create → upsert ที่นี่
  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" }, select: { id: true } });

  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { displayName, username, isShop: true } }),
      shop
        ? prisma.shop.update({
            where: { id: shop.id },
            data: { shopName: displayName, ...(category ? { category } : {}) },
          })
        : prisma.shop.create({
            data: { userId, shopName: displayName, businessType: 'INDIVIDUAL', ...(category ? { category } : {}) },
          }),
    ]);
  } catch (e) {
    // P2002 = username race
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "ชื่อผู้ใช้นี้มีคนใช้แล้ว" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
