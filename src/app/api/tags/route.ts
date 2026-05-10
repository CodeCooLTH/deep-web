import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/tags?q=<prefix>
// - Auth-gated (any logged-in user)
// - q optional; if absent → return top 20 most-used tags overall (by product count desc)
// - q present → case-insensitive substring match on Tag.name OR Tag.slug, limit 20
// - Returns: [{ id, name, slug }]
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q");

  // Manual length guard (Dev-Validation จะเพิ่ม TagNameSchema ทีหลัง — ใช้ guard
  // แบบ manual ไปก่อนตามที่ task spec อนุญาต)
  if (typeof q === "string" && q.length > 50) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // q empty string ("") = treat as absent → top 20 most-used
  const hasQuery = typeof q === "string" && q.trim().length > 0;

  if (!hasQuery) {
    const tags = await prisma.tag.findMany({
      orderBy: { products: { _count: "desc" } },
      take: 20,
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json(tags);
  }

  const tags = await prisma.tag.findMany({
    where: {
      OR: [
        { name: { contains: q!, mode: "insensitive" } },
        { slug: { contains: q!, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return NextResponse.json(tags);
}
