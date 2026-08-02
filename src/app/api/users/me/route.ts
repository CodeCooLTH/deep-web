import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProfile } from "@/services/user.service";
import { UpdateProfileSchema } from "@/lib/validations";

// field ที่ปลอดภัยจะส่งกลับให้เจ้าของบัญชี — เลือกทีละอันแทน findUnique เปล่า ๆ
// เดิม GET ไม่มี select เลย → คืน passwordHash (bcrypt hash) ออกไปใน response ด้วย
const SELF_USER_SELECT = {
  id: true,
  displayName: true,
  username: true,
  avatar: true,
  phone: true,
  email: true,
  trustScore: true,
  isShop: true,
  isAdmin: true,
  successfulBidCount: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: {
      ...SELF_USER_SELECT,
      shops: { where: { kind: "PERSONAL" } },
      userBadges: { include: { badge: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remap shops[0] → shop เพื่อคง API response shape เดิม (consumer ยังอ่าน .shop)
  const { shops, ...rest } = user;
  return NextResponse.json({ ...rest, shop: shops[0] ?? null });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  // parse ก่อนแตะ DB เสมอ — body ดิบห้ามไปถึง prisma.user.update (ดูคอมเมนต์ UpdateProfileSchema)
  const parsed = v.safeParse(UpdateProfileSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const data = parsed.output;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "ไม่มีข้อมูลที่จะแก้ไข" }, { status: 400 });
  }

  // username ห้ามซ้ำ user อื่น (ของตัวเองได้) — pattern เดียวกับ /api/account/shop-info
  if (data.username) {
    const taken = await prisma.user.findFirst({
      where: { username: data.username, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "ชื่อผู้ใช้นี้มีคนใช้แล้ว" }, { status: 409 });
  }

  try {
    const user = await updateProfile(userId, data);
    return NextResponse.json(user);
  } catch (e) {
    // TOCTOU: username ถูกจองระหว่าง check → update (User.username @unique) → P2002
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "ชื่อผู้ใช้นี้มีคนใช้แล้ว" }, { status: 409 });
    }
    throw e;
  }
}
