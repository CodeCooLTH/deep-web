import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SwitchActiveShopSchema } from "@/lib/validations";
import { getPersonalShop, isShopMember } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/business/switch-context — validate membership แล้วคืน context ให้ client
 * เรียก NextAuth session.update({ activeShopId }) ต่อเอง
 *
 * ทำไม endpoint นี้ไม่ persist อะไรฝั่ง server:
 * ไม่มี session store แยก — แค่ validate membership แล้วคืน ok, client เรียก
 * session.update() ต่อ ซึ่ง jwt callback จะ re-verify membership อีกชั้น (2-layer
 * verify โดยตั้งใจ — ดู SDS TD-004)
 *
 * API.md §4.15
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2. body validation (valibot)
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(SwitchActiveShopSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const { shopId } = parsed.output;

  try {
    // 3. Personal shop ไม่มี ShopMember row (owner ไม่ได้ enroll ตัวเองเป็นสมาชิก) — เช็คแยก 2 เงื่อนไข
    //    ตาม pattern เดียวกับ lib/auth.ts jwt callback (SDS §TFR-012): isShopMember() || shopId === personal.id
    const personal = await getPersonalShop(userId);
    if (personal && shopId === personal.id) {
      return NextResponse.json({ shopId: personal.id, kind: "PERSONAL", role: "OWNER" });
    }

    // BUSINESS — verify membership จริง (ห้าม trust client)
    const isMember = await isShopMember(shopId, userId);
    if (!isMember) {
      return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });
    }
    const member = await prisma.shopMember.findUnique({
      where: { shopId_userId: { shopId, userId } },
      select: { role: true },
    });
    if (!member) {
      return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });
    }

    return NextResponse.json({ shopId, kind: "BUSINESS", role: member.role });
  } catch (e: unknown) {
    console.error("[POST /api/business/switch-context] userId:", userId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
