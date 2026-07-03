// sales-channels — บันทึกช่องทางการขายของร้าน (feature 00001 onboarding step 1)
// empty array = valid (Seller ข้าม step ได้). Trace: SRS TFR-007 / API.md §4.1
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SalesChannelsSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(SalesChannelsSchema, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" }, select: { id: true } });
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  await prisma.shop.update({ where: { id: shop.id }, data: { salesChannels: parsed.output.channels } });
  return NextResponse.json({ ok: true });
}
