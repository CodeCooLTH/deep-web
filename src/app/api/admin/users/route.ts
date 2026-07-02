import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = request.nextUrl.searchParams.get("search") || "";
  const users = await prisma.user.findMany({
    where: search ? {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    } : {},
    include: { shops: { where: { kind: "PERSONAL" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // Remap shops[0] → shop เพื่อคง API response shape เดิม
  const remapped = users.map(({ shops, ...rest }) => ({ ...rest, shop: shops[0] ?? null }));
  return NextResponse.json(remapped);
}
