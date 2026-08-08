import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { CommentReplyConfigSchema } from "@/lib/validations";

/**
 * PATCH /api/shops/comment-reply/config — บันทึกการตั้งค่าตอบกลับคอมเมนต์ของเพจเดียว (feature 00038)
 * API.md §4.2
 *
 * shopId derive จาก active shop ของ session เท่านั้น (resolveActiveShopContext re-verify
 * membership ทุกครั้ง — pattern เดียวกับ src/app/api/shops/ai-settings/route.ts) ไม่ใช่
 * resolveChatScope() เพราะ endpoint นี้เป็น "การตั้งค่าของร้าน" ไม่ใช่งานที่ผูกกับเธรด/คอมเมนต์
 * เดี่ยว — มิเรอร์ข้อยกเว้นที่ src/lib/chat-scope.ts ประกาศไว้แล้วสำหรับ src/app/api/channels/**
 * (ขอบเขตแชทจริงคือ src/app/(paces)/seller/(chat)/** และ src/app/api/chat/** เท่านั้น)
 *
 * 🛑 ShopChannel.accessTokenEnc อยู่แถวเดียวกับคอลัมน์ตั้งค่ากลุ่มนี้ — ทุก query ที่ส่งค่าออกไป
 * หา client ต้อง select ระบุคอลัมน์เสมอ ห้ามคืนทั้งแถว
 *
 * ไม่มี GET — หน้าตั้งค่า (`settings/comment-reply/page.tsx`) อ่านค่าตั้งต้นผ่าน RSC + prisma
 * ตรงตาม convention ของหน้านี้ (ไม่ self-fetch API ของตัวเอง) จึงถอด handler GET ออก (YAGNI,
 * feature 00038 Task 11) — ไม่มี client เรียก GET เส้นนี้เลย
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

async function requireShopId(): Promise<{ shopId: string } | { error: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "unauthorized", code: "UNAUTHORIZED" },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
    };
  }
  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session?.user as { activeShopId?: string | null } | undefined)?.activeShopId) ?? null,
    },
  });
  if (!ctx) {
    return {
      error: NextResponse.json(
        { error: "ไม่พบร้านที่กำลังใช้งาน", code: "FORBIDDEN" },
        { status: 403, headers: NO_STORE_HEADERS },
      ),
    };
  }
  return { shopId: ctx.shopId };
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CommentReplyConfigSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const { shopChannelId, ...patch } = parsed.output;

  // ต้องเป็น MESSENGER ของร้านที่ active จริง — ไม่เชื่อค่าจาก client (API.md §4.2: 404 ถ้าไม่ตรง)
  const existing = await prisma.shopChannel.findFirst({
    where: { id: shopChannelId, shopId: ctx.shopId, provider: "MESSENGER" },
    select: {
      id: true,
      status: true,
      commentPublicReplyEnabled: true,
      commentPublicReplyText: true,
      commentPrivateReplyEnabled: true,
      commentPrivateReplyText: true,
    },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "ไม่พบเพจนี้", code: "NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  // สถานะสุดท้ายหลัง merge กับแถวเดิม (API.md §4.2 — BR-CR-05 ต้องเช็คทั้งค่าที่ส่งมาใหม่และค่า
  // ที่มีอยู่เดิม ไม่ใช่แค่ค่าที่อยู่ใน request เดียวนี้)
  const finalPublicEnabled = patch.commentPublicReplyEnabled ?? existing.commentPublicReplyEnabled;
  const finalPublicText =
    patch.commentPublicReplyText !== undefined ? patch.commentPublicReplyText : existing.commentPublicReplyText;
  const finalPrivateEnabled = patch.commentPrivateReplyEnabled ?? existing.commentPrivateReplyEnabled;
  const finalPrivateText =
    patch.commentPrivateReplyText !== undefined ? patch.commentPrivateReplyText : existing.commentPrivateReplyText;

  if (finalPublicEnabled && !finalPublicText?.trim()) {
    return NextResponse.json(
      { error: "ต้องกรอกข้อความก่อนเปิดใช้งาน", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (finalPrivateEnabled && !finalPrivateText?.trim()) {
    return NextResponse.json(
      { error: "ต้องกรอกข้อความก่อนเปิดใช้งาน", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // เปิดสวิตช์ (*Enabled: true ในคำขอนี้) บนเพจที่ status != 'ACTIVE' = 409 — defense-in-depth คู่
  // กับ UI ที่ปิดสวิตช์ไว้แล้ว (AC-CR-05)
  const attemptingToEnable = patch.commentPublicReplyEnabled === true || patch.commentPrivateReplyEnabled === true;
  if (attemptingToEnable && existing.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "เพจนี้ยังไม่พร้อมใช้งาน", code: "CHANNEL_NOT_ACTIVE" },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const updated = await prisma.shopChannel.update({
    where: { id: shopChannelId },
    data: {
      ...(patch.commentPublicReplyEnabled !== undefined
        ? { commentPublicReplyEnabled: patch.commentPublicReplyEnabled }
        : {}),
      ...(patch.commentPublicReplyText !== undefined ? { commentPublicReplyText: patch.commentPublicReplyText } : {}),
      ...(patch.commentPrivateReplyEnabled !== undefined
        ? { commentPrivateReplyEnabled: patch.commentPrivateReplyEnabled }
        : {}),
      ...(patch.commentPrivateReplyText !== undefined
        ? { commentPrivateReplyText: patch.commentPrivateReplyText }
        : {}),
    },
    select: {
      id: true,
      commentPublicReplyEnabled: true,
      commentPublicReplyText: true,
      commentPrivateReplyEnabled: true,
      commentPrivateReplyText: true,
    },
  });

  return NextResponse.json(
    {
      shopChannelId: updated.id,
      commentPublicReplyEnabled: updated.commentPublicReplyEnabled,
      commentPublicReplyText: updated.commentPublicReplyText,
      commentPrivateReplyEnabled: updated.commentPrivateReplyEnabled,
      commentPrivateReplyText: updated.commentPrivateReplyText,
    },
    { headers: NO_STORE_HEADERS },
  );
}
