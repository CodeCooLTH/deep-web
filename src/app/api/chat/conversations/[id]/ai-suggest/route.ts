import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from "@/lib/lodging";
import {
  generateReplySuggestions,
  GeminiNotConfiguredError,
  GeminiApiError,
  type SuggestTurn,
} from "@/lib/gemini";

// feature 00018 composer improvement #3 — AI ช่วยร่างคำตอบ (Gemini)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const IdParamSchema = v.pipe(v.string(), v.uuid());
const RECENT_LIMIT = 15;

// AI call มีต้นทุน — จำกัดต่อผู้ใช้ (แยกจาก global per-IP ของ proxy.ts) กันกดรัว
const AI_RATE_LIMIT_MAX = 15;
const AI_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * POST /api/chat/conversations/{id}/ai-suggest — คืนข้อความร่าง 3 แบบจาก Gemini
 * อ่านบทสนทนาล่าสุด (server-side) → ไม่รับ transcript จาก client (กันปลอม/ยัด prompt)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  if (!checkApiRateLimit(`ai-suggest:${userId}`, AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: "ใช้ AI ถี่เกินไป กรุณารอสักครู่" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });
  }

  // ownership อยู่ใน WHERE {id, shopId} — เธรดไม่ใช่ของร้านที่ active = 404 (ไม่ leak)
  const conversation = await prisma.conversation.findFirst({
    where: { id: idCheck.output, shopId: activeCtx.shopId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  }

  const shop = await prisma.shop.findUnique({
    where: { id: activeCtx.shopId },
    select: { shopName: true, vertical: true },
  });
  const rawVertical = shop?.vertical ?? "";
  const vertical = isShopVertical(rawVertical) ? rawVertical : DEFAULT_SHOP_VERTICAL;

  // ข้อความล่าสุด (ใหม่→เก่า) แล้ว reverse ให้เป็นเก่า→ใหม่สำหรับ transcript
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    select: { senderRole: true, type: true, body: true },
  });
  const turns: SuggestTurn[] = rows
    .reverse()
    .map((m) => {
      const role: "BUYER" | "SHOP" = m.senderRole === "SHOP" ? "SHOP" : "BUYER";
      // แทนชนิดที่ไม่ใช่ TEXT ด้วย placeholder ข้อความ (AI ไม่เห็นรูปจริง)
      let text = m.body ?? "";
      if (m.type === "IMAGE") text = m.body ? `[รูปภาพ] ${m.body}` : "[ส่งรูปภาพ]";
      else if (m.type === "PRODUCT") text = "[ส่งการ์ดสินค้า]";
      return { role, text: text.trim() };
    })
    .filter((t) => t.text.length > 0);

  if (turns.length === 0) {
    return NextResponse.json({ error: "ยังไม่มีข้อความให้ AI ช่วยร่าง" }, { status: 400 });
  }

  try {
    const suggestions = await generateReplySuggestions(turns, {
      shopName: shop?.shopName ?? "ร้านค้า",
      vertical,
    });
    return NextResponse.json({ suggestions }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: "ระบบ AI ยังไม่พร้อมใช้งาน (ยังไม่ตั้งค่า)" }, { status: 503 });
    }
    if (e instanceof GeminiApiError) {
      console.error("[ai-suggest] gemini:", e.message);
      // detail: surface สาเหตุจริงจาก Gemini ชั่วคราวเพื่อ diagnose (ไม่มี secret — ดู comment ใน gemini.ts)
      return NextResponse.json(
        { error: "AI ไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง", detail: e.message },
        { status: 502 },
      );
    }
    console.error("[POST /api/chat/conversations/[id]/ai-suggest]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
