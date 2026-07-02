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
  const { category, address, latitude, longitude } = parsed.output;

  // lat+lng ต้องมาคู่กัน (XOR check — Valibot ทำ cross-field ยุ่ง จึงเช็คที่นี่)
  if ((latitude == null) !== (longitude == null)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" }, select: { id: true } });
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      ...(category ? { category } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(latitude != null ? { latitude, longitude } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
