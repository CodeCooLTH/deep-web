import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { CommentReplyLogsQuerySchema } from "@/lib/validations";

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
const SKIP_REASON_TEXT: Record<string, string> = {
  FROM_PAGE: "คอมเมนต์ของเพจเอง",
  NOT_TOP_LEVEL: "เป็นการตอบซ้อน ไม่ใช่คอมเมนต์หลัก",
  COMMENT_DELETED: "คอมเมนต์ถูกลบไปแล้ว",
  NO_SENDER_ID: "ไม่พบผู้คอมเมนต์",
  CHANNEL_INACTIVE: "เพจยังไม่ได้เชื่อมต่อ",
  DISABLED: "ปิดการตอบกลับอัตโนมัติไว้ หรือยังไม่ได้กรอกข้อความ",
  ALREADY_HANDLED: "เคยตอบอัตโนมัติคนนี้บนโพสต์นี้ไปแล้ว",
  HUMAN_ANSWERED: "มีคนในทีมตอบคอมเมนต์นี้ไปแล้ว",
  WINDOW_EXPIRED: "เกิน 7 วันนับจากเวลาคอมเมนต์",
};

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

  // ดึงเกินมา 1 แถวเพื่อรู้ hasMore โดยไม่ต้อง count() แยก query
  const rows = await prisma.commentReplyLog.findMany({
    where: {
      channel: { shopId: ctx.shopId },
      ...(shopChannelIdFilter ? { shopChannelId: shopChannelIdFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip,
    take: take + 1,
    select: {
      id: true,
      createdAt: true,
      trigger: true,
      publicReplyStatus: true,
      privateReplyStatus: true,
      skipReason: true,
      conversationId: true,
      comment: { select: { fromName: true } },
      post: { select: { message: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return NextResponse.json(
    {
      logs: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        commenterName: r.comment?.fromName ?? null,
        postMessage: truncatePostMessage(r.post?.message ?? null),
        trigger: r.trigger,
        publicReplyStatus: r.publicReplyStatus,
        privateReplyStatus: r.privateReplyStatus,
        skipReasonText: r.skipReason ? (SKIP_REASON_TEXT[r.skipReason] ?? r.skipReason) : null,
        conversationId: r.conversationId,
      })),
      hasMore,
    },
    { headers: NO_STORE_HEADERS },
  );
}
