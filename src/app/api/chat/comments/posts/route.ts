import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatScope } from "@/lib/chat-scope";
import { listCommentPosts } from "@/services/page-comment.service";

/**
 * GET /api/chat/comments/posts — รายการโพสต์ที่มีคอมเมนต์ ของร้านที่ active (feature 00029)
 * query: `q` = ค้นหา (ข้อความคอมเมนต์ / ชื่อผู้คอมเมนต์ / ข้อความโพสต์)
 *        `channelId` = กรองเฉพาะเพจเดียว (ร้านเชื่อมได้หลายเพจ)
 *        `state` = feature 00038 — 'ALL' | 'UNANSWERED' | 'BOT' | 'HUMAN' กรองที่ server
 *          (ค่า derived จาก derivePostState ไม่มีคอลัมน์ในฐาน กรองที่ client ไม่ได้แล้ว)
 *
 * per-user authenticated data — ห้าม shared cache (เหตุผลเดียวกับ chat/groups)
 *
 * response: { posts, counts } — เปลี่ยนจาก { items } เดิม (feature 00038 Task 9) เพราะตัวนับ 4 กลุ่ม
 * ต้องมาจาก symbol เดียวกับที่ filter รายการ (BR-CR-S4) — ดู listCommentPosts()
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const scope = await resolveChatScope({
    user: {
      id: userId,
      activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!scope) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const shopChannelId = request.nextUrl.searchParams.get("channelId") ?? undefined;
    const skipRaw = Number(request.nextUrl.searchParams.get("skip") ?? 0);
    const skip = Number.isFinite(skipRaw) && skipRaw > 0 ? Math.min(skipRaw, 500) : 0;
    // feature 00038 — allow-list ค่า state ที่รับ; ค่าแปลก ๆ ตกไป 'ALL' (fail-closed ไม่กรองอะไรเลย
    // ดีกว่าโยน error เพราะเป็น query param จาก client ที่แก้ไขเองได้)
    const stateRaw = request.nextUrl.searchParams.get("state");
    const state: "ALL" | "UNANSWERED" | "BOT" | "HUMAN" =
      stateRaw === "UNANSWERED" || stateRaw === "BOT" || stateRaw === "HUMAN" ? stateRaw : "ALL";
    const { posts, counts } = await listCommentPosts({
      shopIds: scope.shopIds,
      actorUserId: userId,
      q,
      shopChannelId,
      skip,
      state,
    });
    return NextResponse.json({ posts, counts }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงร้านนี้" }, { status: 403 });
    console.error("[GET /api/chat/comments/posts]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
