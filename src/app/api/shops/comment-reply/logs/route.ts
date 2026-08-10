import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { CommentReplyLogsQuerySchema } from "@/lib/validations";
import { logStatusWhere, parseLogStatusFilter } from "@/lib/comment-reply-log-status";
import { describeCommentReplyFailure, describeSkipReason } from "@/lib/comment-reply-reason";

/**
 * GET /api/shops/comment-reply/logs — ประวัติการตอบ/ข้ามคอมเมนต์ (feature 00038) — API.md §4.3
 *
 * shopId derive จาก active shop เหมือน src/app/api/shops/comment-reply/config/route.ts
 * (เหตุผลเดียวกัน — endpoint นี้เป็น "การตั้งค่า/ประวัติของร้าน" ไม่ใช่งานผูกกับเธรด/คอมเมนต์
 * เดี่ยว จึงไม่ใช่ scope ของ resolveChatScope())
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * ความยาวสูงสุดของ `postMessage` ก่อนส่งออก (feature 00038 หนี้ #4) — API.md §4.3 ระบุว่า "ข้อความ
 * โพสต์ (ตัดสั้น)" มาตั้งแต่แรก แต่ endpoint นี้เคยคืนข้อความเต็มโดยไม่ตัด (payload ใหญ่กว่า spec
 * โดยไม่จำเป็น หน้าจอ (CommentReplyClient.tsx) แสดงแค่พอให้จำโพสต์ได้อยู่แล้ว — ไม่ใช้เนื้อหาเต็ม)
 */
const POST_MESSAGE_TRUNCATE_LENGTH = 120;

/** ตัดสั้น + ต่อท้ายด้วย "…" เมื่อยาวเกิน — ค่า null/สั้นพออยู่แล้วคืนตามเดิม */
function truncatePostMessage(message: string | null): string | null {
  if (!message || message.length <= POST_MESSAGE_TRUNCATE_LENGTH) return message;
  return `${message.slice(0, POST_MESSAGE_TRUNCATE_LENGTH)}…`;
}

/** ข้อความไทยของ skipReason — SSOT เดียวของ endpoint นี้ (ค่าทั้งหมดดู DATABASE.md §3.4) */

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session?.user as { activeShopId?: string | null } | undefined)?.activeShopId) ?? null,
    },
  });
  if (!ctx) {
    return NextResponse.json(
      { error: "ไม่พบร้านที่กำลังใช้งาน", code: "FORBIDDEN" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const { searchParams } = new URL(request.url);
  const takeRaw = searchParams.get("take");
  const parsed = v.safeParse(CommentReplyLogsQuerySchema, {
    shopChannelId: searchParams.get("shopChannelId") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    take: takeRaw != null ? Number(takeRaw) : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "พารามิเตอร์ค้นหาไม่ถูกต้อง", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const take = parsed.output.take ?? 20;
  const skip = parsed.output.cursor ? Number(parsed.output.cursor) : 0;

  // shopChannelId ที่ไม่ใช่ของร้านนี้ → ไม่ใช่ error, เพิกเฉย filter แล้วคืนของร้านตัวเองทั้งหมด
  // แทน (กัน ID enumeration — API.md §4.3)
  let shopChannelIdFilter: string | undefined;
  if (parsed.output.shopChannelId) {
    const owned = await prisma.shopChannel.findFirst({
      where: { id: parsed.output.shopChannelId, shopId: ctx.shopId },
      select: { id: true },
    });
    if (owned) shopChannelIdFilter = owned.id;
  }

  // UX-Design-Spec ฉบับแก้ครั้งที่ 2 (2026-08-09): เปลี่ยนจาก "โหลดเพิ่ม" (hasMore, ดึงเกิน 1
  // แถว) เป็น TablePagination เลขหน้าจริง — ต้องรู้จำนวนรวมทั้งหมด ไม่ใช่แค่ "มีต่อไหม"
  // ตัวกรองสถานะ (critique 2026-08-09 P2) — แถวส่วนใหญ่ในตารางนี้เป็น SKIPPED และแถวที่ผู้ขาย
  // เปิดตารางมาหาคือ FAILED; ไม่มีตัวกรองเลยแปลว่าต้องเปิดทีละหน้าไปเรื่อย ๆ
  const status = parseLogStatusFilter(searchParams.get("status"));
  const where = {
    channel: { shopId: ctx.shopId },
    ...(shopChannelIdFilter ? { shopChannelId: shopChannelIdFilter } : {}),
    ...logStatusWhere(status),
  };
  const [rows, total] = await Promise.all([
    prisma.commentReplyLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        createdAt: true,
        trigger: true,
        publicReplyStatus: true,
        privateReplyStatus: true,
        skipReason: true,
        // ต้อง select มาด้วย ไม่งั้น describeCommentReplyFailure ได้ undefined ทุกแถวเงียบ ๆ
        errorMessage: true,
        conversationId: true,
        comment: { select: { fromName: true } },
        post: { select: { message: true } },
      },
    }),
    prisma.commentReplyLog.count({ where }),
  ]);

  return NextResponse.json(
    {
      logs: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        commenterName: r.comment?.fromName ?? null,
        postMessage: truncatePostMessage(r.post?.message ?? null),
        trigger: r.trigger,
        publicReplyStatus: r.publicReplyStatus,
        privateReplyStatus: r.privateReplyStatus,
        skipReasonText: describeSkipReason(r.skipReason),
        // user 2026-08-09: ป้าย "ไม่สำเร็จ" ต้องบอกได้ว่าเพราะอะไร ไม่ใช่ทางตัน
        failReasonText: describeCommentReplyFailure(r.errorMessage),
        conversationId: r.conversationId,
      })),
      total,
    },
    { headers: NO_STORE_HEADERS },
  );
}
