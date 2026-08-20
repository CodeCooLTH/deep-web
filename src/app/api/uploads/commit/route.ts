import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { deleteFile, getFileMeta } from "@/lib/storage";
import { UploadCommitSchema } from "@/lib/validations";
import {
  attachmentKind,
  checkChannelSupport,
  extFromName,
  oversizeMessage,
  sanitizeAttachmentName,
} from "@/lib/chat-attachment";
import { checkUploadPolicy } from "@/lib/upload-policy";
import { verifyUploadTicket } from "@/lib/upload-ticket";
import { resolveChatChannelForUser } from "../_shared";
import { reconcileUploadedFile } from "@/services/media-asset.service";

/**
 * POST /api/uploads/commit — ด่านจริงของ direct upload (2026-08-10)
 *
 * ตั้งแต่ไฟล์ไม่ผ่าน function อีก server ก็ไม่เห็นไฟล์ตอนอัปโหลด — ที่นี่คือจุดเดียวที่ยังเห็น
 * **ขนาดจริง** (HEAD บน storage) จึงเป็นที่ที่บังคับเพดานได้จริง ไม่ใช่ตัวเลขที่ client แจ้งไว้
 * ตอนขอ ticket (ปลอมได้เสมอ)
 *
 * ไฟล์ที่ไม่ผ่านจะถูก **ลบทิ้งทันที** ไม่ปล่อยค้างใน bucket:
 *   - ถ้าปล่อยค้าง ไฟล์ที่ไม่มีแถวใน DB อ้างถึงจะกลายเป็นขยะที่ไม่มีใครรู้ว่าลบได้เมื่อไหร่
 *   - การลบปลอดภัยเพราะ claim ผูก fileId กับ userId คนนี้และเพิ่งถูกจ่ายไปเมื่อไม่เกิน 15 นาที
 *     (ถ้าไม่ผูก จะกลายเป็นช่องให้ลบไฟล์ของคนอื่นด้วยการส่ง fileId ที่เดา/หลุดมา — ดู upload-ticket.ts)
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UploadCommitSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const { mime } = parsed.output;

  const claim = verifyUploadTicket(parsed.output.ticket);
  if (!claim) {
    // หมดอายุ = เคสปกติที่เกิดได้จริง (อัปโหลดไฟล์ใหญ่บนเน็ตช้าเกิน 15 นาที) ไม่ใช่การโจมตี
    return NextResponse.json(
      { error: "ใบอนุญาตอัปโหลดหมดอายุ กรุณาแนบไฟล์ใหม่อีกครั้ง" },
      { status: 400 },
    );
  }
  if (claim.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = sanitizeAttachmentName(parsed.output.name) || `ไฟล์แนบ.${extFromName(claim.fileId)}`;

  const meta = await getFileMeta(claim.fileId);
  if (!meta) {
    // ไฟล์ยังไม่ขึ้น (PUT ล้ม/ถูกยกเลิก) หรือ Supabase ปฏิเสธเองเพราะเกิน file_size_limit
    return NextResponse.json(
      { error: "ยังไม่พบไฟล์ที่อัปโหลด กรุณาลองแนบใหม่" },
      { status: 404 },
    );
  }

  // ext ต้องมาจาก key ที่ **เราเป็นคนตั้ง** ตอนจ่าย ticket ไม่ใช่จากชื่อไฟล์ที่ client ส่งมารอบนี้
  // (ไม่งั้น commit เปลี่ยนชนิดไฟล์ที่ผ่านกฎไปแล้วได้ด้วยการเปลี่ยนแค่ `name`)
  const ext = meta.ext;
  const kind = attachmentKind(mime, ext);

  const reject = async (status: number, error: string) => {
    await deleteFile(claim.fileId).catch(() => {
      console.error("[uploads-commit] ลบไฟล์ที่ไม่ผ่านไม่สำเร็จ", { size: meta.size, ext });
    });
    return NextResponse.json({ error }, { status });
  };

  if (meta.size > claim.maxSize) {
    return reject(413, oversizeMessage({ kind, size: meta.size, maxSize: claim.maxSize }));
  }

  // ตรวจกฎของ purpose ซ้ำด้วยขนาดจริง — ใช้ ext ของ key ประกอบชื่อ เพื่อให้ allow-list ชนิดไฟล์
  // ตัดสินจาก ext ที่ถูกเก็บจริง ไม่ใช่ ext ที่ client เขียนมาใหม่
  const policy = checkUploadPolicy(claim.purpose, { name: `f.${ext}`, size: meta.size, mime });
  if (!policy.ok) {
    return reject(400, policy.reason);
  }

  // fileId สุดท้ายที่ตอบกลับ client — เปลี่ยนได้เฉพาะตอน reconcile เจอไฟล์ซ้ำ (path C, TFR-CMD-10)
  // ต่างจาก path A/B ตรงที่ไฟล์ถูก client PUT ตรงเข้า storage ไปแล้วก่อนบรรทัดนี้ทำงานด้วยซ้ำ —
  // จึงเป็น "เขียนไปแล้ว → hash → ยืนยัน/ลบทิ้งแล้วใช้ของเดิม" ไม่ใช่ "hash ก่อนเขียน" (TD-08)
  let finalFileId = claim.fileId;

  if (claim.purpose === "CHAT" && claim.conversationId) {
    const resolved = await resolveChatChannelForUser(claim.conversationId, userId);
    if (!resolved.ok) {
      return reject(resolved.status, resolved.error);
    }
    const support = checkChannelSupport(resolved.channel, { kind, mime, ext, size: meta.size });
    if (!support.ok) {
      return reject(400, support.reason);
    }

    // 🛑 จำกัดไว้ที่ purpose==='CHAT' เท่านั้น (TD-09/OOS-10) — ห้ามขยายไป IMAGE/DOCUMENT เด็ดขาด
    // ห้าม throw — ล้มเหลว = ใช้ claim.fileId เดิมต่อไป ไม่ block การอัปโหลด (TFR-CMD-07)
    const reconciled = await reconcileUploadedFile({
      shopId: resolved.shopId,
      fileId: claim.fileId,
      contentType: mime,
      size: meta.size,
    }).catch(() => null);
    if (reconciled) finalFileId = reconciled.fileId;
  }

  return NextResponse.json(
    { fileId: finalFileId, name, size: meta.size, mime, kind },
    { status: 201 },
  );
}
