import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { createUploadTicket } from "@/lib/storage";
import { UploadTicketSchema } from "@/lib/validations";
import {
  attachmentKind,
  checkChannelSupport,
  extFromName,
  sanitizeAttachmentName,
} from "@/lib/chat-attachment";
import { contentTypeToExt } from "@/lib/attachment-mime";
import { checkUploadPolicy, uploadMaxSize } from "@/lib/upload-policy";
import { signUploadTicket, TICKET_TTL_SECONDS } from "@/lib/upload-ticket";
import { resolveChatChannelForUser, safeStorageExt } from "../_shared";

/**
 * POST /api/uploads/ticket — ขอใบอนุญาตให้ client อัปโหลดไฟล์ **ตรงเข้า storage** (2026-08-10)
 *
 * ทำไมต้องมี: `POST /api/upload` และ `POST /api/chat/upload` รับไฟล์ผ่าน body ของ function
 * ซึ่ง **Vercel จำกัดที่ 4.5MB** และตอบ 413 ก่อนถึงโค้ดเราด้วย body ที่ไม่ใช่ JSON ของเรา
 * → ทุก surface ที่โฆษณา 5/10/25MB ล้มจริงตั้งแต่ 4.5MB โดยผู้ใช้เห็นแค่ "ลองใหม่อีกครั้ง"
 * (ร้านแจ้ง 2026-08-10 ว่าอัปโหลดคลิปไม่ได้ — ดูที่มาแบบเต็มใน `src/lib/upload-policy.ts`)
 *
 * flow: ticket (ที่นี่) → client PUT ไฟล์เข้า storage ตรง → `POST /api/uploads/commit`
 * ตัวที่นี่ **ยังไม่เห็นไฟล์** จึงตัดสินจากค่าที่ client แจ้งได้อย่างเดียว = ด่านเร็ว ไม่ใช่ด่านจริง
 * ด่านจริงมี 2 ชั้นที่ปลอมไม่ได้: `file_size_limit` ของ bucket (Supabase ตอบ 413 เอง) + commit
 * ที่อ่านขนาดจริงด้วย HEAD
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UploadTicketSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const { purpose, size, mime, conversationId } = parsed.output;

  const name = sanitizeAttachmentName(parsed.output.name);
  if (!name) {
    return NextResponse.json({ error: "ชื่อไฟล์ไม่ถูกต้อง" }, { status: 400 });
  }

  const policy = checkUploadPolicy(purpose, { name, size, mime });
  if (!policy.ok) {
    return NextResponse.json({ error: policy.reason }, { status: 400 });
  }

  // กฎเฉพาะช่องทางของแชท (IG รับแต่ PDF ฯลฯ) — ต้องรู้ channel ของเธรดก่อน
  const ext = safeStorageExt(extFromName(name) || contentTypeToExt(mime));
  // conversationId เป็น optional โดยตั้งใจ — parity กับ `/api/chat/upload` เดิม: ส่งมา = ตรวจกฎ
  // เฉพาะช่องทางให้ด้วย (ผู้ใช้เห็นปัญหาตั้งแต่ตอนแนบ) ไม่ส่ง = ตรวจแค่กฎกลาง
  // (ตอบคอมเมนต์ Facebook แนบรูปโดยไม่มีเธรด — `CommentsClient.pickFile`)
  if (purpose === "CHAT" && conversationId) {
    const resolved = await resolveChatChannelForUser(conversationId, userId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const support = checkChannelSupport(resolved.channel, {
      kind: attachmentKind(mime, ext),
      mime,
      ext,
      size,
    });
    if (!support.ok) {
      return NextResponse.json({ error: support.reason }, { status: 400 });
    }
  }

  // ContentType ถูกผนวกในลายเซ็น presigned PUT → client ต้องส่ง header ค่าตรงกันเป๊ะ
  // (ticket.headers ที่คืนไปคือค่าที่ต้องใช้ — client ไม่ต้องเดา)
  const contentType = mime || "application/octet-stream";

  let ticket;
  try {
    ticket = await createUploadTicket({ ext, contentType, expiresIn: TICKET_TTL_SECONDS });
  } catch {
    // ไม่ log ชื่อไฟล์ (RC-8 — ชื่อไฟล์ของลูกค้าอาจมี PII)
    console.error("[uploads-ticket] createUploadTicket failed", { purpose, ext, size });
    return NextResponse.json({ error: "เตรียมอัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }

  const claim = signUploadTicket({
    fileId: ticket.fileId,
    userId,
    purpose,
    maxSize: uploadMaxSize(purpose),
    conversationId: purpose === "CHAT" ? conversationId : undefined,
  });

  return NextResponse.json(
    {
      fileId: ticket.fileId,
      // local driver รับไฟล์ผ่าน route ของเราเอง จึงต้องพก claim ไปให้มันตรวจสิทธิ์
      // (s3 ใช้ลายเซ็น SigV4 ของ AWS ที่ฝังในลิงก์อยู่แล้ว)
      url: ticket.requiresTicketToken
        ? `${ticket.url}?t=${encodeURIComponent(claim)}`
        : ticket.url,
      method: ticket.method,
      headers: ticket.headers,
      ticket: claim,
      maxSize: uploadMaxSize(purpose),
      expiresIn: TICKET_TTL_SECONDS,
    },
    { status: 201 },
  );
}
