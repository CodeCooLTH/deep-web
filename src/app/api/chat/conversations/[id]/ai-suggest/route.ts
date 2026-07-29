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
  type SuggestMedia,
} from "@/lib/gemini";
import { getFile } from "@/lib/storage";
import { EXT_TO_MIME } from "@/lib/attachment-mime";
import { getAiSetting, getEffectiveAiSetting } from "@/services/ai-setting.service";
import { AiSuggestRequestSchema } from "@/lib/validations";
import {
  resolveProductCards,
  buildProductBlock,
  buildCustomerBlock,
  composeContextBlock,
} from "@/services/ai-context.service";
import { getConversationCrm } from "@/services/chat-crm.service";
// feature 00019 ext (2026-07-29) — โควตาฟรีรายวัน + credit path + unlimited path (paid plan)
import {
  isOwnerPaidPlan,
  claimFreeUsageOrFail,
  refundFreeUsage,
  getFreeRemainingAfterClaim,
  logUsageEvent,
  refundUsageEvent,
} from "@/services/ai-suggest-quota.service";
import { AI_SUGGEST_EXTRA_USE_PRICE_BAHT, WALLET_REASON_AI_SUGGEST } from "@/lib/ai-suggest-limit";
import { deductCredit, creditWallet, getBalance } from "@/services/wallet.service";

// feature 00018 composer improvement #3 — AI ช่วยร่างคำตอบ (Gemini)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const IdParamSchema = v.pipe(v.string(), v.uuid());
const RECENT_LIMIT = 15;

// AI call มีต้นทุน — จำกัดต่อผู้ใช้ (แยกจาก global per-IP ของ proxy.ts) กันกดรัว
const AI_RATE_LIMIT_MAX = 15;
const AI_RATE_LIMIT_WINDOW_MS = 60_000;

// ── ไฟล์แนบเข้า AI (feature 00019 ext, user request 2026-07-24) ────────────────
// Gemini จำกัด inline ทั้ง request ที่ 20MB (ตรวจกับ ai.google.dev 2026-07-24) — คุมงบให้ต่ำกว่ามาก
// เพราะ base64 พองขึ้น ~33% และยังมี prompt/บริบทอื่นในก้อนเดียวกัน + ยิ่งใหญ่ยิ่งช้า/แพง
const MEDIA_TOTAL_BUDGET_BYTES = 8 * 1024 * 1024; // งบรวมของไฟล์ดิบก่อน base64
const MEDIA_PER_FILE_MAX_BYTES = 4 * 1024 * 1024; // ไฟล์เดี่ยวใหญ่กว่านี้ข้าม (mirror รับได้ถึง 25MB)
const MEDIA_MAX_COUNT = 5; // เอาเฉพาะไฟล์ล่าสุด — บทสนทนายาวไม่ต้องส่งทั้งหมด

// ชนิดที่ Gemini รับ inline ได้จริง (ai.google.dev 2026-07-24) — นอกลิสต์นี้ข้ามไป ไม่ต้องเสีย
// bandwidth ยิงไปให้ถูกปฏิเสธ. หมายเหตุ: ข้อความเสียง Messenger เป็น Opus ที่เราเก็บเป็น .ogg
// (audio/ogg) ซึ่งอยู่ในลิสต์ที่รองรับ — ถ้า Gemini ปฏิเสธ ogg-opus จริง จะ fail-soft (ดู catch)
const GEMINI_INLINE_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif",
  "audio/wav", "audio/mp3", "audio/mpeg", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac",
]);

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
    // feature 00019: ต้องได้ buyerUserId/externalContactId ไปหา Customer ที่ผูกกับเธรด (TFR-005)
    select: { id: true, buyerUserId: true, externalContactId: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  }

  // shopId/conversationId แบบ narrowed เป็น const แยก — กันปัญหา TS ไม่ narrow ตัวแปร outer (activeCtx/
  // conversation) ที่ถูก closure ด้านล่าง (refundUsage) จับไปใช้ (TS จำกัด narrowing ข้าม nested function)
  const shopId = activeCtx.shopId;
  const conversationId = conversation.id;

  // ── feature 00019 ext (2026-07-29) — โควตาฟรีรายวัน + credit path + unlimited path ────────────
  // BR-AIQ-12 ลำดับบังคับ: rate-limit (บนสุด, เดิม) → ownership เธรด (บนสุด, เดิม) → เช็ค paid-plan
  // ก่อนเสมอ → paid=true ข้ามไปเรียก Gemini ทันที (unlimited path, ไม่แตะ counter/เครดิตเลย) →
  // paid=false ค่อยเข้า free/credit path — ต้องเช็คก่อนงานหนักอื่น (context/media) กันเปลืองถ้าจะบล็อก
  // body ผ่าน Valibot ตาม convention backend — body ว่าง/ไม่ใช่ JSON ถือว่าไม่ยืนยันหักเครดิต
  // (endpoint นี้เดิมไม่มี body เลย client เก่าที่ไม่ส่งอะไรมาต้องยังทำงานได้ ไม่ 400)
  const rawBody = await request.json().catch(() => ({}));
  const parsedBody = v.safeParse(AiSuggestRequestSchema, rawBody ?? {});
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const confirmUseCredit = parsedBody.output.confirmUseCredit;

  let isPaidPlan: boolean;
  try {
    isPaidPlan = await isOwnerPaidPlan(shopId);
  } catch (e) {
    // FR-AIQ-08: query สถานะ paid plan พังต้อง fail-closed — ห้าม default เป็น unlimited
    console.error("[ai-suggest] isOwnerPaidPlan failed — fail-closed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }

  // usageKind ตัดสินว่าถ้า Gemini ล้มเหลวจริงต้องคืนอะไร (BR-AIQ-06/07) — UNLIMITED_PLAN ไม่มีอะไรต้องคืน
  let usageKind: "FREE" | "CREDIT" | "UNLIMITED_PLAN" = "UNLIMITED_PLAN";
  let usedCredit = false;
  let freeRemaining: number | null = null;

  if (!isPaidPlan) {
    let claimed: boolean;
    try {
      claimed = await claimFreeUsageOrFail(shopId);
    } catch (e) {
      // FR-AIQ-08: query/update ตัวนับโควตาพัง ต้อง fail-closed เช่นกัน (ไม่ปล่อยผ่านฟรีแบบไม่จำกัด)
      console.error("[ai-suggest] claimFreeUsageOrFail failed — fail-closed", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
    }

    if (claimed) {
      usageKind = "FREE";
      try {
        freeRemaining = await getFreeRemainingAfterClaim(shopId);
      } catch (e) {
        // freeRemaining เป็นแค่ตัวเลขเสริมใน response (UX) — อ่านไม่ได้ไม่ควรทำให้ทั้ง request พัง
        console.error("[ai-suggest] getFreeRemainingAfterClaim failed", e instanceof Error ? e.message : e);
        freeRemaining = 0;
      }
    } else if (!confirmUseCredit) {
      // ครบโควตาฟรีแล้วและยังไม่ได้ confirm ใช้เครดิต (FR-AIQ-03/04) — บล็อกก่อนเรียก Gemini
      const balance = await getBalance(shopId).catch(() => 0);
      return NextResponse.json(
        {
          error: "QUOTA_EXCEEDED",
          canUseCredit: balance >= AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
          priceBaht: AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
          freeRemaining: 0,
        },
        { status: 402 },
      );
    } else {
      // credit path — ผู้ใช้กด "ยืนยัน" มาแล้ว (FR-AIQ-04) หักเครดิต ฿1 ก่อนเรียก Gemini
      try {
        await deductCredit(
          shopId,
          AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
          conversationId,
          "ใช้เครดิตขอร่างคำตอบ AI เพิ่มหลังครบโควตาฟรีวันนี้",
          WALLET_REASON_AI_SUGGEST.AI_SUGGEST_EXTRA_USE,
        );
      } catch (e) {
        if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
          const balance = await getBalance(shopId).catch(() => 0);
          return NextResponse.json(
            { error: "INSUFFICIENT_CREDIT", priceBaht: AI_SUGGEST_EXTRA_USE_PRICE_BAHT, balance },
            { status: 402 },
          );
        }
        console.error("[ai-suggest] deductCredit failed — fail-closed", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
      }
      usageKind = "CREDIT";
      usedCredit = true;
      freeRemaining = 0;
    }
  }

  /** คืนสิทธิ์ที่ใช้ไป เมื่อ Gemini ล้มเหลวจริง (BR-AIQ-06/07) — unlimited path ไม่มีอะไรต้องคืน
   *  best-effort compensate (มิเรอร์ AR-1 ของ send-sms/route.ts): ห้ามให้ compensate ล้มเหลวซ้อน
   *  error หลักที่กำลังจะตอบผู้ใช้อยู่แล้ว — log ไว้สำหรับ manual reconcile แทน */
  async function refundUsage() {
    if (usageKind === "UNLIMITED_PLAN") return;
    try {
      if (usageKind === "FREE") {
        await refundFreeUsage(shopId);
      } else {
        await creditWallet(
          shopId,
          AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
          conversationId,
          "คืนเครดิตขอร่างคำตอบ AI (Gemini ไม่สำเร็จ)",
          WALLET_REASON_AI_SUGGEST.AI_SUGGEST_EXTRA_USE,
        );
      }
      await refundUsageEvent(shopId, conversationId, usageKind);
    } catch (e) {
      console.error("[ai-suggest] refund compensate failed — manual reconcile needed", e instanceof Error ? e.message : e);
    }
  }

  const shop = await prisma.shop.findUnique({
    where: { id: activeCtx.shopId },
    select: { shopName: true, vertical: true },
  });
  const rawVertical = shop?.vertical ?? "";
  const vertical = isShopVertical(rawVertical) ? rawVertical : DEFAULT_SHOP_VERTICAL;

  // CRM (feature 00018) — โน้ต/ชื่อที่แอดมินจดไว้ ให้ AI ใช้ประกอบการร่าง (ตอบตรงคน/บริบทมากขึ้น)
  const crm = await getConversationCrm(conversation.id, activeCtx.shopId);
  const customerName = crm?.alias ?? crm?.realName ?? null;

  // ข้อความล่าสุด (ใหม่→เก่า) แล้ว reverse ให้เป็นเก่า→ใหม่สำหรับ transcript
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    // feature 00019: productRefId ใช้แปลงการ์ดสินค้าเป็นชื่อ+ราคาจริง (TFR-003)
    // imageUrl (= storage fileId ของ IMAGE/AUDIO/VIDEO/FILE): ใช้ดึงไฟล์จริงส่งให้ AI ดู/ฟัง (00019 ext)
    select: { senderRole: true, type: true, body: true, productRefId: true, imageUrl: true },
  });
  const ordered = rows.reverse();

  // feature 00019 — การตั้งค่า AI ของร้าน (fail-soft: อ่านไม่ได้ = ใช้ค่าเริ่มต้น, TFR-009/AC-010-03)
  // feature 00019 ext (2026-07-29) FR-AIQ-10/BR-AIQ-13/14: บังคับสิทธิ์บริบทจริงตาม isPaidPlan ที่ชั้นนี้
  // — ค่าที่เก็บใน DB (storedAiSetting) ไม่ถูกแตะ/เขียนทับเด็ดขาด แค่ไม่ใช้ตอนประกอบ prompt ถ้า non-paid
  const storedAiSetting = await getAiSetting(activeCtx.shopId);
  const aiSetting = getEffectiveAiSetting(storedAiSetting, isPaidPlan);

  // การ์ดสินค้า → ชื่อ+ราคาจริง (TFR-003) — batch query ครั้งเดียว ไม่ N+1
  // ปิดบริบทสินค้า = คงข้อความ placeholder เดิมทุกประการ (AC-004-03)
  let productCards = new Map<string, { name: string; price: string; isActive: boolean }>();
  if (aiSetting.includeProductContext) {
    try {
      productCards = await resolveProductCards(
        activeCtx.shopId,
        ordered.map((m) => m.productRefId).filter((id): id is string => id !== null),
      );
    } catch (e) {
      console.error("[ai-suggest] resolveProductCards failed", e instanceof Error ? e.message : e);
    }
  }

  const turns: SuggestTurn[] = ordered
    .map((m) => {
      const role: "BUYER" | "SHOP" = m.senderRole === "SHOP" ? "SHOP" : "BUYER";
      // placeholder ข้อความสำหรับ transcript — ไฟล์จริงส่งแยกเป็น inline media (ถ้าเปิดสวิตช์)
      let text = m.body ?? "";
      if (m.type === "IMAGE") text = m.body ? `[รูปภาพ] ${m.body}` : "[ส่งรูปภาพ]";
      else if (m.type === "AUDIO") text = m.body ? `[ข้อความเสียง] ${m.body}` : "[ส่งข้อความเสียง]";
      else if (m.type === "PRODUCT") {
        const card = m.productRefId ? productCards.get(m.productRefId) : undefined;
        if (card) {
          const state = card.isActive ? "เปิดขาย" : "ปิดขายแล้ว";
          text = `[ส่งการ์ดสินค้า: ${card.name} — ${card.price} บาท (${state})]`;
        } else if (aiSetting.includeProductContext && m.productRefId) {
          // หาไม่เจอ = สินค้าถูกลบ — ต้องไม่ throw และต้องบอก AI ตรง ๆ ว่าอ้างอิงราคาไม่ได้ (AC-004-02)
          text = "[ส่งการ์ดสินค้า: สินค้าถูกลบแล้ว]";
        } else {
          text = "[ส่งการ์ดสินค้า]";
        }
      }
      return { role, text: text.trim() };
    })
    .filter((t) => t.text.length > 0);

  if (turns.length === 0) {
    return NextResponse.json({ error: "ยังไม่มีข้อความให้ AI ช่วยร่าง" }, { status: 400 });
  }

  // feature 00019 — บริบทสินค้า/ลูกค้า ดึงแบบขนานและ fail-soft ทีละก้อน (TFR-009):
  // ก้อนใดล้มเหลวต้องไม่ทำให้ทั้งคำขอพัง แค่ขาดบริบทก้อนนั้นไป (AC-010-01/02)
  const buyerTexts = turns.filter((t) => t.role === "BUYER").slice(-3).map((t) => t.text);
  const [productResult, customerResult] = await Promise.allSettled([
    aiSetting.includeProductContext ? buildProductBlock(activeCtx.shopId, buyerTexts) : Promise.resolve(""),
    aiSetting.includeCustomerContext
      ? buildCustomerBlock(activeCtx.shopId, {
          buyerUserId: conversation.buyerUserId,
          externalContactId: conversation.externalContactId,
        })
      : Promise.resolve(""),
  ]);
  if (productResult.status === "rejected") {
    console.error("[ai-suggest] buildProductBlock failed", productResult.reason);
  }
  if (customerResult.status === "rejected") {
    console.error("[ai-suggest] buildCustomerBlock failed", customerResult.reason);
  }
  const contextBlock = composeContextBlock(
    productResult.status === "fulfilled" ? productResult.value : "",
    customerResult.status === "fulfilled" ? customerResult.value : "",
  );

  // ── ไฟล์แนบเข้า AI (feature 00019 ext, user request 2026-07-24) ──────────────
  // ดึงรูป/เสียงจริงจาก storage ส่งให้ Gemini อ่าน/ถอดเสียง แทนที่จะเห็นแค่ "[ส่งรูปภาพ]"
  // เปิด/ปิดต่อร้านด้วย includeMediaContext (สวิตช์ในหน้าตั้งค่า AI) — ปิด = พฤติกรรมเดิมทุกประการ
  // เอาเฉพาะไฟล์ "ล่าสุด" ก่อน (reverse) เพราะบริบทที่สำคัญคือของใหม่ แล้วค่อยเรียงกลับตามบทสนทนา
  const media: SuggestMedia[] = [];
  if (aiSetting.includeMediaContext) {
    let budget = MEDIA_TOTAL_BUDGET_BYTES;
    const picked: { idx: number; item: SuggestMedia }[] = [];
    for (let i = ordered.length - 1; i >= 0 && picked.length < MEDIA_MAX_COUNT; i--) {
      const m = ordered[i]!;
      if ((m.type !== "IMAGE" && m.type !== "AUDIO") || !m.imageUrl) continue;
      try {
        const file = await getFile(m.imageUrl);
        if (!file) continue;
        const mime = EXT_TO_MIME[file.ext.toLowerCase()];
        if (!mime || !GEMINI_INLINE_MIME.has(mime)) continue;
        if (file.buffer.byteLength > MEDIA_PER_FILE_MAX_BYTES || file.buffer.byteLength > budget) continue;
        budget -= file.buffer.byteLength;
        const who = m.senderRole === "SHOP" ? "ร้าน" : "ลูกค้า";
        const kind = m.type === "IMAGE" ? "รูปภาพ" : "ข้อความเสียง";
        picked.push({
          idx: i,
          item: {
            label: `${kind}ที่${who}ส่ง (ข้อความลำดับที่ ${i + 1} ในบทสนทนาด้านบน)`,
            mimeType: mime,
            dataBase64: file.buffer.toString("base64"),
          },
        });
      } catch (e) {
        // อ่านไฟล์ไม่ได้ (ถูกลบ/storage ล่ม) — ข้ามไฟล์นั้น ไม่ทำให้ทั้งคำขอพัง (fail-soft TFR-009)
        console.error("[ai-suggest] read media failed", e instanceof Error ? e.message : e);
      }
    }
    // เรียงกลับตามลำดับบทสนทนา (เก่า→ใหม่) ให้ label ที่อ้าง "ลำดับที่ N" ตรงกับที่โมเดลเห็น
    picked.sort((a, b) => a.idx - b.idx);
    media.push(...picked.map((p) => p.item));
  }

  try {
    const suggestions = await generateReplySuggestions(turns, {
      shopName: shop?.shopName ?? "ร้านค้า",
      vertical,
      instruction: aiSetting.instruction,
      contextBlock,
      customerName,
      customerNote: crm?.note ?? null,
    }, media);
    // NFR-AIQ-Obs: audit log ทุก path ที่ผ่าน gate สำเร็จ — best-effort, ไม่ทำให้ response หลักพัง
    await logUsageEvent({
      shopId: activeCtx.shopId,
      conversationId: conversation.id,
      kind: usageKind,
      amountBaht: usedCredit ? AI_SUGGEST_EXTRA_USE_PRICE_BAHT : 0,
    });
    return NextResponse.json({ suggestions, usedCredit, freeRemaining }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof GeminiNotConfiguredError) {
      // BR-AIQ-06/07: Gemini ล้มเหลวจริง (แม้เพราะยังไม่ตั้งค่า) ต้องคืนสิทธิ์ที่ใช้ไป — unlimited path ไม่มีอะไรคืน
      await refundUsage();
      return NextResponse.json({ error: "ระบบ AI ยังไม่พร้อมใช้งาน (ยังไม่ตั้งค่า)" }, { status: 503 });
    }
    if (e instanceof GeminiApiError) {
      console.error("[ai-suggest] gemini:", e.message);
      // fail-soft ไฟล์แนบ (00019 ext): ถ้าพลาดตอนที่ "มีไฟล์แนบ" ให้ลองใหม่แบบข้อความล้วนก่อนยอมแพ้
      // — ครอบเคสที่ Gemini ไม่รับไฟล์บางชนิด (เช่น ogg-opus ของข้อความเสียง Messenger) หรือ
      // request ใหญ่/ช้าเกิน ผู้ใช้ควรได้ร่างคำตอบจากข้อความอยู่ดี ดีกว่าเห็น error เปล่า ๆ
      if (media.length > 0) {
        try {
          const suggestions = await generateReplySuggestions(turns, {
            shopName: shop?.shopName ?? "ร้านค้า",
            vertical,
            instruction: aiSetting.instruction,
            contextBlock,
            customerName,
            customerNote: crm?.note ?? null,
          });
          console.warn("[ai-suggest] ถอยไปโหมดข้อความล้วน (ไฟล์แนบใช้ไม่ได้)");
          // BR-AIQ-08: mediaSkipped:true = "สำเร็จ" เสมอ — ห้ามคืนโควตา/เครดิต แม้ไม่ได้ใช้ไฟล์แนบจริง
          await logUsageEvent({
            shopId: activeCtx.shopId,
            conversationId: conversation.id,
            kind: usageKind,
            amountBaht: usedCredit ? AI_SUGGEST_EXTRA_USE_PRICE_BAHT : 0,
          });
          return NextResponse.json({ suggestions, mediaSkipped: true, usedCredit, freeRemaining }, { headers: NO_STORE_HEADERS });
        } catch (retryErr) {
          console.error("[ai-suggest] retry ไม่มีไฟล์แนบก็ยังพลาด", retryErr instanceof Error ? retryErr.message : retryErr);
        }
      }
      // ล้มเหลวจริง (ทุกโมเดล/ไม่มี fallback สำเร็จ) — คืนสิทธิ์ที่ใช้ไป (BR-AIQ-06/07)
      await refundUsage();
      // detail: surface สาเหตุจริงจาก Gemini ชั่วคราวเพื่อ diagnose (ไม่มี secret — ดู comment ใน gemini.ts)
      return NextResponse.json(
        { error: "AI ไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง", detail: e.message },
        { status: 502 },
      );
    }
    console.error("[POST /api/chat/conversations/[id]/ai-suggest]", e instanceof Error ? e.message : e);
    // error อื่นที่ไม่คาดคิด (500) — ก็ถือเป็นความล้มเหลวจริงเช่นกัน ต้องคืนสิทธิ์เหมือนกัน (BR-AIQ-06/07)
    await refundUsage();
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
