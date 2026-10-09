import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { sessionUserId } from "@/lib/session-user";
import { resolveSuggestProvider } from "@/lib/reply-suggest-provider";
import { AUTO_ORDER_RESULT_TYPE } from "@/lib/auto-order-message-type";
import type { MemoryRefreshResponse } from "@/lib/chat-memory-types";
import { maybeUpdateMemory } from "@/services/chat-memory-ai.service";

// 00019-ext-mem S-10 — แอดมินกด "ให้ AI อัปเดตตอนนี้" (force: ข้าม cooldown/จำนวนข้อความ) · รอคิว + Typhoon เกิน default
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParamSchema = v.pipe(v.string(), v.uuid());
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...extra } });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return json({ error: "unauthorized" }, 401);

  const { id: rawId } = await ctx.params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, 400);

  // 🛑 ร้านจากเธรดเท่านั้น ห้ามใช้ร้านที่ active (00037)
  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
  );
  if (!resolved) return json({ error: "ไม่พบบทสนทนานี้" }, 404);
  const conversation = await prisma.conversation.findFirst({
    where: { id: idCheck.output, shopId: resolved.shopId },
    select: { id: true },
  });
  if (!conversation) return json({ error: "ไม่พบบทสนทนานี้" }, 404);

  if (resolveSuggestProvider(resolved.shopId) !== "typhoon") return json({ error: "ร้านนี้ไม่ได้ใช้ AI ที่เขียนความจำ" }, 400);

  if (!checkApiRateLimit(`memory-refresh:${userId}`, 6, 60_000)) {
    return json({ error: "ใช้ AI ถี่เกินไป กรุณารอสักครู่" }, 429, { "Retry-After": "60" });
  }

  try {
    const latest = await prisma.chatMessage.findFirst({
      where: { conversationId: conversation.id, type: { not: AUTO_ORDER_RESULT_TYPE } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!latest) return json({ status: "NONE" } satisfies MemoryRefreshResponse);

    const r = await maybeUpdateMemory({
      shopId: resolved.shopId,
      conversationId: conversation.id,
      latestMessageId: latest.id,
      force: true,
    });
    let body: MemoryRefreshResponse;
    if (r.busy) body = { status: "THINKING" };
    else if (r.outcome === "OK") body = { status: "UPDATED" };
    else if (r.outcome === "NOT_APPLICABLE") body = { status: "NONE" };
    else body = { status: "NONE", reason: r.outcome };
    return json(body);
  } catch (e) {
    console.error("[POST memory/refresh]", e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น (BR-AIT-09)
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}
