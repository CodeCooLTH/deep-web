import { NextRequest, NextResponse, after } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { fileIdExt } from "@/lib/storage";
import { isStickerRawMessage } from "@/lib/chat-sticker";
import { isDuplicateProductSend } from "@/lib/chat-product-resend";
import { prisma } from "@/lib/prisma";
import { getMessages, sendMessage, type SenderRole } from "@/services/chat.service";
import { syncMissingMessagesFromMeta, type SendFailedError } from "@/services/channel-chat.service";
// (CR 2026-08-23) เส้นทางช่องทางนอกของช่องพิมพ์ผู้ขายเขียนแถว QUEUED ก่อนตอบ client แล้วยิงทีหลัง
// — `enqueueOutbound` เรียก `resolveOutboundContext` ให้เอง ด่านเดิมทุกตัวจึงยังโยน error ชื่อเดิม
// (CONVERSATION_NOT_FOUND / NOT_EXTERNAL_CHANNEL / FORBIDDEN / INVALID_ACTOR) ให้ mapChatServiceError
import { enqueueOutbound, deliverRoom } from "@/services/chat-outbox.service";
import { getProductsByIds } from "@/services/product.service";
import { pushNewChatMessage } from "@/services/seller-push.service";
import { SendChatMessageSchema, ChatMessagesQuerySchema } from "@/lib/validations";
import {
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_MAX_SHOP,
  CHAT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/chat-constants";
import { describeSendFailure } from "@/lib/chat-send-failure";
import { buildLineFlexOrderCard } from "@/lib/line/flex-order-card";
// คลังคำตามประเภทกิจการ — คำที่ลูกค้าเห็นต้องมาจากที่เดียวกับที่ร้านเห็น (HR16)
import { resolveOrderVocab } from "@/lib/seller-menu";
import { buildLineFlexAppointmentCard } from "@/lib/line/flex-appointment-card";
import { buildMetaAppointmentCard } from "@/lib/meta/appointment-card";
import {
  buildAppointmentSummary,
  type AppointmentSummary,
} from "@/lib/appointment-summary";
import { canUseAppointments, isTerminalAppointmentStatus } from "@/lib/appointments";
import { publicOrderUrl } from "@/lib/public-order-url";
import { buildLineFlexProductCarousel } from "@/lib/line/flex-product-card";
import { buildMetaProductCarousel } from "@/lib/meta/product-card";
import {
  chunkProductCards,
  maxSelectableProducts,
  productCardsPerMessage,
} from "@/lib/chat-product-card-batch";
import { getProductById } from "@/services/product.service";
import { resolveLineFlexImageUrl, resolveMetaCardImageUrl } from "@/services/channel-chat.service";
import { formatBaht } from "@/lib/format-money";
import { EXT_TO_MIME } from "@/lib/attachment-mime";
import {
  attachmentKind,
  checkChannelSupport,
  sanitizeAttachmentName,
  type AttachmentKind,
} from "@/lib/chat-attachment";

/**
 * งบเวลาของ invocation นี้ (วินาที) — (CR 2026-08-23) **นี่คือการ *ลด* เพดาน ไม่ใช่เพิ่ม**
 *
 * ที่มาของตัวเลข ไล่ตามลำดับข้อจำกัดที่บีบแคบที่สุดก่อน:
 *
 *  1. **ค่าตั้งต้นของแพลตฟอร์มคือ 300 วินาที** (Vercel + fluid compute ซึ่งเปิดเป็นค่าตั้งต้น
 *     — Hobby: default 300s / สูงสุด 300s) ⇒ ไฟล์นี้ที่ไม่เคยประกาศอะไรเลย ได้ 300 มาตลอด
 *     การเขียนเลขลงไปจึงต้องอธิบายให้ได้ว่า "ทำไมถึงเอาน้อยกว่าที่มีอยู่แล้ว"
 *  2. **ต้องน้อยกว่า `STALE_CLAIM_MS` (3 นาที = 180 วินาที)** — นี่คือเหตุผลหลัก: ถ้าปล่อยให้
 *     invocation อยู่ได้ถึง 300 วินาที จะมีช่วง 180–300 ที่ `after()` **ยังยิงอยู่จริง** ขณะที่
 *     ตัวกวาดตัดสินว่าแถวที่มันถือ claim อยู่ "ค้างเกินเพดาน" แล้วปิดเป็น FAILED ด้วยถ้อยคำ
 *     `UNCERTAIN_SEND_REASON` ⇒ ผู้ขายเห็นบับเบิลแดง "ไม่แน่ใจว่าส่งออกไปหรือยัง" ทั้งที่ worker
 *     ยังทำงานปกติ (แล้วยังต้องพึ่ง R-F ให้ worker ที่กลับมาช้าไม่เขียนทับผลของตัวกวาดอีกชั้น)
 *     เพดานที่ต่ำกว่า 180 ทำให้ "แพลตฟอร์มฆ่า" กับ "ตัวกวาดยึดคืน" ไม่มีวันคาบเกี่ยวกัน
 *  3. **ต้องมากกว่ากรณีแย่สุดของการระบายจริง** — `deliverRoom` วนได้ `MAX_DELIVER_ROUNDS` = 20
 *     รอบ แต่ละรอบ = claim + ยิงออกหนึ่งใบ + เขียนผล ≈ 1–3 วินาที ⇒ 20–60 วินาที
 *     120 = ประมาณ 2 เท่าของกรณีแย่สุดที่วัดได้ และยังห่างจากเพดานข้อ 2 อยู่ 60 วินาที
 *
 * ข้อแลกเปลี่ยนที่ยอมรับ: ฟังก์ชันอยู่ต่อหลังตอบ 202 ไปแล้ว = จ่ายค่า instance นานขึ้นต่อการส่ง
 * หนึ่งครั้ง (fluid หยุดนับ active CPU ตอนรอ I/O ⇒ ต้นทุนคือ "ที่นั่ง" ไม่ใช่ CPU) แลกกับการที่
 * ข้อความไม่ต้องรอตัวกวาดรอบถัดไปนานถึง 1 นาที และแลกกับการที่ **ตัวเลขนี้ถูกปักหมุดไว้ในโค้ด** —
 * ถ้าวันหนึ่งมีคนไปตั้ง Default Max Duration ที่แดชบอร์ดให้ต่ำลง เส้นทางนี้จะไม่ถูกตัดตามไปเงียบ ๆ
 *
 * ⚠️ ตัวเลขนี้ผูกกับ `STALE_CLAIM_MS` — ขยับตัวนั้นเมื่อไหร่ต้องกลับมาอ่านข้อ 2 ใหม่ทุกครั้ง
 */
export const maxDuration = 120;

// ชนิดข้อความที่ "มีไฟล์แนบ" — ตรวจกฎชุดเดียวกันหมด (2026-08-02 multi-attachment)
// เดิมมีแต่ IMAGE ที่ตรวจด้วย allow-list นามสกุลรูปตายตัว (CHAT_IMAGE_ALLOWED_EXT) — ถอดออกแล้ว
// เพราะกฎย้ายไปอยู่ที่ checkChannelSupport ซึ่งรู้ทั้งชนิดไฟล์และช่องทางปลายทาง
const ATTACHMENT_TYPES = ["IMAGE", "VIDEO", "AUDIO", "FILE"] as const;
function isAttachmentType(t: string): t is AttachmentKind {
  return (ATTACHMENT_TYPES as readonly string[]).includes(t);
}

// reply/quote — "อ้างอิงข้อความนี้ได้จริงไหม" (bugfix 2026-08-10: ผู้ขายกด "ตอบกลับ" บน LINE แล้ว
// จอเราขึ้นบล็อกอ้างอิงครบเหมือนสำเร็จ แต่ในแอป LINE ของลูกค้ามาเป็นข้อความธรรมดา เพราะข้อความ
// เป้าหมายไม่มี quoteToken — ระบบถอยไปส่งแบบไม่ quote ให้เอง (ถูกแล้ว ห้ามทำให้ส่งไม่ออก) แต่ถอย
// เงียบสนิท ไม่มีอะไรบอกผู้ขาย. คำนวณที่นี่ล่วงหน้าให้ UI เตือนได้ก่อนกดส่งจริง — `transmitLineMessage`
// (channel-chat.service.ts) อ่าน rawMessage.payload.quoteToken จาก DB ด้วยสูตรเดียวกันตอนยิงออกจริง
//
// ตั้งชื่อกลาง ๆ ว่า quotable ไม่ใช่ lineQuotable โดยตั้งใจ — Messenger/IG มีช่องโหว่ชนิดเดียวกัน
// (Meta ปฏิเสธ reply_to แล้ว retry แบบไม่ quote เงียบ ๆ เหมือนกัน) แต่ payload ของ Meta ไม่มี
// quoteToken อยู่แล้วจึงได้ false เสมอสำหรับช่องทางนั้น — รอบนี้ไม่เปลี่ยนพฤติกรรม Meta, UI gate
// เฉพาะ channel==='LINE' ไว้ที่ shouldWarnQuoteUnavailable (lib/chat-quote-availability.ts)
function isQuotable(rawMessage: unknown): boolean {
  const raw = rawMessage as { payload?: { quoteToken?: unknown } } | null | undefined;
  const token = raw?.payload?.quoteToken;
  return typeof token === "string" && token.length > 0;
}

function mapChatServiceError(e: unknown, context: string) {
  if (e instanceof Error && e.message === "CONVERSATION_NOT_FOUND") {
    return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
  }
  if (e instanceof Error && e.message === "FORBIDDEN") {
    // (F-1 รอบแก้ 2) ถ้อยคำย้ายไปอยู่ที่ `chat-send-failure.ts` แล้ว — รหัสนี้ลง `failureReason`
    // ได้จริงตั้งแต่ CR คิว (สิทธิ์เปลี่ยนระหว่างที่แถวรอคิว) บับเบิลจึงอ่านจากที่นั่น ถ้า hardcode
    // ไว้ที่นี่ด้วยจะได้สองสำนวนสำหรับเรื่องเดียวกัน (HR16)
    return NextResponse.json({ error: describeSendFailure(e.message).text }, { status: 403 });
  }
  if (e instanceof Error && e.message === "SHOP_NOT_FOUND") {
    // defense เท่านั้น — ไม่ควรเกิดจริง (FK CASCADE) ดู chat.service.ts sendMessage
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }
  if (e instanceof Error && e.message === "PRODUCT_NOT_IN_SHOP") {
    // extension #1 Chat Product Context Card — cross-shop injection guard (FR-CTX-07)
    return NextResponse.json({ error: "ไม่พบสินค้านี้ในร้านค้านี้" }, { status: 400 });
  }
  if (e instanceof Error && e.message === "WINDOW_CLOSED") {
    // feature 00018: หมดหน้าต่างที่ Meta ให้ส่ง — ครอบทั้งเกิน 24 ชม. (เมื่อยังไม่เปิด HUMAN_AGENT)
    // และเกิน 7 วัน (เมื่อเปิดแล้ว) จึงไม่ระบุตัวเลขในข้อความ ปล่อยให้แถบในเธรดบอกรายละเอียดแทน
    // — แถบนั้นรู้ว่าร้านได้ permission human_agent หรือยัง ส่วน route นี้ไม่รู้
    // (R-21) ถ้อยคำย้ายไปอยู่ที่ `chat-send-failure.ts` แล้ว — บับเบิลของแถวที่ล้มหลังบ้านอ่านจาก
    // ที่นั่นเหมือนกัน ถ้า hardcode ไว้ที่นี่ด้วยจะได้สองสำนวนสำหรับเรื่องเดียวกัน (HR16)
    // ใช้ `.text` ไม่ใช่ `.message` เพื่อคงสตริงเดิมเป๊ะ (`.message` เติมคำนำหน้า "ส่งไม่สำเร็จ — ")
    return NextResponse.json({ error: describeSendFailure(e.message).text }, { status: 409 });
  }
  if (e instanceof Error && e.message === "NOT_EXTERNAL_CHANNEL") {
    return NextResponse.json({ error: "ช่องทางของบทสนทนานี้ไม่ถูกต้อง" }, { status: 400 });
  }
  if (e instanceof Error && e.message === "CHANNEL_NOT_ACTIVE") {
    // feature 00018 (S-4): token ตายแล้ว (ถูก markChannelTokenInvalid) หรือร้านถอดการเชื่อมต่อไปแล้ว
    // — สาเหตุชัดเจนและแก้ได้เอง (ไปเชื่อม Page ใหม่) ไม่ใช่ generic 500
    // (R-21) ถ้อยคำย้ายไปอยู่ที่ `chat-send-failure.ts` แล้ว — ดูเหตุผลที่ WINDOW_CLOSED ด้านบน
    return NextResponse.json({ error: describeSendFailure(e.message).text }, { status: 409 });
  }
  // (S-8, feature 00025) LINE outbound — ข้อความ/HTTP status ตรงตาม API.md §5 เป๊ะ ๆ
  // (feedback_service_error_route_mapping: error ใหม่ทุกตัวที่ service โยนต้องมี catch ที่นี่)
  //
  // bugfix 2026-08-10 (ux gate): เดิม hardcode ข้อความไทยไว้ที่นี่ตรง ๆ 4 ก้อน ไม่ผ่าน
  // describeSendFailure เลย → บับเบิลไม่มี `retryable` ให้อ่าน (ทั้ง 4 รหัสนี้ไม่สร้างแถว ChatMessage
  // — sendOutboundLineMessage throw ก่อนถึง prisma.$transaction — จึงไม่มี failureReason ที่บันทึก
  // ให้ ChatThread เรียก describeSendFailure ตอน render ซ้ำได้ ต้องส่ง retryable มาใน JSON ตรงนี้
  // เลยเท่านั้น) ย้ายข้อความไปอยู่ที่ chat-send-failure.ts (HR16 — นิยามเดียวกับกฎของ Meta)
  //
  // `code` (2026-08-10) — literal เดียวกับ e.message เสมอ ส่งเพิ่มมาให้ client แยกชนิดล้มเหลวได้โดย
  // ไม่ต้อง parse ข้อความไทย: quota exceeded ต้องยกแถบสถานะระดับห้อง (ThreadStatusBar key='quota')
  // ขึ้นค้างไว้ตลอด session นี้
  //
  // (อัปเดต S-9/S-14b) ตอนนี้มี `line-quota.service` แล้ว หน้าเธรดจึงรู้ล่วงหน้าได้และปิดช่องพิมพ์
  // ตั้งแต่ก่อนกด (ThreadStatusBar key='quotaBlocked') — เส้นทางนี้ยังต้องอยู่ต่อในฐานะตาข่ายชั้นใน
  // สุด เพราะค่าที่อ่านล่วงหน้า cache ได้ถึง 5 นาที LINE จึงยังปฏิเสธได้ทั้งที่จอบอกว่าเหลือ
  if (e instanceof Error && e.message === "TOKEN_INVALID") {
    const { message, retryable } = describeSendFailure(e.message);
    return NextResponse.json({ error: message, retryable, code: e.message }, { status: 400 });
  }
  if (e instanceof Error && e.message === "CONTACT_BLOCKED") {
    const { message, retryable } = describeSendFailure(e.message);
    return NextResponse.json({ error: message, retryable, code: e.message }, { status: 409 });
  }
  if (e instanceof Error && e.message === "QUOTA_EXCEEDED") {
    const { message, retryable } = describeSendFailure(e.message);
    return NextResponse.json({ error: message, retryable, code: e.message }, { status: 409 });
  }
  if (e instanceof Error && e.message === "LINE_UNAVAILABLE") {
    const { message, retryable } = describeSendFailure(e.message);
    return NextResponse.json({ error: message, retryable, code: e.message }, { status: 502 });
  }
  if (e instanceof Error && e.message.startsWith("SEND_FAILED")) {
    /**
     * 🛑 **เส้นทางนี้เข้าไม่ถึงแล้วจาก route นี้** (CR คิวส่งข้อความ 2026-08-23, Ruling R-22)
     *
     * `SEND_FAILED` ถูกโยนโดย `sendOutboundMessage` ตอนยิงออกช่องทางแล้วปลายทางปฏิเสธ — แต่ POST
     * ตัวนี้เรียก `enqueueOutbound` แทนแล้ว ซึ่งไม่ยิงอะไรเลย (แค่เขียนแถว `QUEUED`) การยิงจริงไป
     * เกิดใน `after()`/ตัวเก็บงานค้าง ซึ่งบันทึกผลเป็น `deliveryStatus='FAILED'` + `failureReason`
     * บนแถว แล้วให้บับเบิลอ่านผ่าน `describeSendFailure` เอง ไม่ผ่าน `mapChatServiceError`
     *
     * **คงไว้โดยตั้งใจ ไม่ลบ**: `mapChatServiceError` ถูกใช้ร่วมกับ handler อื่นในไฟล์นี้ และถ้าวันหน้า
     * มีเส้นทาง sync กลับมา (หรือมีใครเรียก `sendOutboundMessage` ตรง ๆ อีก) การหายไปของสาขานี้จะ
     * กลายเป็น 500 พร้อมข้อความอังกฤษดิบทันที — ราคาของการเก็บไว้คือโค้ดตายไม่กี่บรรทัด
     */
    // service โยนเป็น "SEND_FAILED: <ข้อความดิบของ Meta>" — แปลเป็นไทยก่อนส่งให้ร้าน
    // (user report 2026-08-02) เดิมตอบ "กรุณาลองใหม่" ทุกกรณี ซึ่งเป็นคำแนะนำที่ผิดกับ #551
    // (ลูกค้าปิดรับข้อความ — กดกี่ครั้งก็ไม่ผ่าน) ร้านจะกดซ้ำเปล่า ๆ แล้วโทษระบบ
    const { message } = describeSendFailure(e.message.replace(/^SEND_FAILED:\s*/, ""));
    // แนบแถวที่บันทึกไว้แล้วกลับไปด้วย (2026-08-03) — ส่งไม่ผ่าน ≠ ไม่ได้บันทึก
    // client ต้องเอาไปแทนบับเบิล optimistic ของตัวเอง ไม่งั้นข้อความเดียวขึ้นสองอันจนกว่าจะ refresh
    const saved = (e as SendFailedError).savedMessage;
    return NextResponse.json({ error: message, savedMessage: saved ?? null }, { status: 502 });
  }
  console.error(`[${context}]`, e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
}

/**
 * ตัวจับเวลารายเฟสของ GET — ปล่อยออกทาง `Server-Timing` ให้อ่านได้จาก DevTools ของเครื่องจริง
 *
 * 🛑 ทำไมเป็น header ไม่ใช่ `console.log`: **แพลนนี้ query runtime log ย้อนหลังไม่ได้**
 * (`/v1/deployments/{id}/runtime-logs` ตอบ 404 — ยืนยันแล้วตอน 2026-08-08) log ที่อ่านย้อนหลัง
 * ไม่ได้มีค่าเท่ากับไม่มี ส่วน header เดินทางกลับมาถึงเครื่องที่ร้องเรียนว่าช้าพอดี
 *
 * ตั้งใจให้ค้างไว้ในโค้ดหลังแก้เสร็จด้วย — ครั้งหน้าที่มีคนบอกว่า "ช้า" จะได้ไม่ต้องเริ่มจากศูนย์
 * ค่านี้ไม่มี PII และไม่เปิดเผยโครงสร้างภายในอะไรที่คนนอกใช้ประโยชน์ได้
 */
function createTimer() {
  const marks: string[] = [];
  const t0 = performance.now();
  let last = t0;
  return {
    /** ปิดเฟสที่เพิ่งจบ — `desc` ใช้บอก "จบเพราะอะไร" ซึ่งตัวเลขอย่างเดียวบอกไม่ได้ */
    mark(name: string, desc?: string) {
      const now = performance.now();
      const dur = (now - last).toFixed(1);
      last = now;
      marks.push(desc ? `${name};desc="${desc}";dur=${dur}` : `${name};dur=${dur}`);
    },
    header(): string {
      return [...marks, `total;dur=${(performance.now() - t0).toFixed(1)}`].join(", ");
    },
  };
}

/**
 * GET /api/chat/conversations/[id]/messages — ประวัติข้อความ cursor-paginated (ใหม่→เก่า)
 * ownership verify ใน service (assertParticipant) — ไม่ trust caller
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const timer = createTimer();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;
  timer.mark("auth");

  const { searchParams } = request.nextUrl;
  const rawTake = searchParams.get("take");
  const input = {
    cursor: searchParams.get("cursor") ?? undefined,
    take: rawTake === null ? undefined : Number(rawTake),
  };
  const parsed = v.safeParse(ChatMessagesQuerySchema, input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    /**
     * เติมข้อความที่ webhook ไม่เคยส่งมา (ตอบกลับอัตโนมัติของ Meta — ดู syncMissingMessagesFromMeta)
     *
     * 🛑 **ห้ามเอากลับมา await ในเส้นทางนี้เด็ดขาด** — วัดบน prod 2026-08-16 (Server-Timing จาก
     * เครื่องผู้ใช้จริง): sync = 1,740.6ms จาก total 1,915.2ms = **91% ของเวลาทั้งหน้า** และรอบนั้น
     * `outcome=nothing-missing, added=0` คือวิ่งไปหา Meta ครบทุกขั้นเพื่อเติม **ศูนย์** ข้อความ
     * ทุกอย่างที่เหลือรวมกันแค่ 174.5ms (auth 52 · msgs 40.6 · enrich 67.6 · watermark 14.3)
     *
     * ที่แพงคือ Graph `/me/conversations?fields=messages.limit(50){...,attachments}` ซึ่งขอ 50
     * ข้อความพร้อมไฟล์แนบ — ไม่ใช่ query ของเราช้า และไม่ใช่ cold start
     *
     * ยังเรียก **ทุกครั้งที่ไม่มี cursor เหมือนเดิม** (รวม poll ทุก 6 วิ — `refetchNewer()` ยิงแบบ
     * ไม่มี cursor) เพราะข้อความที่ Meta ไม่ส่ง webhook เกิดระหว่างที่คุยกันอยู่ได้จริง ซึ่งเป็นเคส
     * ที่ฟีเจอร์นี้ถูกสร้างมาแก้ (user report 2026-07-30) — throttle 5 นาทีในตัวฟังก์ชันยังกันความถี่
     * ให้เหมือนเดิมทุกประการ สิ่งที่เปลี่ยนคือ "ใครรอ" ไม่ใช่ "ทำบ่อยแค่ไหน"
     *
     * ข้อความที่เติมทีหลังไปถึงจอได้ 2 ทางโดยไม่ต้องพึ่ง websocket: trigger
     * `chat_message_realtime_broadcast_trigger` (AFTER INSERT FOR EACH ROW บน prod) และ **poll 6
     * วินาทีที่ `useSellerChatThread` ตั้งไว้เป็น safety-net ของ realtime ที่หลุดอยู่แล้ว** —
     * poll นั้นยิงแบบไม่มี cursor = ขอหน้าแรกใหม่ทั้งหน้า จึงเห็นข้อความที่เติมย้อนหลังได้จริง
     * และเป็น **หน้าต่างเดียวกับเดิมเป๊ะ** (ทั้งสองทางส่งผ่าน query "30 ใบล่าสุด" ตัวเดียวกัน)
     *
     * แลกไปข้อเดียว: เดิมข้อความที่เติมอยู่ใน response เดียวกัน ตอนนี้มาช้ากว่านั้น ≤6 วินาที
     */
    if (!parsed.output.cursor) {
      after(syncMissingMessagesFromMeta(id));
      timer.mark("sync", "deferred");
    } else {
      timer.mark("sync", "skipped-cursor");
    }

    const result = await getMessages(id, userId, {
      cursor: parsed.output.cursor,
      take: parsed.output.take,
    });
    timer.mark("msgs", `n=${result.items.length}`);

    // extension #1 Chat Product Context Card (S-18) — enrich ข้อความ type='PRODUCT' ด้วย productCard
    // (additive เท่านั้น ไม่แตะ ChatMessageView core); batch fetch กัน N+1
    // ต้องเก็บทั้ง 2 คอลัมน์: `productRefId` (การ์ดใบเดียว ของเดิม) และ `productRefIds` (หลายใบ
    // ส่วนขยาย 2026-08-11) — ตกอันใดอันหนึ่ง = การ์ดกลุ่มนั้นขึ้นเป็นบับเบิลเปล่าโดยไม่มีอะไรฟ้อง
    const productIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.type === "PRODUCT")
          .flatMap((m) => {
            const many = (m as { productRefIds?: string[] }).productRefIds ?? [];
            return many.length > 0 ? many : m.productRefId ? [m.productRefId] : [];
          }),
      ),
    );
    const products = productIds.length > 0 ? await getProductsByIds(productIds) : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    // การ์ดออเดอร์/ใบเสนอราคาในแชท (user 2026-07-24) — enrich ข้อความ type='ORDER' ด้วย orderCard
    // (additive เหมือน productCard). token ถูก verify ตอนส่งแล้วว่าเป็นของร้านในเธรดนี้ (sendMessage
    // ORDER guard) จึง live-join ตาม token ได้ตรง ๆ; ลบ order จริง → ไม่พบใน map = null (แสดง empty)
    const orderTokens = Array.from(
      new Set(result.items.filter((m) => m.type === "ORDER" && m.orderRefToken).map((m) => m.orderRefToken as string)),
    );
    const orderRows = orderTokens.length > 0
      ? await prisma.order.findMany({
          where: { publicToken: { in: orderTokens } },
          // user 2026-07-25: การ์ดต้องมีรายการสินค้าข้างใน (ชื่อ/จำนวน/ราคา/รูป) + จำนวนรวม + ยอดสุทธิ
          // Order Progress (2026-08-05): เพิ่ม fulfillmentMode + shipment ให้การ์ดในเธรดแสดง
          // timeline พัสดุได้เหมือนการ์ดใน right panel (เดิม orderMap ไม่เคยมี shipment เลย)
          select: {
            publicToken: true,
            orderNo: true,
            status: true,
            fulfillmentMode: true,
            totalAmount: true,
            updatedAt: true,
            paymentMethod: true,
            codReceivedAt: true,
            // นัดหมาย (feature 00024) — ขาด 4 ค่านี้แล้วการ์ดจะตกไปสาขา NO_SHIPPING ของ
            // OrderCardView แล้วขึ้นแค่ "สถานะ: <ชิปกว้าง ๆ>" แทนวันนัด/มัดจำ โดยไม่มีอะไรฟ้อง
            // (ทุก prop เป็น optional — tsc/build เขียวหมด) การ์ดใน right panel ส่งมาตั้งแต่
            // 2026-08-08 แล้ว การ์ดในเธรดเพิ่งตามมา 2026-08-12 หลัง user เจอบน prod
            serviceStart: true,
            serviceEnd: true,
            appointmentStatus: true,
            depositAmount: true,
            // ผันคำของการ์ดตามประเภทกิจการ — อ่านจากร้าน ณ ปัจจุบัน ไม่ใช่ธงบนแถวออเดอร์
            shop: { select: { vertical: true } },
            items: {
              select: { name: true, qty: true, price: true, product: { select: { images: true } } },
            },
            shipments: {
              where: { status: { not: "CANCELLED" } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { trackingNo: true, courierName: true, courierCode: true, status: true, carrierStatus: true },
            },
          },
        })
      : [];
    const orderMap = new Map(
      orderRows.map((o) => [
        o.publicToken,
        {
          token: o.publicToken,
          orderNo: o.orderNo, // เลขคำสั่งซื้อ DP… (user 2026-07-25)
          status: o.status,
          fulfillmentMode: o.fulfillmentMode,
          totalAmount: o.totalAmount.toFixed(2),
          statusAt: o.updatedAt.toISOString(),
          paymentMethod: o.paymentMethod,
          codReceivedAt: o.codReceivedAt ? o.codReceivedAt.toISOString() : null,
          vertical: o.shop.vertical,
          serviceStart: o.serviceStart ? o.serviceStart.toISOString() : null,
          serviceEnd: o.serviceEnd ? o.serviceEnd.toISOString() : null,
          appointmentStatus: o.appointmentStatus,
          depositAmount: o.depositAmount ? o.depositAmount.toFixed(2) : null,
          items: o.items.map((it) => ({
            name: it.name,
            qty: it.qty,
            price: it.price.toFixed(2),
            // Product.images = Json (array of fileId) → cast; custom line (productId null) = null
            imageFileId: (it.product?.images as string[] | undefined)?.[0] ?? null,
          })),
          shipment: o.shipments[0]
            ? {
                trackingNo: o.shipments[0].trackingNo,
                courierName: o.shipments[0].courierName,
                courierCode: o.shipments[0].courierCode,
                status: o.shipments[0].status,
                carrierStatus: o.shipments[0].carrierStatus,
              }
            : null,
        },
      ]),
    );

    // reply quote (feature 00018 Phase 3) — ดึง body/ผู้ส่งของข้อความที่ถูกตอบทับมาแสดง quote.
    // replyToMid: ช่องทางนอก = externalMessageId (Meta mid); DEEP = id ภายใน (ไม่มี mid) → match ทั้งคู่.
    // batch fetch กัน N+1, scope conversationId เดียวกัน
    const replyMids = Array.from(
      new Set(
        result.items
          .map((m) => (m as { replyToMid?: string | null }).replyToMid)
          .filter((x): x is string => !!x),
      ),
    );
    const repliedRows =
      replyMids.length > 0
        ? await prisma.chatMessage.findMany({
            where: {
              conversationId: id,
              OR: [{ externalMessageId: { in: replyMids } }, { id: { in: replyMids } }],
            },
            // rawMessage: ต้องอ่านมาด้วยเพื่อคำนวณ quotable ของ "ข้อความที่ถูกอ้างถึง" (isQuotable ด้านบน)
            // imageUrl: fileId ของสื่อ — ใช้วาดรูปย่อใน quote (ดู entry.imageUrl ด้านล่าง)
            select: {
              id: true,
              externalMessageId: true,
              body: true,
              type: true,
              senderRole: true,
              rawMessage: true,
              imageUrl: true,
            },
          })
        : [];
    const repliedMap = new Map<
      string,
      {
        /**
         * id ภายในของข้อความที่ถูกอ้างถึง — UI ใช้เป็นจุดหมายของ "แตะ quote แล้วเลื่อนไปหา"
         * (`[data-message-id]` ในเธรด). ต้องเป็น id ไม่ใช่ externalMessageId เพราะฝั่ง DEEP
         * ไม่มี mid เลย และ DOM ผูกกับ id เสมอทุกช่องทาง
         */
        id: string;
        body: string | null;
        senderRole: "BUYER" | "SHOP";
        quotable: boolean;
        /**
         * fileId ของรูปที่ถูกอ้างถึง (null เมื่อไม่ใช่ข้อความรูป) — ให้ UI วาดรูปย่อแทนคำว่า
         * "[รูปภาพ]" ซึ่งบอกไม่ได้ว่าหมายถึงรูปใบไหนในเธรดที่มีรูปติดกันหลายใบ
         * (user report 2026-08-11 เทียบกับ Messenger ที่แสดงรูปย่อ)
         */
        imageUrl: string | null;
      }
    >();
    for (const r of repliedRows) {
      // ข้อความสื่อ/การ์ด (body=null) → แสดง label แทนช่องว่างใน quote
      const label =
        r.body ??
        ({
          IMAGE: "[รูปภาพ]",
          VIDEO: "[วิดีโอ]",
          AUDIO: "[ข้อความเสียง]",
          FILE: "[ไฟล์แนบ]",
          ORDER: "[คำสั่งซื้อ]",
          PRODUCT: "[สินค้า]",
        }[r.type] ?? null);
      const entry = {
        id: r.id,
        body: label,
        senderRole: r.senderRole as "BUYER" | "SHOP",
        quotable: isQuotable(r.rawMessage),
        // เฉพาะ IMAGE — VIDEO/FILE ไม่มีภาพนิ่งให้ย่อ (ยังใช้ label เดิม) ส่วน imageUrl ของชนิดอื่น
        // เป็น fileId ของไฟล์ที่เอาไปวาดเป็นรูปไม่ได้ ส่งไปก็ได้แต่กรอบรูปแตก
        imageUrl: r.type === "IMAGE" ? r.imageUrl : null,
      };
      if (r.externalMessageId) repliedMap.set(r.externalMessageId, entry);
      repliedMap.set(r.id, entry);
    }

    // ผู้ส่งฝั่งร้าน (user 2026-08-02) — avatar ท้ายบับเบิลต้องบอกว่า "ใครในทีมเป็นคนตอบ"
    // ไม่ใช่โลโก้เพจเหมือนกันหมด. ร้านที่มีพนักงานหลายคนย้อนดูไม่ได้เลยว่าใครตอบข้อความไหน
    //
    // senderUserId = null คือข้อความที่มาทาง webhook (echo ของสิ่งที่ส่งจาก Messenger/Business
    // Suite โดยตรง หรือบอทตอบ) — ไม่มี "คน" ให้แสดง จึงตกไปใช้รูปเพจตามเดิม
    //
    // batch fetch กัน N+1; ไม่ select อะไรเกินชื่อ+รูป (ผู้ดูเป็นสมาชิกร้านเดียวกันอยู่แล้ว
    // แต่ไม่มีเหตุผลให้ email/เบอร์ของเพื่อนร่วมทีมหลุดลง flight payload)
    const senderIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.senderRole === "SHOP" && m.senderUserId)
          .map((m) => m.senderUserId as string),
      ),
    );
    const senderRows =
      senderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: senderIds } },
            select: { id: true, displayName: true, avatar: true },
          })
        : [];
    const senderMap = new Map(
      senderRows.map((u) => [u.id, { name: u.displayName, avatar: u.avatar }]),
    );
    // 4 query ข้างบนนี้ (สินค้า/ออเดอร์/ข้อความที่ถูกอ้างถึง/ผู้ส่ง) เรียงต่อกันทีละตัว — วัดรวมไว้
    // ก่อน ถ้าเลขก้อนนี้โต ค่อยแยกวัดทีละตัวแล้วพิจารณายุบเป็น Promise.all
    timer.mark("enrich", `p=${productIds.length},o=${orderTokens.length},r=${replyMids.length},s=${senderIds.length}`);

    const items = result.items.map((m) => ({
      ...m,
      // ลูกค้าแก้ข้อความนี้ทีหลังหรือเปล่า (message_edits, 2026-08-03) — ร่องรอยเก็บใน rawMessage.edit
      // ไม่ได้เพิ่มคอลัมน์ (ดู ingestMessageEdit); UI ใช้ขึ้นป้าย "แก้ไขแล้ว" ท้ายบับเบิล
      edited: !!(m as { rawMessage?: { edit?: unknown } | null }).rawMessage?.edit,
      /**
       * สติกเกอร์หรือรูปธรรมดา (S-7b LINE, 2026-08-10) — ร่องรอยอยู่ใน rawMessage เหมือน `edited`
       * ไม่ได้เพิ่มคอลัมน์
       *
       * ทำไมต้อง derive ที่นี่ ไม่ให้ UI เดาเอง: สติกเกอร์ถูกเก็บเป็น `type='IMAGE'` เหมือนรูปทั่วไป
       * (ดู ingestLineMessage) UI จึงเคยแยกด้วย "ขนาดจริงของรูป ≤ 240px" ซึ่งใช้ได้กับสติกเกอร์ Meta
       * (100×100) แต่ **ใช้ไม่ได้กับ LINE** เพราะ CDN ของ LINE ส่งมา 320–370px → หลุดเกณฑ์ กลายเป็น
       * "รูปที่ลูกค้าส่ง" ทั้งขนาดที่แสดงและปุ่มบันทึกรูปที่ไม่ควรมี (user เจอเองบน prod)
       * `filenamePrefix: 'line-sticker'` ที่ ingest ตั้งไว้ใช้แยกไม่ได้ เพราะ `saveFile` ตั้ง key
       * เป็น uuid ใหม่ทิ้งชื่อไฟล์เดิม — ชื่อนั้นไม่เคยไปถึง storage
       */
      isSticker: isStickerRawMessage((m as { rawMessage?: unknown }).rawMessage),
      // null = ไม่มีคนส่ง (webhook/บอท) → UI แสดงรูปเพจ; มีค่า = แสดงรูปคนนั้น + ชื่อตอน hover
      sender:
        m.senderRole === "SHOP" && m.senderUserId ? senderMap.get(m.senderUserId) ?? null : null,
      replyTo: (() => {
        const rmid = (m as { replyToMid?: string | null }).replyToMid;
        return rmid ? repliedMap.get(rmid) ?? null : null;
      })(),
      // reply/quote — ข้อความ "นี้เอง" อ้างอิงได้ไหมถ้าถูกตอบทับต่อ (composer ใช้ตัดสินก่อนกดส่ง
      // ผ่าน replyingTo.quotable — ดู isQuotable ด้านบนไฟล์นี้)
      quotable: isQuotable((m as { rawMessage?: unknown }).rawMessage),
      productCard:
        m.type === "PRODUCT" && m.productRefId && productMap.has(m.productRefId)
          ? (() => {
              const p = productMap.get(m.productRefId!)!;
              // isActive=false ยัง join ได้ (FR-CTX-08 "หยุดขายแล้ว" ตัดสินใจที่ UI); ลบจริง (ไม่พบใน map) = null
              return { id: p.id, name: p.name, price: p.price, imageFileId: p.images[0] ?? null, isActive: p.isActive };
            })()
          : null,
      /**
       * การ์ดหลายชิ้น (ส่วนขยาย 2026-08-11) — `null` เมื่อข้อความนี้เป็นการ์ดใบเดียว (ใช้ productCard เดิม)
       *
       * 🛑 คงลำดับตาม `productRefIds` ที่บันทึกไว้ ไม่ใช่ลำดับที่ query คืนมา — ลำดับใน carousel คือสิ่งที่
       * ผู้ขายตั้งใจให้ลูกค้าเห็นก่อน-หลัง และเป็นลำดับเดียวกับที่ยิงออกไปจริง
       *
       * สินค้าที่ถูกลบหลังส่ง → ไม่อยู่ใน map → คืน `null` **ในตำแหน่งเดิม** (ไม่ filter ทิ้ง) เพื่อให้ UI
       * วาด "ไม่พบสินค้านี้แล้ว" เป็นใบหนึ่งในแถว ไม่ใช่การ์ดหายไปเฉย ๆ แล้วผู้ขายนึกว่าส่งไม่ครบ
       */
      productCards:
        m.type === "PRODUCT" && ((m as { productRefIds?: string[] }).productRefIds?.length ?? 0) > 0
          ? (m as { productRefIds?: string[] }).productRefIds!.map((pid) => {
              const p = productMap.get(pid);
              return p
                ? { id: p.id, name: p.name, price: p.price, imageFileId: p.images[0] ?? null, isActive: p.isActive }
                : null;
            })
          : null,
      orderCard: m.type === "ORDER" && m.orderRefToken ? orderMap.get(m.orderRefToken) ?? null : null,
    }));

    // externalReadAt — watermark "ลูกค้าอ่านถึงเวลานี้" (feature 00018 read receipt)
    // bug fix 2026-07-23 (user report: "อ่านแล้วแต่ไม่ขึ้นว่าอ่านแล้ว"): ค่านี้เดิมส่งลง UI ทาง
    // server prop ของ page.tsx เท่านั้น = อ่านครั้งเดียวตอนเปิดหน้า. read event ของ Meta มาทีหลัง
    // ทาง webhook และ **ไม่ได้ insert ChatMessage** จึงไม่ทริกเกอร์ realtime broadcast → client
    // ไม่มีทางรู้เลยจนกว่าจะรีโหลดหน้าเอง. ส่งมากับ GET นี้ด้วยเพื่อให้ refetch รอบถัดไป (realtime/
    // focus/poll) อัปเดตป้าย "ส่งแล้ว → อ่านแล้ว" ได้เอง
    // externalDeliveredAt — watermark "ข้อความของร้านถึงเครื่องลูกค้าถึงเวลานี้" (message_deliveries,
    // 2026-08-05) เดินทางคู่กับ externalReadAt ด้วยเหตุผลเดียวกันเป๊ะ: delivery event ของ Meta
    // **ไม่ได้ insert ChatMessage** จึงไม่มี realtime broadcast ให้เกาะ ต้องติดมากับ GET นี้เพื่อให้
    // ป้าย "ส่งแล้ว → ได้รับแล้ว" ขยับเองได้ใน refetch รอบถัดไป (poll 6 วิ) โดยไม่ต้องรีโหลดหน้า
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { externalReadAt: true, externalDeliveredAt: true },
    });
    timer.mark("watermark");
    return NextResponse.json(
      {
        items,
        nextCursor: result.nextCursor,
        externalReadAt: conv?.externalReadAt ? conv.externalReadAt.toISOString() : null,
        externalDeliveredAt: conv?.externalDeliveredAt ? conv.externalDeliveredAt.toISOString() : null,
      },
      // Timing-Allow-Origin ไม่ต้องใส่ — client อ่านจากโดเมนเดียวกัน (seller.deepthailand.app)
      { headers: { "Server-Timing": timer.header() } },
    );
  } catch (e: unknown) {
    return mapChatServiceError(e, "GET /api/chat/conversations/[id]/messages");
  }
}

/**
 * POST /api/chat/conversations/[id]/messages — ส่งข้อความ TEXT/IMAGE/PRODUCT
 *
 * ทำไม senderRole derive จาก subdomain ไม่รับจาก client body:
 * route รู้ context ของตัวเองอยู่แล้ว (seller.* = SHOP, main = BUYER) — SDS §3.3.
 * service ยัง verify ซ้ำอีกชั้น (กัน client ปลอม แม้ derive ถูกที่ route แล้ว)
 */
/**
 * แนบผู้ส่ง (คนในทีมร้าน) ให้ข้อความที่เพิ่งสร้าง — ให้ shape ตรงกับ GET ซึ่ง enrich `sender` มาแล้ว
 * (user 2026-08-02: avatar ท้ายบับเบิลต้องบอกว่าใครเป็นคนตอบ)
 *
 * ถ้าไม่แนบ บับเบิลที่เพิ่งส่งจะแสดงรูปเพจอยู่พักหนึ่งแล้วเปลี่ยนเป็นรูปคนตอน refetch รอบถัดไป
 * ซึ่งอ่านเหมือนระบบสลับตัวตนของผู้ส่งเอง. PK lookup ครั้งเดียวต่อการส่ง 1 ข้อความ
 */
async function withSender<T extends { senderUserId: string | null }>(message: T, userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatar: true },
  });
  return {
    ...message,
    sender: u ? { name: u.displayName, avatar: u.avatar } : null,
    // reply/quote — ข้อความที่เพิ่งส่งสำเร็จนี้เอง มี quoteToken ให้อ้างต่อได้ไหม (ดู isQuotable
    // ด้านบนไฟล์นี้) เผื่อร้านกด "ตอบกลับ" บนข้อความนี้ก่อน GET refetch รอบถัดไปจะมาเติม replyTo
    // ให้ครบ — message ที่ผ่านมาที่นี่คือแถวดิบจาก Prisma จึงมี rawMessage อยู่แล้ว
    quotable: isQuotable((message as { rawMessage?: unknown }).rawMessage),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  // derive senderRole จาก subdomain — ห้ามรับจาก client (SRS §10)
  // ต้อง derive ก่อน rate-limit เพราะเพดานแยกตามบทบาท (ดูบล็อกถัดไป)
  const host = request.headers.get("host") || "";
  const senderRole: SenderRole = getSubdomain(host) === "seller" ? "SHOP" : "BUYER";

  // per-user chat-send rate-limit — ชั้นที่ 2 แยกจาก global per-IP ของ proxy.ts (API.md §6)
  //
  // เพดานแยกตามบทบาท (2026-08-02): เจตนาเดิมของ BR-CHAT-07 คือกัน "buyer สแปมร้าน"
  // (PRD 00011 ตาราง Risks) แต่พอ multi-attachment ทำให้ 1 ไฟล์ = 1 ข้อความ ร้านที่แนบไฟล์
  // รวดเดียวหลายสิบไฟล์จะโดนกฎที่ตั้งมากันลูกค้า เล่นงานตัวเอง — ผ่อนเฉพาะฝั่งร้านจึงไม่ได้
  // ลดการป้องกันที่ตั้งใจไว้แต่แรกเลย. key ยังเป็น per-user เหมือนเดิม
  const rateMax = senderRole === "SHOP" ? CHAT_RATE_LIMIT_MAX_SHOP : CHAT_RATE_LIMIT_MAX;
  if (!checkApiRateLimit(`chat-send:${userId}`, rateMax, CHAT_RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = v.safeParse(SendChatMessageSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }
  const {
    type,
    body: text,
    imageUrl,
    attachmentName: rawAttachmentName,
    attachmentSize,
    productRefId,
    productRefIds,
    orderRefToken,
    replyToMessageId,
    stickerId,
    stickerImageUrl,
    imageFileIds,
    hiddenSummaryKeys,
    summaryClosing,
  } = parsed.output;

  // สติกเกอร์: ต้องมาครบทั้ง id และ url และเป็นของช่องทาง Meta เท่านั้น (แชท DEEP ไม่มีสติกเกอร์
  // ให้ส่ง — ปล่อยผ่านจะได้แถว IMAGE ที่ไม่มีปลายทางจริง) — เช็คช่องทางหลัง fetch conv ด้านล่าง
  if (type === "STICKER" && (!stickerId || !stickerImageUrl)) {
    return NextResponse.json({ error: "ข้อมูลสติกเกอร์ไม่ครบ" }, { status: 400 });
  }
  // กริดรูป (2026-08-04) — ต้องมีอย่างน้อย 2 ใบ ไม่งั้นใช้เส้นทางรูปเดี่ยวเดิมก็พอ
  if (type === "IMAGE_GRID" && (!imageFileIds || imageFileIds.length < 2)) {
    return NextResponse.json({ error: "ต้องมีรูปอย่างน้อย 2 ใบ" }, { status: 400 });
  }

  try {
    // feature 00018: เธรดช่องทางนอกต้องส่งออกผ่าน Graph API ไม่ใช่เขียน DB ตรง ๆ
    //
    // ต้อง fetch ก่อน validate (2026-08-02): กฎของไฟล์แนบขึ้นกับช่องทางปลายทาง —
    // .docx ส่ง Messenger ได้แต่ส่ง IG ไม่ได้ จึงตัดสินไม่ได้เลยถ้ายังไม่รู้ว่าเธรดนี้ช่องทางไหน
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { channel: true, shopId: true },
    });

    // แถวสินค้าที่ผ่านด่าน ownership แล้ว — ใช้ต่อตอนประกอบการ์ด Flex ให้ LINE (ไม่ query ซ้ำ)
    let productRow: Awaited<ReturnType<typeof getProductById>> = null;
    /** สินค้าทุกชิ้นที่จะไปอยู่ในการ์ด เรียงตามที่ผู้ขายเลือก (ใบเดียว = array ยาว 1) */
    let productRows: NonNullable<Awaited<ReturnType<typeof getProductById>>>[] = [];

    // conditional-required — Valibot schema เดียวไม่ครอบทุกกรณี (SendChatMessageSchema comment)
    if (type === "TEXT") {
      if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
      }
    } else if (isAttachmentType(type)) {
      if (!imageUrl) {
        return NextResponse.json({ error: "กรุณาแนบไฟล์" }, { status: 400 });
      }
      // server-side re-check — กัน client ยิง fileId ของไฟล์ที่ไม่ควรส่ง (เช่น .pdf จาก L3 KYC
      // หรือไฟล์รันได้) เข้ามาตรง ๆ โดยไม่ผ่าน /api/chat/upload
      //
      // WARNING: size ที่ใช้ตรงนี้มาจาก client จึงเป็นแค่ตัวกรองเชิงประสบการณ์ (ให้ error สวย)
      // เพดานขนาดตัวจริงบังคับที่ /api/chat/upload ซึ่งเห็นไฟล์จริง + bucket cap 25MB อีกชั้น
      const ext = fileIdExt(imageUrl).toLowerCase();
      const mime = EXT_TO_MIME[ext] ?? "";
      const check = checkChannelSupport(conv?.channel ?? "DEEP", {
        kind: attachmentKind(mime, ext),
        mime,
        ext,
        size: attachmentSize ?? 0,
      });
      if (!check.ok) {
        return NextResponse.json({ error: check.reason }, { status: 400 });
      }
    } else if (type === "PRODUCT") {
      // extension #1 Chat Product Context Card (S-18) + ส่วนขยาย 2026-08-11 (หลายรายการ)
      //
      // รวมสองทางเข้าเป็น "รายการเดียว" ตั้งแต่บรรทัดแรก — ที่เหลือของ handler จึงไม่ต้องรู้เลยว่า
      // client ส่งมาแบบเดี่ยวหรือแบบหลายชิ้น (สองเส้นทางขนานคือที่ที่ด่าน ownership จะหลุดไปข้างหนึ่ง)
      const wantedIds = productRefIds ?? (productRefId ? [productRefId] : []);
      if (wantedIds.length === 0) {
        return NextResponse.json({ error: "กรุณาระบุสินค้า" }, { status: 400 });
      }
      // กันเลือกซ้ำ (กดรัวบน UI / client ส่งซ้ำ) — การ์ดใบเดียวกันสองใบในข้อความเดียวไม่มีความหมาย
      const uniqueIds = [...new Set(wantedIds)];
      // เพดานต่อช่องทาง — บังคับที่ server ด้วย ไม่ใช่เชื่อว่า UI กันมาแล้ว (UI กันได้เฉพาะคนที่เดิน
      // ผ่านหน้าจอ) เกินแล้วตอบ 400 พร้อมตัวเลขจริง ไม่ตัดทิ้งเงียบ ๆ ให้ร้านเข้าใจว่าส่งครบ
      const channelForCap = conv?.channel ?? "DEEP";
      const maxSelectable = maxSelectableProducts(channelForCap);
      if (uniqueIds.length > maxSelectable) {
        return NextResponse.json(
          { error: `เลือกได้สูงสุด ${maxSelectable} รายการต่อการส่งหนึ่งครั้ง` },
          { status: 400 },
        );
      }
      // 🛑 ด่าน cross-shop (FR-CTX-07) เดิมอยู่ใน `chat.service.sendMessage()` ซึ่งเป็นเส้นทางของ
      // ช่องทาง DEEP เท่านั้น — ช่องทางนอกไม่เคยต้องใช้เพราะ PRODUCT ถูกตอบ 400 ทิ้งก่อนถึงตรงนั้น
      // พอเปิด LINE (2026-08-11) เส้นทางใหม่วิ่งผ่านตัวส่งของช่องทางนอก (วันนี้คือ `enqueueOutbound`)
      // ซึ่ง **ไม่ผ่าน sendMessage** ด่านเดิมจึงไม่ครอบ ต้องกันที่นี่ด้วยเกณฑ์เดียวกันเป๊ะ (ใช้ helper ตัวเดียวกัน ไม่เขียน query ใหม่
      // ไม่งั้นสองที่จะนิยาม "สินค้าอยู่ในร้านนี้ไหม" ต่างกันวันที่โมเดลขยับ — HR16)
      //
      // ตรวจ **ทุก id** ไม่ใช่ใบแรก: ปล่อยผ่านใบเดียวแล้วเชื่อที่เหลือ = ช่องส่งการ์ดสินค้าร้านอื่น
      const found = await getProductsByIds(uniqueIds);
      const owned = new Map(found.filter((p) => p.shopId === conv?.shopId).map((p) => [p.id, p]));
      if (owned.size !== uniqueIds.length) {
        return NextResponse.json({ error: "ไม่พบสินค้านี้ในร้าน" }, { status: 400 });
      }
      // คงลำดับที่ผู้ขายเลือกไว้ — ลำดับใน carousel คือสิ่งที่เขาตั้งใจให้ลูกค้าเห็นก่อน-หลัง
      productRows = uniqueIds.map((pid) => owned.get(pid)!);
      productRow = productRows[0]!;
    } else if (type === "IMAGE_GRID") {
      // ตรวจครบก่อนเข้า try แล้ว — สาขานี้มีไว้กัน fail-closed ด้านล่างไม่ให้ตีตก
    } else if (type === "STICKER") {
      // ตรวจ stickerId/stickerImageUrl ไปแล้วก่อนเข้า try — ที่นี่แค่ต้อง "มีสาขาของตัวเอง"
      //
      // bug ที่ user เจอบน prod 2026-08-04 ("พอกดเลือก sticker แล้ว ... ไม่ส่งอะไรเลย"):
      // ก่อนหน้านี้ห่วงโซ่นี้ปิดท้ายด้วย `else` ที่เขียนไว้สำหรับ ORDER อย่างเดียว — ค่าใหม่ที่เพิ่ม
      // เข้า picklist จึงตกลงไปในนั้นแล้วถูกตอบ 400 "กรุณาระบุออเดอร์" ทุกครั้ง
      // นี่คือรูปแบบเดียวกับบทเรียน docs/conventions/enum-value-removal.md เป๊ะ ๆ (ตรรกะที่ปิดท้าย
      // ด้วย else เงียบ ๆ ไม่พังตอนเพิ่มค่าใหม่ แต่ส่งค่าใหม่ไปเข้า branch ที่ผิด) — เปลี่ยนก้อน
      // สุดท้ายเป็น `else if (type === "ORDER")` + fail-closed ให้ค่าที่ยังไม่รองรับเด้ง error
      // ที่บอกตรง ๆ ไม่ใช่ error ของชนิดอื่น
    } else if (type === "ORDER" || type === "APPOINTMENT") {
      // การ์ดออเดอร์/ใบเสนอราคาในแชท (user 2026-07-24) · การ์ดสรุปนัดหมาย (ส่วนขยาย 00024)
      // ทั้งคู่อ้าง Order.publicToken ตัวเดียวกัน — ด่านที่เหลือของ APPOINTMENT อยู่ด้านล่าง
      // (ต้องรอ conv.shopId ก่อนถึงจะ scope query ได้)
      if (!orderRefToken) {
        return NextResponse.json({ error: "กรุณาระบุออเดอร์" }, { status: 400 });
      }
    } else {
      // fail-closed: ชนิดที่เพิ่มใน picklist แต่ยังไม่มีใครเขียนกฎรองรับ — ห้ามตกไปใช้กฎของชนิดอื่น
      return NextResponse.json({ error: "ยังไม่รองรับชนิดข้อความนี้" }, { status: 400 });
    }

    /**
     * การ์ดสรุปนัดหมาย (ส่วนขยาย 00024, 2026-08-11) — ด่าน fail-closed ครบชุด + ประกอบเนื้อหา
     *
     * ทำไมอยู่ที่นี่ไม่ใช่ในสาขา conditional-required ด้านบน: ทุกด่านต้องใช้ `conv.shopId` เพื่อ
     * scope query — และ ownership ต้องอยู่ **ใน `WHERE`** ไม่ใช่ดึงมาแล้วค่อยเทียบทีหลัง
     *
     * ประกอบครั้งเดียวใช้ทั้งสองเส้นทาง (DEEP กับช่องทางนอก) — ถ้าประกอบแยกสองที่ วันหนึ่งคำบน
     * การ์ดของสองช่องทางจะต่างกันโดยไม่มีอะไรฟ้อง (HR16)
     */
    let appointmentSummary: AppointmentSummary | null = null;
    let appointmentUrl: string | null = null;
    if (type === "APPOINTMENT") {
      const order = await prisma.order.findFirst({
        // ownership อยู่ใน WHERE — ออเดอร์ของร้านอื่นคือ "ไม่มีอยู่" ไม่ใช่ "ห้ามแตะ"
        where: { publicToken: orderRefToken!, shopId: conv?.shopId },
        select: {
          serviceStart: true,
          serviceEnd: true,
          appointmentStatus: true,
          buyerName: true,
          buyerContact: true,
          totalAmount: true,
          depositAmount: true,
          items: { select: { name: true }, take: 1 },
          serviceResource: { select: { name: true } },
          shop: { select: { kind: true, vertical: true } },
        },
      });
      if (!order) {
        return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้ในร้าน" }, { status: 400 });
      }
      // อ่าน vertical ปัจจุบันของร้านเสมอ ไม่ใช่ธงที่เก็บบนแถวออเดอร์ — ร้านเปลี่ยนประเภททีหลังได้
      // (docs/conventions/stored-flag-vs-owner-truth.md)
      if (!canUseAppointments(order.shop)) {
        return NextResponse.json({ error: "ร้านนี้ไม่ได้ใช้ระบบประเภทงาน" }, { status: 403 });
      }
      if (!order.serviceStart) {
        return NextResponse.json({ error: "คำสั่งซื้อนี้ไม่มีนัดหมาย" }, { status: 400 });
      }
      // นัดที่ให้บริการไปแล้ว/ไม่มาตามนัด — ส่งใบยืนยันออกไปตอนนี้คือการส่งข้อมูลที่ผิดให้ลูกค้า
      if (isTerminalAppointmentStatus(order.appointmentStatus)) {
        return NextResponse.json({ error: "นัดนี้จบแล้ว ส่งสรุปไม่ได้" }, { status: 400 });
      }

      // ลิงก์ประกอบจากตัวกลางตัวเดียว — ชีตพรีวิวใช้ตัวเดียวกัน ไม่งั้นพรีวิวเพี้ยนจากของจริง
      // `orderRefToken` เป็น optional ตาม schema — โค้ดเดิมยัดลง template literal ได้เพราะ
      // JS แปลง undefined เป็นสตริง (ลิงก์ /o/undefined) ตอนนี้ tsc จับให้แล้ว กันไว้ตรง ๆ
      appointmentUrl = orderRefToken ? publicOrderUrl(orderRefToken) : null;
      const deposit = Number(order.depositAmount ?? 0);
      appointmentSummary = buildAppointmentSummary(
        {
          serviceStart: order.serviceStart,
          serviceEnd: order.serviceEnd,
          serviceName: order.items[0]?.name ?? null,
          resourceName: order.serviceResource?.name ?? null,
          customerName: order.buyerName,
          phone: order.buyerContact,
          // ฟอร์แมตเงินด้วยสูตรกลางของระบบเสมอ — lib ของการ์ดไม่ฟอร์แมตเอง (HR16)
          totalText: formatBaht(Number(order.totalAmount)),
          depositText: deposit > 0 ? formatBaht(deposit) : null,
        },
        {
          // 🛑 `hiddenSummaryKeys` ผ่าน picklist ที่ไม่มี 'when' มาแล้วตั้งแต่ schema —
          // ด่านนี้คือชั้นที่สอง ชั้นแรกคือ checkbox ที่ disabled ในชีต (UI กันได้แค่คนที่เดินผ่านประตู)
          hiddenKeys: hiddenSummaryKeys,
          closing: summaryClosing,
          url: appointmentUrl,
        },
      );
    }

    // sanitize ซ้ำที่ server — ชื่อนี้ไปโผล่ใน Content-Disposition ตอนดาวน์โหลด (header injection)
    const attachmentName = rawAttachmentName ? sanitizeAttachmentName(rawAttachmentName) : null;

    // reply/quote (user 2026-07-25): resolve ข้อความที่ตอบทับ → replyToMid ที่จะเก็บ/ส่ง.
    // ช่องทางนอก = externalMessageId (Meta mid, ต้องมีจึง reply_to ได้); DEEP = id ภายใน (ไม่มี mid).
    let replyToMid: string | null = null;
    if (replyToMessageId) {
      const replied = await prisma.chatMessage.findFirst({
        where: { id: replyToMessageId, conversationId: id },
        select: { id: true, externalMessageId: true },
      });
      if (replied) {
        replyToMid =
          conv && conv.channel !== "DEEP" ? (replied.externalMessageId ?? null) : replied.id;
      }
    }

    if (conv && conv.channel !== "DEEP") {
      // การ์ดสินค้า — ทุกช่องทางได้การ์ดจริงแล้ว (LINE = Flex 2026-08-11, Messenger/IG = Generic
      // Template รอบเดียวกัน) แต่ **รูปคนละไฟล์กัน**: LINE ครอบ 1:1 เอง ส่วน Messenger ครอปทุกอย่าง
      // ที่ไม่ใช่ 1.91:1 (เอกสาร Meta) รูปสินค้าจัตุรัสจะโดนตัดหัวท้าย จึงต้องประกอบรูปแยกตามช่องทาง
      if (type === "PRODUCT") {
        /**
         * ส่วนขยาย 2026-08-11 — การ์ดสินค้าหลายชิ้นในข้อความเดียว (carousel)
         *
         * แบ่งเป็นชุดตามเพดานของช่องทางด้วย `chunkProductCards` ซึ่งเป็น **ฟังก์ชันตัวเดียวกับที่
         * หน้าจอใช้คำนวณป้าย "จะแบ่งส่งเป็น N ข้อความ"** — ถ้าสองฝั่งใช้คนละสูตร ป้ายจะโกหกโดยไม่มี
         * tsc/build ตัวไหนฟ้อง เพราะเลขทั้งคู่ "ถูก" ในตัวเอง (HR16)
         *
         * 🛑 ส่งเรียงทีละชุด (ไม่ Promise.all) — ลำดับการ์ดที่ลูกค้าเห็นต้องตรงกับที่ผู้ขายเลือก
         * ยิงขนานแล้ว Meta/LINE จะจัดลำดับตามเวลาที่รับ ซึ่งสลับกันได้
         *
         * ชุดแรกล้ม → error ขึ้นตามปกติ (ยังไม่มีอะไรถึงลูกค้า) · ชุดหลังล้ม → ลูกค้าได้ของบางส่วนไปแล้ว
         * จึงคืน 207 พร้อมบอกตรง ๆ ว่าส่งได้กี่ข้อความจากกี่ข้อความ ห้ามตอบ 500 เฉย ๆ ให้ร้านเข้าใจว่า
         * ไม่มีอะไรถึงลูกค้าเลยแล้วกดส่งซ้ำทั้งชุด (ลูกค้าจะได้ของซ้ำ)
         */
        const perMessage = productCardsPerMessage(conv.channel);
        const batches = chunkProductCards(
          productRows.map((row) => row.id),
          perMessage,
        );
        const byId = new Map(productRows.map((row) => [row.id, row]));

        /**
         * idempotent-guard (2026-08-11) — เส้นทาง DEEP มีด่านนี้มาตั้งแต่ BR-CTX-02 ใน
         * `chat.service.sendMessage()` แต่ช่องทางนอกวิ่งผ่านตัวส่งของตัวเอง (วันนี้คือ
         * `enqueueOutbound`) ซึ่งไม่ผ่านตัวนั้น จึงไม่เคยมีด่านเลย — กดส่งรัว ๆ = ลูกค้าได้การ์ดซ้ำ
         * และ **บน LINE เสียโควตาจริง** ทุกครั้งที่เกินครั้งแรก (reply token ใช้ได้ครั้งเดียว
         * ครั้งถัดไปตกไปใช้ push ที่นับเงิน)
         *
         * (CR 2026-08-23) ด่านนี้สำคัญขึ้นอีกขั้นในเส้นทางคิว: การกดซ้ำระหว่างที่แถวแรกยังเป็น
         * `QUEUED` จะได้ 2 แถวที่ทั้งคู่ถูกยิงออกไปจริง — ตัวระบายคิวมองไม่ออกว่านั่นคือการกดซ้ำ
         *
         * ดึงเท่าจำนวนข้อความที่กำลังจะส่ง แล้วเทียบทั้งชุดตามลำดับ (ดู `isDuplicateProductSend`)
         * เจอว่าซ้ำ → คืน **แถวเดิม** เหมือนที่ DEEP ทำ ไม่ใช่ตอบ error: ฝั่งผู้ขายผลลัพธ์เหมือนกัน
         * ทุกประการ (การ์ดใบนั้นอยู่ในเธรดแล้ว) ต่างกันแค่ไม่มีอะไรถูกยิงออกไปรอบสอง
         */
        const recentForGuard = await prisma.chatMessage.findMany({
          where: { conversationId: id },
          orderBy: [{ createdAt: "desc" }, { seq: "desc" }],
          take: batches.length,
        });
        const isDuplicate = isDuplicateProductSend(
          recentForGuard.map((r) => ({
            type: r.type,
            // แถวเก่าก่อนส่วนขยาย "หลายรายการ" เก็บไว้ที่ `productRefId` เดี่ยว — normalize ให้เป็น
            // รูปเดียวกันเหมือนที่ฝั่ง GET ทำ ไม่งั้นการ์ดใบเดียวของเก่าจะหลุดด่านไปทุกใบ
            productRefIds: r.productRefIds.length > 0 ? r.productRefIds : r.productRefId ? [r.productRefId] : [],
            deliveryStatus: r.deliveryStatus,
          })),
          batches,
        );
        if (isDuplicate) {
          return NextResponse.json(await withSender(recentForGuard[0]!, userId));
        }

        let lastSent: Awaited<ReturnType<typeof enqueueOutbound>> | null = null;
        for (let i = 0; i < batches.length; i++) {
          const ids = batches[i]!;
          const rows = ids.map((pid) => byId.get(pid)!);
          // text ยังต้องส่งเสมอ: เป็น ChatMessage.body ที่ร้านเห็นในประวัติ และเป็นทางถอยถ้าการ์ดล้ม
          const fallbackText = rows.map((r) => `${r.name}\n${formatBaht(r.price)}`).join("\n\n");

          try {
            if (conv.channel === "LINE") {
              // แปลงเป็น JPEG ก่อนเสมอ — Flex รับแค่ JPEG/PNG แต่รูปสินค้าเป็น webp/gif ได้
              const cards = await Promise.all(
                rows.map(async (r) => ({
                  name: r.name,
                  priceText: formatBaht(r.price),
                  imageUrl: r.images[0] ? await resolveLineFlexImageUrl(r.images[0], { shopId: conv.shopId }) : null,
                  isActive: r.isActive,
                })),
              );
              lastSent = await enqueueOutbound({
                conversationId: id,
                actorUserId: userId,
                text: fallbackText,
                flex: buildLineFlexProductCarousel(cards),
                productRefIds: ids,
              });
            } else {
              // Messenger/IG ครอปทุกอย่างที่ไม่ใช่ 1.91:1 (เอกสาร Meta) — รูปสินค้าจัตุรัสจะโดนตัด
              // หัวท้าย จึงต้องประกอบรูปคนละไฟล์กับฝั่ง LINE ที่ครอบ 1:1 เอง
              const cards = await Promise.all(
                rows.map(async (r) => ({
                  name: r.name,
                  priceText: formatBaht(r.price),
                  imageUrl: r.images[0] ? await resolveMetaCardImageUrl(r.images[0], { shopId: conv.shopId }) : null,
                  isActive: r.isActive,
                })),
              );
              lastSent = await enqueueOutbound({
                conversationId: id,
                actorUserId: userId,
                text: fallbackText,
                template: buildMetaProductCarousel(cards),
                productRefIds: ids,
              });
            }
          } catch (e) {
            if (i === 0) throw e; // ยังไม่มีแถวไหนเกิด — ให้ตัวจัดการ error เดิมตอบตามปกติ
            console.error("[POST messages] เข้าคิวการ์ดสินค้าชุดที่ " + (i + 1) + " ไม่สำเร็จ", e);
            /**
             * ชุดก่อนหน้า **เข้าคิวไปแล้ว** = มันจะถูกยิงออกไปแน่นอน (ตัวเก็บงานค้างรับช่วงต่อ
             * ถึงแม้คำขอนี้จบลงตรงนี้) ⇒ ยังต้องตอบ 207 เหมือนเดิม ห้ามตอบ error ก้อนเดียว
             * ไม่งั้นผู้ขายเข้าใจว่าไม่มีอะไรถึงลูกค้าเลยแล้วกดส่งซ้ำทั้งชุด = ลูกค้าได้ของซ้ำ
             *
             * คำเปลี่ยนจาก "ส่งได้ i จาก N" เป็น "เข้าคิวส่งแล้ว" เพราะตอนนี้มันจริงแค่นั้น —
             * แถวที่เข้าคิวยังไม่ถึงลูกค้า ณ วินาทีที่ตอบ (value-fate-decided-at-write-site.md:
             * ห้ามเขียนคำอ้างเรื่องพฤติกรรมที่โค้ดยังไม่ได้ทำ). ฟิลด์ `sentMessages`/`totalMessages`
             * คงชื่อและความหมายเดิม (จำนวนข้อความที่ผ่านด่านไปแล้ว) — หน้าจอติ๊กใบที่ออกไปแล้ว
             * ออกให้เองด้วยตัวเลขนี้
             */
            // (F3 รอบแก้ 1) ชุดก่อนหน้าเข้าคิวไปแล้วจริง ๆ ⇒ ต้องระบายให้ด้วย ไม่ใช่ปล่อยรอตัวเก็บ
            // งานค้างนานถึง 1 นาที ทั้งที่คำขอนี้ทำให้ฟรีได้ (เส้นทางสำเร็จด้านล่างก็ทำแบบเดียวกัน)
            after(deliverRoom(id, "after"));
            return NextResponse.json(
              {
                error: `เข้าคิวส่งแล้ว ${i} จาก ${batches.length} ข้อความ — เอารายการที่ส่งแล้วออกให้แล้ว กดส่งอีกครั้งเพื่อส่งส่วนที่เหลือ`,
                sentMessages: i,
                totalMessages: batches.length,
              },
              { status: 207 },
            );
          }
        }
        // ยิงจริงเบื้องหลัง — ตัวการันตีคือตัวเก็บงานค้าง ไม่ใช่บรรทัดนี้: แถวถูกเขียนลง DB ไปแล้ว
        // **ก่อน** response ออกจากฟังก์ชัน ต่อให้ after() ไม่ได้รัน (ผู้ขายปิดแอปจน connection ขาด)
        // ตัวเก็บงานค้างจะมารับช่วง
        after(deliverRoom(id, "after"));
        return NextResponse.json(await withSender(lastSent!, userId), { status: 202 });
      }
      /**
       * APPOINTMENT (การ์ดสรุปนัด, ส่วนขยาย 00024 2026-08-11)
       *
       * ต่างจาก ORDER ตรงที่ **ได้การ์ดจริงทั้ง LINE และ Meta** — นัดมีหน้าสาธารณะ `/o/{token}`
       * ที่ลูกค้ากด "ยืนยันนัด"/"ขอเลื่อนนัด" ได้อยู่แล้วตั้งแต่ 00024 จึงมีปุ่มให้ใส่ (การ์ดสินค้า
       * ไม่มีปุ่มเพราะไม่มีหน้าสาธารณะรายชิ้น) — ก่อนหน้านี้ไม่มีเส้นทางไหนพาลูกค้าไปถึงหน้านั้นเลย
       *
       * 🛑 `text` ส่งเสมอทุกกรณี: เป็นทั้ง `ChatMessage.body` ที่ร้านค้นหาเจอในประวัติ และเป็น
       * ทางถอยของช่องทางที่ยังไม่มี builder — การ์ดที่ส่งไม่ออกต้องกลายเป็นข้อความ ไม่ใช่หายเงียบ
       */
      if (type === "APPOINTMENT") {
        const summary = appointmentSummary!;
        const url = appointmentUrl!;
        // uri action ของ LINE รับเฉพาะ https — dev ที่ base เป็น http จะโดนปฏิเสธทั้งข้อความ
        // จึงถอยไปใช้ข้อความล้วน ดีกว่าส่งไม่ออกเลย (กติกาเดียวกับการ์ดออเดอร์ด้านล่าง)
        const httpsOk = url.startsWith("https://");
        const sent = await enqueueOutbound({
          conversationId: id,
          actorUserId: userId,
          text: summary.text,
          flex:
            conv.channel === "LINE" && httpsOk
              ? buildLineFlexAppointmentCard(summary, url)
              : undefined,
          template:
            conv.channel !== "LINE" && httpsOk
              ? buildMetaAppointmentCard(summary, url)
              : undefined,
          orderRefToken: orderRefToken!, // ฝั่งเราเก็บเป็นการ์ด (ChatMessage.type='ORDER')
          // บอก service ว่านี่คือ "สรุปนัด" ไม่ใช่ "ออเดอร์" — คุมคำใน preview และการเก็บ body
          isAppointmentCard: true,
        });
        // ยิงจริงเบื้องหลัง — ตัวการันตีคือตัวเก็บงานค้าง ไม่ใช่บรรทัดนี้ (ดูคำอธิบายเต็มที่เส้นทาง PRODUCT)
        after(deliverRoom(id, "after"));
        return NextResponse.json(await withSender(sent, userId), { status: 202 });
      }
      // ORDER (การ์ดคำสั่งซื้อ, user 2026-07-25): ลูกค้าฝั่ง Messenger/IG ได้ "ลิงก์" ผ่าน Meta แต่ฝั่งเรา
      // เก็บเป็น type=ORDER → ร้านเห็นเป็นการ์ด (ร้านอยู่ในระบบเรา = การ์ด). verify order-in-shop ที่นี่
      if (type === "ORDER") {
        const order = await prisma.order.findFirst({
          where: { publicToken: orderRefToken!, shopId: conv.shopId },
          // _count.items: ใช้บอกว่า "และอีก n รายการ" บนการ์ด Flex — ต้องนับจากฐาน ไม่ใช่ items.length
          // ที่ take:1 ไว้แล้ว (จะได้ 1 เสมอ ซึ่งแปลว่าการ์ดจะบอกว่ามีรายการเดียวตลอดกาล)
          select: {
            totalAmount: true,
            items: { select: { name: true }, take: 1 },
            _count: { select: { items: true } },
            // คำที่ลูกค้าเห็นต้องผันตามประเภทกิจการเหมือนที่ร้านเห็น (user report 2026-08-12) —
            // เดิมฝั่งนี้ hardcode "คำสั่งซื้อ" ทั้ง 3 ที่ (ข้อความลิงก์ Meta, altText/หัวการ์ด Flex,
            // ชื่อสำรองเมื่อบิลไม่มีรายการ) ร้านบริการจึงส่งคำว่า "คำสั่งซื้อ" ออกไปหาลูกค้าทุกใบ
            shop: { select: { vertical: true } },
          },
        });
        if (!order) {
          return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้ในร้าน" }, { status: 400 });
        }
        const orderVocab = resolveOrderVocab(order.shop.vertical);
        const base = (process.env.NEXT_PUBLIC_BUYER_URL || "https://deepthailand.app").replace(/\/+$/, "");
        const orderTitle = order.items[0]?.name ?? orderVocab.noun;
        const orderTotal = `฿${Number(order.totalAmount).toLocaleString("th-TH")}`;
        const orderUrl = `${base}/o/${orderRefToken}`;
        const linkText = `${orderVocab.noun}: ${orderTitle}\nยอดสุทธิ ${orderTotal}\n${orderUrl}`;
        // (2026-08-11) LINE ได้การ์ด Flex จริง — Messenger/IG ยังได้ลิงก์ข้อความเหมือนเดิมทุกประการ
        // (ไม่มีของเทียบฝั่ง Meta; MetaAdapter ปฏิเสธ part ชนิด flex ตั้งแต่ต้นทางถ้าเผลอส่งไป)
        // 🛑 uri action ของ LINE รับเฉพาะ https — dev ที่ base เป็น http จะโดน LINE ปฏิเสธทั้งข้อความ
        // จึงถอยไปใช้ข้อความลิงก์เดิม ดีกว่าส่งไม่ออกเลย
        const useFlex = conv.channel === "LINE" && orderUrl.startsWith("https://");
        const sent = await enqueueOutbound({
          conversationId: id,
          actorUserId: userId,
          text: linkText, // ยังต้องส่งเสมอ: เป็นทั้ง body ที่ร้านเห็นในประวัติ และทางถอยของช่องทางอื่น
          flex: useFlex
            ? buildLineFlexOrderCard({
                title: orderTitle,
                extraItemCount: Math.max(0, order._count.items - 1),
                totalText: orderTotal,
                url: orderUrl,
                // ห้ามให้ lib ตั้งคำเอง — คำมาจาก ORDER_VOCAB ที่เดียวทั้งระบบ (HR16)
                noun: orderVocab.noun,
                buttonLabel: orderVocab.viewLabel,
              })
            : undefined,
          orderRefToken: orderRefToken!, // ฝั่งเราเก็บเป็นการ์ด
        });
        // ยิงจริงเบื้องหลัง — ตัวการันตีคือตัวเก็บงานค้าง ไม่ใช่บรรทัดนี้ (ดูคำอธิบายเต็มที่เส้นทาง PRODUCT)
        after(deliverRoom(id, "after"));
        return NextResponse.json(await withSender(sent, userId), { status: 202 });
      }
      /**
       * รูปหลายใบ (E-12) — **หนึ่งรูป = หนึ่งแถวคิว** ไม่มีกริดของ Meta อีกแล้ว
       *
       * ที่มา: เส้นทางนี้เคยเรียก `sendOutboundImageGrid` (image_grid template ของ Meta) แต่ตัวมัน
       * ถูกลบทิ้งพร้อมงานนี้ (Ruling R-8) — และ **ไม่มีผู้เรียกฝั่งจอมาตั้งแต่ 2026-08-05 แล้ว**
       * (`useSellerChatThread` เลิกใช้กริดเพราะ Meta ครอปรูปจัตุรัสจนอ่านไม่ออก แล้วส่งทีละใบแทน)
       * ⇒ ไม่มีพฤติกรรมที่ผู้ใช้เห็นอยู่จริงถูกเปลี่ยนในรอบนี้
       *
       * `partialError` หายไปโดยตั้งใจ: ตอนตอบกลับยังไม่มีอะไรถูกยิงออกไป จึงไม่มีความล้มเหลวให้
       * รายงาน — สถานะย้ายไปอยู่ **รายแถว** (`deliveryStatus`/`failureReason` ของแต่ละใบ) แทน
       * สัญญาเดิมเรื่อง "ห้ามให้ client วนส่งใหม่ทั้งชุด" ยังอยู่ครบ เพราะทุกใบมีแถวของตัวเองใน DB
       * ตั้งแต่ก่อน response ออกไป
       *
       * caption (E-13) เป็น **แถว TEXT ของตัวเอง ต่อท้ายรูปทุกใบ** ไม่ใช่ `text` ที่แนบไปกับรูป:
       *  - เส้นทางเดิมของ Meta ส่ง caption เป็นข้อความตามหลังแบบ best-effort (`.catch(() => {})`)
       *    = ล้มแล้วหายเงียบ ไม่มีแถว ไม่มีใครรู้
       *  - เส้นทางเดิมของ LINE **ทิ้ง caption ทั้งดุ้น** (buildParts คืนเฉพาะ part ของไฟล์แนบ)
       * ลำดับ "รูปทั้งหมดก่อน แล้วข้อความปิดท้าย" ตรงกับที่ composer ทำอยู่แล้ว (user สั่ง 2026-07-23)
       */
      if (type === "IMAGE_GRID") {
        const ids = imageFileIds!;
        // แถวที่สร้างจริงทุกใบ เรียงตามลำดับรูปที่ผู้ขายแนบ — client เอาไปทับบับเบิลชั่วคราวใบต่อใบ
        const createdRows = [];
        /**
         * 🛑 (F-6) `finally` ไม่ใช่ของประดับ — มันคือด่านกันข้อความซ้ำ
         *
         * ใบที่ N โยน (fileId ไม่ผ่านด่านช่องทาง / DB สะดุด) ⇒ ใบที่ 1..N-1 **เป็นแถว `QUEUED`
         * ในฐานไปแล้ว** แต่ throw วิ่งข้ามบรรทัด `after(...)` ไปที่ `mapChatServiceError` ⇒ ไม่มี
         * ใครสั่งระบาย. ผู้ขายเห็น error แล้วกดส่งใหม่ทั้งชุด ระหว่างนั้นตัวกวาดมาเจอแถวกำพร้า
         * แล้วยิงออกไปให้ภายใน 1 นาที = **ลูกค้าได้รูปซ้ำ** โดยไม่มีอะไรฟ้องสักชั้น
         *
         * เงื่อนไข `createdRows.length > 0` สำคัญพอ ๆ กับตัว `finally`: ใบแรกโยน = ยังไม่มีแถวไหน
         * เกิด ⇒ ไม่มีอะไรให้ระบาย การเรียกทิ้งไว้คือการปลุก worker มาหาของที่ไม่มีอยู่
         * (เส้นทาง PRODUCT เขียนกฎเดียวกันนี้ด้วย `if (i === 0) throw e`)
         */
        try {
          for (const fileId of ids) {
            createdRows.push(
              await enqueueOutbound({
                conversationId: id,
                actorUserId: userId,
                attachment: { fileId, kind: "IMAGE", name: null, size: null },
              }),
            );
          }
          if (text?.trim()) {
            createdRows.push(
              await enqueueOutbound({ conversationId: id, actorUserId: userId, text }),
            );
          }
        } finally {
          // ยิงจริงเบื้องหลัง — ตัวการันตีคือตัวเก็บงานค้าง ไม่ใช่บรรทัดนี้ (ดูคำอธิบายเต็มที่เส้นทาง PRODUCT)
          if (createdRows.length > 0) after(deliverRoom(id, "after"));
        }
        const items = await Promise.all(createdRows.map((m) => withSender(m, userId)));
        return NextResponse.json({ ok: true, items }, { status: 202 });
      }

      /**
       * caption ของไฟล์แนบ (E-13) — แยกเป็นแถวคิวของตัวเองด้วยเหตุผลเดียวกับ IMAGE_GRID ข้างบน
       *
       * 🛑 ต้อง **ไม่** ส่ง `text` ไปกับแถวไฟล์แนบด้วย ไม่งั้น Meta จะได้ caption สองรอบ
       * (ตัวยิงส่งข้อความตามหลังไฟล์แนบให้เองอยู่แล้ว แล้วแถว TEXT ที่เราต่อท้ายจะยิงซ้ำอีกใบ)
       */
      const captionForAttachment = isAttachmentType(type) ? text?.trim() || null : null;
      const sent = await enqueueOutbound({
        conversationId: id,
        actorUserId: userId,
        // สติกเกอร์ (2026-08-04) — Meta ให้ส่ง sticker_id เดี่ยว ๆ ต่อข้อความ ไม่ปนกับ text/attachment
        sticker: type === "STICKER" ? { id: stickerId!, imageUrl: stickerImageUrl! } : undefined,
        text: type === "STICKER" || captionForAttachment !== null ? undefined : text ?? undefined,
        attachment: isAttachmentType(type)
          ? { fileId: imageUrl!, kind: type, name: attachmentName, size: attachmentSize ?? null }
          : undefined,
        replyToMid, // reply/quote — ส่ง reply_to:{mid} ให้ Meta (best-effort) + เก็บ quote ฝั่งเรา
      });
      /**
       * caption ไม่ผูก `replyToMid` — ของเดิมก็ยิงข้อความตามหลังด้วย `replyToExternalId: null`
       * (การตอบทับผูกกับไฟล์แนบซึ่งเป็นของหลัก ไม่ใช่กับ caption)
       *
       * 🛑 (F-6) อยู่ใน `try/finally` ด้วยเหตุผลเดียวกับ IMAGE_GRID: แถวไฟล์แนบ (`sent`) เกิดไป
       * แล้วก่อนบรรทัดนี้ ⇒ ต่อให้แถว caption โยน ก็ยัง **ต้องระบาย** ไม่งั้นไฟล์แนบกลายเป็นแถว
       * กำพร้าที่ตัวกวาดยิงออกไปทีหลัง ทับกับที่ผู้ขายกดส่งใหม่ = ลูกค้าได้ไฟล์ซ้ำ
       *
       * ไม่ต้องเช็คจำนวนแถวเหมือน IMAGE_GRID เพราะมาถึงบรรทัดนี้ได้แปลว่า `sent` สำเร็จไปแล้ว
       * เสมอ (ถ้ามันโยน เราไม่มีทางเข้ามาใน try ก้อนนี้)
       */
      try {
        if (captionForAttachment !== null) {
          await enqueueOutbound({ conversationId: id, actorUserId: userId, text: captionForAttachment });
        }
      } finally {
        // ยิงจริงเบื้องหลัง — ตัวการันตีคือตัวเก็บงานค้าง ไม่ใช่บรรทัดนี้ (ดูคำอธิบายเต็มที่เส้นทาง PRODUCT)
        after(deliverRoom(id, "after"));
      }
      return NextResponse.json(await withSender(sent, userId), { status: 202 });
    }

    if (type === "IMAGE_GRID") {
      // ถึงตรงนี้ = เธรด DEEP — กริดเป็นรูปแบบของ Meta ไม่มีในแชทของเราเอง
      return NextResponse.json({ error: "ส่งรูปหลายใบเป็นกริดได้เฉพาะแชท Facebook/Instagram" }, { status: 400 });
    }
    if (type === "STICKER") {
      // ถึงตรงนี้ = เธรด DEEP (ช่องทางนอกถูกจัดการไปแล้วด้านบน) — ยังไม่มีสติกเกอร์ในแชทของเราเอง
      return NextResponse.json(
        { error: "ส่งสติกเกอร์ได้เฉพาะแชท Facebook/Instagram" },
        { status: 400 },
      );
    }

    /**
     * เธรด DEEP + การ์ดสินค้าหลายชิ้น (ส่วนขยาย 2026-08-11)
     *
     * 🛑 แอปผู้ซื้อวาดการ์ดจาก `productCard` ซึ่งเป็น **ใบเดียว** (ดู `productCardsPerMessage` ที่ตั้ง
     * DEEP = 1) — จึงส่งเป็นข้อความละใบ ลูกค้าได้ครบทุกชิ้นแน่นอน ไม่ใช่ได้ใบแรกใบเดียวแล้วที่เหลือ
     * หายเงียบ. หน้าจอบอกผู้ขายไว้ก่อนกดส่งแล้วว่าจะกลายเป็นกี่ข้อความ (ป้ายตัวเดียวกับช่องทางอื่น)
     *
     * ส่งเรียงทีละใบ ไม่ Promise.all — ลำดับในเธรดต้องตรงกับที่ผู้ขายเลือก
     */
    if (type === "PRODUCT" && productRows.length > 1) {
      let lastDeep: Awaited<ReturnType<typeof sendMessage>> | null = null;
      for (const row of productRows) {
        lastDeep = await sendMessage({
          conversationId: id,
          senderUserId: userId,
          senderRole,
          type,
          body: null,
          imageUrl: null,
          attachmentName: null,
          attachmentSize: null,
          productRefId: row.id,
          orderRefToken: null,
          replyToMid,
        });
      }
      return NextResponse.json(await withSender(lastDeep!, userId));
    }

    /**
     * 🛑 APPOINTMENT ถูกแปลงเป็น `ORDER` ตรงนี้ — ฐานข้อมูล **ไม่มีค่า enum ใหม่และไม่มี migration**
     *
     * `type` ที่รับมาคือ "ผู้เรียกอยากให้ประกอบอะไร" ส่วน `ChatMessage.type` คือ "ของที่เก็บคือชนิดไหน"
     * สองอันนี้ไม่จำเป็นต้องเท่ากัน (precedent: `IMAGE_GRID` ก็ไม่มีในตาราง) — ผลคือการ์ดสรุปนัด
     * ใช้ตัวเรนเดอร์ `OrderCardBubble` เดิมทั้งฝั่งร้านและแอปผู้ซื้อ ซึ่งแสดงวันนัด/มัดจำได้อยู่แล้ว
     * ตั้งแต่ 00024 และประวัติเก่าไม่แตกเป็นสองสายให้ต้อง render คนละทางตลอดไป
     */
    const storedType = type === "APPOINTMENT" ? "ORDER" : type;

    const message = await sendMessage({
      conversationId: id,
      senderUserId: userId,
      senderRole,
      type: storedType,
      // TEXT = ข้อความหลัก, ไฟล์แนบ = caption, PRODUCT/ORDER = null
      // APPOINTMENT เก็บข้อความสรุปไว้ใน body ทั้งที่บับเบิลวาดจากการ์ด — เพราะนั่นคือสิ่งที่
      // ทำให้ร้าน **ค้นหาเจอในประวัติ** และเป็นสิ่งที่ preview ในรายการแชทหยิบไปใช้
      // (ตัวเรนเดอร์แตกที่ `m.type === 'ORDER'` ก่อนเสมอ จึงไม่มีทางขึ้นซ้อนเป็นข้อความอีกใบ)
      body:
        type === "APPOINTMENT"
          ? (appointmentSummary?.text ?? null)
          : storedType === "PRODUCT" || storedType === "ORDER"
            ? null
            : (text ?? null),
      imageUrl: isAttachmentType(storedType) ? imageUrl ?? null : null,
      attachmentName: isAttachmentType(storedType) ? attachmentName : null,
      attachmentSize: isAttachmentType(storedType) ? attachmentSize ?? null : null,
      productRefId: storedType === "PRODUCT" ? (productRows[0]?.id ?? productRefId ?? null) : null,
      orderRefToken: storedType === "ORDER" ? orderRefToken ?? null : null,
      // เก็บเป็น type='ORDER' เหมือนกัน แต่คนละของในสายตาผู้ขาย (preview + body ต่างกัน)
      isAppointmentCard: type === "APPOINTMENT",
      replyToMid, // reply/quote (DEEP) — id ของข้อความที่ตอบทับ
    });

    // Push เข้าแอปผู้ขาย เมื่อ "ผู้ซื้อ" เป็นคนส่ง (แชท DEEP ในแอป/เว็บผู้ซื้อ)
    //
    // hook ที่ route ไม่ใช่ใน chat.service.sendMessage โดยตั้งใจ: seller-push.service import
    // getConversationToastPreview จาก chat.service อยู่แล้ว ถ้าให้ chat.service เรียกกลับมาก็จะ
    // เป็น circular import ทันที — route เป็นชั้นบนสุด จึงเรียกได้ทางเดียวไม่มีวงกลม
    //
    // ต้องอ่าน shopId ของเธรดเอง (sendMessage คืน ChatMessageView ซึ่งไม่มี shopId) — query เล็ก
    // และอยู่หลังจากงานหลักสำเร็จแล้ว. void + service กลืน error เอง = ส่งไม่ได้ก็ไม่ทำให้การส่ง
    // ข้อความล้มตาม (ข้อความถูกบันทึกไปแล้วตอนนี้)
    if (senderRole === "BUYER") {
      void prisma.conversation
        .findUnique({ where: { id }, select: { shopId: true } })
        .then((c) => (c ? pushNewChatMessage({ shopId: c.shopId, conversationId: id }) : undefined))
        .catch(() => {});
    }

    return NextResponse.json(await withSender(message, userId));
  } catch (e: unknown) {
    return mapChatServiceError(e, "POST /api/chat/conversations/[id]/messages");
  }
}
