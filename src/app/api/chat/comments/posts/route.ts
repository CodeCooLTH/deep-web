import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { listCommentPosts } from "@/services/page-comment.service";

/**
 * GET /api/chat/comments/posts — รายการโพสต์ที่มีคอมเมนต์ ของร้านที่ active (feature 00029)
 * query: `q` = ค้นหา (ข้อความคอมเมนต์ / ชื่อผู้คอมเมนต์ / ข้อความโพสต์)
 *
 * per-user authenticated data — ห้าม shared cache (เหตุผลเดียวกับ chat/groups)
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const activeCtx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!activeCtx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const items = await listCommentPosts({ shopId: activeCtx.shopId, actorUserId: userId, q });
    return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงร้านนี้" }, { status: 403 });
    console.error("[GET /api/chat/comments/posts]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
