import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { sessionUserId } from "@/lib/session-user";
import { LibrarySaveSchema, LibraryPatchSchema } from "@/lib/validations";
import { LIBRARY_PAGE_TAKE, LIBRARY_PREVIEW_TAKE, resolveLibraryOwner } from "@/lib/customer-file-library";
import {
  LibraryError,
  listLibrary,
  patchLibraryItem,
  removeFromLibrary,
  saveToLibrary,
} from "@/services/customer-file-library.service";

/**
 * feature 00048 — คลังไฟล์ต่อลูกค้า
 *
 * ownership: resolveConversationShopId() scope สิทธิ์ใน WHERE ตั้งแต่คำสั่งแรก และคืน null
 * เหมือนกันทั้ง "ไม่มีเธรด" กับ "ไม่มีสิทธิ์" → ตอบ 404 ทั้งคู่ (403 = ยืนยันว่าเธรดมีอยู่จริง)
 *
 * 🛑 "มี session" ไม่ใช่ "รู้ว่าเป็นใคร" — ห้าม cast `session.user` เป็นชนิดที่มี id แล้ว deref
 * ต่อทันที (docs/conventions/session-exists-is-not-identity.md) ใช้ `sessionUserId()` ที่คืน
 * `string | null` แล้วให้ผู้เรียกตัดสินเองว่าจะ 401 หรือถอยไปทางอื่น
 *
 * (เขียนบรรยายแทนการยกโค้ดตัวอย่างโดยตั้งใจ — เทส [blocker] ที่คุมกฎนี้ทั้งรีโป grep หา
 * "สตริงดิบ" ใน src/app โดยไม่ตัดคอมเมนต์ ตัวอย่างในคอมเมนต์จึงทำให้ gate แดงทั้งที่ไม่มีการละเมิด)
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const IdParamSchema = v.pipe(v.string(), v.uuid());

type Ctx = {
  shopId: string;
  conversationId: string;
  owner: ReturnType<typeof resolveLibraryOwner>;
  userId: string;
  userName: string | null;
};

/** resolve สิทธิ์ + เจ้าของคลังของเธรดนี้ในคำสั่งเดียว — ทุก method ต้องผ่านตัวนี้ก่อนเสมอ */
async function resolveCtx(conversationId: string): Promise<{ error: NextResponse } | Ctx> {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    conversationId,
  );
  if (!resolved) return { error: NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 }) };

  // externalContactId ตัดสินว่าคลังผูกกับ "คน" หรือ "เธรด" — อ่านหลังผ่านด่านสิทธิ์แล้วเท่านั้น
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId: resolved.shopId },
    select: { id: true, externalContactId: true },
  });
  if (!conv) return { error: NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 }) };

  return {
    shopId: resolved.shopId,
    conversationId: conv.id,
    owner: resolveLibraryOwner(conv),
    userId,
    userName: (session.user.name as string | null | undefined) ?? null,
  };
}

function mapLibraryError(e: unknown, tag: string): NextResponse {
  if (e instanceof LibraryError) {
    // 404 ครอบทั้ง "ข้อความไม่อยู่ในเธรดนี้" — ไม่ตอบต่างกันเพื่อไม่ให้ probe ได้ว่า id ไหนมีจริง
    if (e.code === "MESSAGE_NOT_FOUND") return NextResponse.json({ error: "ไม่พบข้อความนี้" }, { status: 404 });
    if (e.code === "ITEM_NOT_FOUND") return NextResponse.json({ error: "ไม่พบไฟล์นี้ในคลัง" }, { status: 404 });
    if (e.code === "NOT_ELIGIBLE") {
      return NextResponse.json({ error: "ไฟล์ชนิดนี้เก็บเข้าคลังไม่ได้" }, { status: 422 });
    }
  }
  console.error(tag, e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveCtx(idCheck.output);
  if ("error" in ctx) return ctx.error;

  const sp = request.nextUrl.searchParams;
  const rawTake = Number(sp.get("take") ?? LIBRARY_PREVIEW_TAKE);
  const take = Number.isFinite(rawTake) ? Math.min(Math.max(Math.trunc(rawTake), 1), LIBRARY_PAGE_TAKE) : LIBRARY_PREVIEW_TAKE;

  // cursor ต้องมาเป็นคู่เสมอ — ส่งมาตัวเดียวคือคำขอที่ผู้เรียกเข้าใจผิด ต้องบอกให้รู้ ไม่ใช่เงียบ
  // แล้วคืนหน้าแรกซ้ำ (ซึ่งจะกลายเป็น infinite scroll ที่วนรายการเดิมไม่รู้จบ)
  const cursorSentAt = sp.get("cursorSentAt");
  const cursorId = sp.get("cursorId");
  if (Boolean(cursorSentAt) !== Boolean(cursorId)) {
    return NextResponse.json({ error: "cursor ไม่ครบ" }, { status: 400 });
  }
  let cursor: { sentAt: Date; id: string } | null = null;
  if (cursorSentAt && cursorId) {
    const d = new Date(cursorSentAt);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "cursor ไม่ถูกต้อง" }, { status: 400 });
    cursor = { sentAt: d, id: cursorId };
  }

  try {
    const result = await listLibrary(ctx.shopId, ctx.owner, { take, cursor });
    return NextResponse.json(
      {
        items: result.items,
        total: result.total,
        nextCursor: result.nextCursor
          ? { sentAt: result.nextCursor.sentAt.toISOString(), id: result.nextCursor.id }
          : null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    return mapLibraryError(e, "[GET /api/chat/conversations/[id]/library]");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveCtx(idCheck.output);
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(LibrarySaveSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const { item, created } = await saveToLibrary({
      shopId: ctx.shopId,
      owner: ctx.owner,
      conversationId: ctx.conversationId,
      messageId: parsed.output.messageId,
      savedByUserId: ctx.userId,
      savedByName: ctx.userName,
    });
    // created=false = อยู่ในคลังอยู่แล้ว (ชน @@unique แล้วถูกดัก) — ไม่ใช่ error
    return NextResponse.json({ item, created }, { status: created ? 201 : 200, headers: NO_STORE_HEADERS });
  } catch (e) {
    return mapLibraryError(e, "[POST /api/chat/conversations/[id]/library]");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveCtx(idCheck.output);
  if ("error" in ctx) return ctx.error;

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "ต้องระบุไฟล์" }, { status: 400 });

  try {
    // removed=false (ไม่มีแถวอยู่แล้ว) = สำเร็จเหมือนกัน — ผลลัพธ์ที่ผู้ใช้ต้องการคือ
    // "ไฟล์นี้ไม่อยู่ในคลัง" ซึ่งจริงแล้ว การตอบ 404 จะทำให้จอขึ้น error ทั้งที่ไม่มีอะไรผิด
    const result = await removeFromLibrary(ctx.shopId, ctx.owner, fileId);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (e) {
    return mapLibraryError(e, "[DELETE /api/chat/conversations/[id]/library]");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveCtx(idCheck.output);
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(LibraryPatchSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { fileId, ...patch } = parsed.output;
  try {
    const item = await patchLibraryItem(ctx.shopId, ctx.owner, fileId, patch);
    return NextResponse.json({ item }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    return mapLibraryError(e, "[PATCH /api/chat/conversations/[id]/library]");
  }
}
