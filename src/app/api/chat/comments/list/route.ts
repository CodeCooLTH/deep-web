import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatScope } from "@/lib/chat-scope";
import {
  listComments,
  type CommentChannelFilter,
  type CommentListStateFilter,
} from "@/services/page-comment.service";
import { sessionUserId } from "@/lib/session-user";

/**
 * GET /api/chat/comments/list — รายการ **คอมเมนต์** ของร้านที่ active
 *
 * 🛑 1 แถว = 1 คอมเมนต์ (ผู้ใช้เคาะ 2026-08-15) แทนของเดิมที่เป็น 1 แถว = 1 โพสต์
 * คอลัมน์กลาง/ขวายังทำงานระดับโพสต์เหมือนเดิม แถวจึงพกบริบทโพสต์ติดมาให้ client resolve ได้ว่า
 * กดแล้วต้องโหลดเธรดของโพสต์ไหน — เส้นทาง `/posts/[postId]` (เธรด + เขียนคอมเมนต์) ไม่เปลี่ยน
 * query: `q` = ค้นหา (ข้อความคอมเมนต์ / ชื่อผู้คอมเมนต์ / ข้อความโพสต์)
 *        `channelId` = กรองเฉพาะเพจเดียว (ร้านเชื่อมได้หลายเพจ)
 *        `state` = 'ALL' | 'UNANSWERED' | 'BOT' | 'HUMAN' | 'EXPIRED' กรองที่ server
 *          (ค่า derived จาก deriveCommentState ไม่มีคอลัมน์ในฐาน กรองที่ client ไม่ได้)
 *
 * per-user authenticated data — ห้าม shared cache (เหตุผลเดียวกับ chat/groups)
 *
 * response: { comments, counts, rawCount }
 * `counts` = **ทั้งร้าน นับเป็นคอมเมนต์** (หน่วยเดียวกับแถว — badge บนแท็บก็นับหน่วยนี้แล้ว
 * ไม่งั้นจะได้เลขบน badge ไม่ตรงกับจำนวนแถว) · `rawCount` = จำนวนแถวดิบที่ query รอบนี้ได้มา
 * (ก่อนกรองด้วย `state`) ใช้คำนวณ skip/hasMore ที่ client เท่านั้น ไม่ใช่ตัวเลขแสดงผล
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    const state: CommentListStateFilter =
      stateRaw === "UNANSWERED" || stateRaw === "BOT" || stateRaw === "HUMAN" || stateRaw === "EXPIRED"
        ? stateRaw
        : "ALL";
    // พิลล์ช่องทาง — allow-list เหมือน state (ค่าแปลกตกไป 'ALL' = ไม่กรอง) เพราะ client แก้ query
    // param เองได้ และค่าที่ไม่รู้จักต้องไม่หลุดลงไปเป็น provider ใน SQL
    const providerRaw = request.nextUrl.searchParams.get("provider");
    const provider: CommentChannelFilter =
      providerRaw === "DEEP" || providerRaw === "MESSENGER" || providerRaw === "INSTAGRAM" ? providerRaw : "ALL";
    const { comments, counts, rawCount } = await listComments({
      shopIds: scope.shopIds,
      actorUserId: userId,
      q,
      shopChannelId,
      skip,
      state,
      provider,
    });
    return NextResponse.json({ comments, counts, rawCount }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงร้านนี้" }, { status: 403 });
    console.error("[GET /api/chat/comments/list]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
