import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProfile } from "@/services/user.service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    include: { shops: { where: { kind: "PERSONAL" } }, userBadges: { include: { badge: true } } },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remap shops[0] → shop เพื่อคง API response shape เดิม (consumer ยังอ่าน .shop)
  const { shops, ...rest } = user;
  return NextResponse.json({ ...rest, shop: shops[0] ?? null });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const user = await updateProfile((session.user as any).id, body);
  return NextResponse.json(user);
}
