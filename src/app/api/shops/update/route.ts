// shop update — ตั้งค่า category / address / พิกัด ของร้าน user ปัจจุบัน (ใช้ใน onboarding)
// feature 00001 step 3: เพิ่ม latitude/longitude (ต้องมาคู่กัน). Trace: SRS TFR-009
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShopUpdateWithGeoSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(ShopUpdateWithGeoSchema, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { category, address, latitude, longitude, vertical } = parsed.output;

  // lat+lng ต้องมาคู่กัน (XOR check — Valibot ทำ cross-field ยุ่ง จึงเช็คที่นี่)
  if ((latitude == null) !== (longitude == null)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // เพิ่ม slug ใน select — feature 00028 (SDS §3.3 task #17, TD-002): ใช้ Shop.slug===null เป็น
  // สัญญาณ "onboarding ยังไม่จบ / ยังแก้ vertical ได้" แทนการเพิ่มคอลัมน์ DB ใหม่
  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" }, select: { id: true, slug: true } });
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  // ส่ง vertical มาแต่ onboarding จบแล้ว (มี slug แล้ว) → immutable ตาม BR-SBT-08 ห้าม silently ignore
  if (vertical !== undefined && shop.slug !== null) {
    return NextResponse.json({ error: "VERTICAL_LOCKED" }, { status: 409 });
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      ...(category ? { category } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(latitude != null ? { latitude, longitude } : {}),
      ...(vertical !== undefined && shop.slug === null ? { vertical } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
