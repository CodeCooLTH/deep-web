import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateBadgeSchema, UpdateBadgeSchema } from "@/lib/validations";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const badges = await prisma.badge.findMany({
    include: { _count: { select: { userBadges: true } } },
    orderBy: { type: "asc" },
  });
  return NextResponse.json(badges);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  // ป้องกัน raw JSON จาก admin ที่อาจส่ง criteria.type ผิด หรือ field พลาด
  const parsed = v.safeParse(CreateBadgeSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const badge = await prisma.badge.create({ data: parsed.output });
  return NextResponse.json(badge, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  // ป้องกัน partial update ที่ส่ง criteria ผิดรูปแบบ หรือ audience นอก enum
  const parsed = v.safeParse(UpdateBadgeSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { id, ...data } = parsed.output;
  const badge = await prisma.badge.update({ where: { id }, data });
  return NextResponse.json(badge);
}
