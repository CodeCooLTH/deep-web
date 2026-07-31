import { NextRequest, NextResponse, after } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateConversation,
  listConversationsForShop,
  listConversationsForBuyer,
  countUnreadByConversation,
  type ConversationSummary,
} from "@/services/chat.service";
import { enrichWithOrderStage } from "@/services/order-stage.service";
import { StartConversationSchema, ChatConversationsQuerySchema } from "@/lib/validations";
import { sweepStuckJobs } from "@/services/auto-reply.service";

// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) เก็บ/serve ทับข้าม user
// (บทเรียนโปรเจกต์ 2026-07-04: default header เป็น public ทำให้ carrier cache ข้าม user)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * B1 (route enrich, UX-Design-Spec.md resolved decision): GET /conversations เพิ่ม field เสริม
 * `counterparty` ต่อรายการ — ไม่แตะ chat.service signature (FROZEN CONTRACT, SDS §5) เพราะ
 * ConversationSummary ไม่มี shopName/buyer identity แต่ UI (inbox list) ต้องแสดง avatar+ชื่อคู่สนทนา
 *
 * buyer role (main subdomain) → เห็น shop { shopName, logo }
 * seller role (seller subdomain) → เห็น buyer { displayName, avatar }
 * ไม่พบ counterparty (แถวกำพร้า) → null (defensive — UI ต้อง handle fallback)
 */
type ConversationWithCounterparty = ConversationSummary & {
  counterparty:
    | { shopName: string; logo: string | null; username: string }
    | { displayName: string; avatar: string | null }
    | null;
  // feature 00018 CRM — tag + สถานะการขายของผู้ติดต่อ (external) เพื่อโชว์ badge ใน InboxList
  contactTags: string[];
  contactSalesStatus: string;
};

async function enrichWithShopCounterparty(
  items: ConversationSummary[],
): Promise<ConversationWithCounterparty[]> {
  const shopIds = [...new Set(items.map((i) => i.shopId))];
  const shops = await prisma.shop.findMany({
    where: { id: { in: shopIds } },
    // S-20 (extension #1 Chat Product Context Card): username เพิ่มเพื่อลิงก์ "ดูสินค้า" ใน BuyerChatWidget
    // (ChatThread ต้องการ shopUsername prop — reuse เดียวกันกับหน้า /messages/[shopId])
    select: { id: true, shopName: true, logo: true, user: { select: { username: true } } },
  });
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  return items.map((i) => {
    const shop = shopMap.get(i.shopId);
    return {
      ...i,
      counterparty: shop ? { shopName: shop.shopName, logo: shop.logo, username: shop.user.username } : null,
      // buyer branch (main subdomain) ไม่มี external contact → ไม่มี tag/สถานะขาย
      contactTags: [],
      contactSalesStatus: 'UNSPECIFIED',
    };
  });
}

async function enrichWithBuyerCounterparty(
  items: ConversationSummary[],
): Promise<ConversationWithCounterparty[]> {
  // เธรดช่องทางนอก (feature 00018) buyerUserId เป็น null → กรองออกก่อน query
  const buyerIds = [...new Set(items.map((i) => i.buyerUserId).filter((id): id is string => id !== null))];
  const users = await prisma.user.findMany({
    where: { id: { in: buyerIds } },
    select: { id: true, displayName: true, avatar: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // bug fix (Chat Rail แสดง "ผู้ติดต่อ" ทุกแถว): เดิม enrich เฉพาะ buyerUserId (User ในระบบ) —
  // เธรดช่องทางนอก (feature 00018, buyerUserId เป็น null เสมอ) ได้ counterparty: null ทุกแถว
  // ต้อง enrich จาก ExternalContact ด้วยเช่นเดียวกับ inbox/page.tsx (ต้นแบบ) — batch query กัน N+1
  // เดียวกัน — allow-list id/name/avatarUrl/tags/salesStatus (avatarUrl: IG มี profile_pic จริง,
  // Messenger null → BuyerAvatar ตกไป initials เอง)
  const externalContactIds = [
    ...new Set(items.map((i) => i.externalContactId).filter((id): id is string => id !== null)),
  ];
  const contacts =
    externalContactIds.length > 0
      ? await prisma.externalContact.findMany({
          where: { id: { in: externalContactIds } },
          select: { id: true, name: true, avatarUrl: true, tags: true, salesStatus: true },
        })
      : [];
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  return items.map((i) => {
    const buyer = i.buyerUserId ? userMap.get(i.buyerUserId) : undefined;
    const contact = i.externalContactId ? contactMap.get(i.externalContactId) : undefined;
    const counterparty = buyer
      ? { displayName: buyer.displayName, avatar: buyer.avatar }
      : contact
        ? { displayName: contact.name ?? 'ผู้ติดต่อ', avatar: contact.avatarUrl ?? null }
        : null;
    return {
      ...i,
      counterparty,
      contactTags: contact?.tags ?? [],
      contactSalesStatus: contact?.salesStatus ?? 'UNSPECIFIED',
    };
  });
}


/**
 * POST /api/chat/conversations — เริ่ม/เปิดบทสนทนาที่มีอยู่แล้ว โดย shopId (buyer surface เท่านั้น)
 *
 * ทำไม buyerUserId derive จาก session เท่านั้น (ไม่รับจาก client body):
 * SRS §10 Authorization Matrix — ห้าม client ปลอมตัวเป็น buyer คนอื่น. session.user.id
 * เป็น single source of truth เดียวกับ pattern inventory/subscribe (API.md §4.1)
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  // 2. parse body ด้วย Valibot
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = v.safeParse(StartConversationSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // 3. เรียก service — idempotent (มีอยู่แล้วคืนแถวเดิม, race handled ใน service)
  try {
    const conversation = await getOrCreateConversation(userId, parsed.output.shopId);
    return NextResponse.json(conversation);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "SHOP_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
    }
    console.error("[POST /api/chat/conversations]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/**
 * GET /api/chat/conversations — inbox list, role กำหนดจาก subdomain (SDS §3.3)
 * seller.* → ร้านที่ active จริงของ session user (bug fix แชทไม่แยกตามร้าน — เดิมใช้
 * getShopByUserId ซึ่งคืน PERSONAL เสมอ ไม่สนว่ากำลัง active ร้านไหนอยู่ — ดู resolveActiveShopContext)
 * main → buyer inbox ของ session user
 */
export async function GET(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  // 2. parse query params ด้วย Valibot (searchParams ไม่ใช่ JSON body — manual parse)
  const { searchParams } = request.nextUrl;
  const rawTake = searchParams.get("take");
  const input = {
    cursor: searchParams.get("cursor") ?? undefined,
    take: rawTake === null ? undefined : Number(rawTake),
    // T1 (feature 00018): filter/ค้นหาฝั่ง seller เท่านั้น — buyer branch ไม่ใช้ field พวกนี้
    channel: searchParams.get("channel") ?? undefined,
    shopChannelId: searchParams.get("shopChannelId") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    // S-7 (ตัวกรองแชท): status/customerLinked เป็น picklist string; hidden เป็น query string
    // "true"/"false" → แปลงเป็น boolean ก่อน valibot (query param ไม่มี type boolean เอง)
    status: searchParams.get("status") ?? undefined,
    customerLinked: searchParams.get("customerLinked") ?? undefined,
    hidden: searchParams.get("hidden") === "true" ? true : undefined,
    // feature 00018: กรองแท็บกลุ่ม + อ่านแล้ว/ยังไม่อ่าน
    chatGroupId: searchParams.get("chatGroupId") ?? undefined,
    readState: searchParams.get("readState") ?? undefined,
    spam: searchParams.get("spam") === "true" ? true : undefined,
    // tags: ส่งมาเป็น CSV (?tags=VIP,ค้างชำระ) — แยกแล้วตัดค่าว่างทิ้ง; ไม่มี = undefined ไม่ใช่ []
    // เพราะ [] จะถูกตีความว่า "กรองด้วยแท็กแต่ไม่เลือกอะไรเลย" ซึ่งไม่ใช่เจตนา
    tags: searchParams.get("tags")
      ? searchParams.get("tags")!.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined,
    shipment: searchParams.get("shipment") ?? undefined,
  };
  const parsed = v.safeParse(ChatConversationsQuerySchema, input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 3. role branch ตาม subdomain — ไม่รับ role/shopId จาก client
  const host = request.headers.get("host") || "";
  const subdomain = getSubdomain(host);

  if (subdomain === "seller") {
    // bug fix: resolve ร้านที่ active จริง — ห้าม fallback เงียบ ๆ ไป PERSONAL (นั่นคือบั๊กเดิม)
    const activeCtx = await resolveActiveShopContext({
      user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
    });
    if (!activeCtx) {
      return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
    }
    const result = await listConversationsForShop(activeCtx.shopId, {
      cursor: parsed.output.cursor,
      take: parsed.output.take,
      channel: parsed.output.channel,
      shopChannelId: parsed.output.shopChannelId,
      q: parsed.output.q,
      status: parsed.output.status,
      customerLinked: parsed.output.customerLinked,
      hidden: parsed.output.hidden,
      chatGroupId: parsed.output.chatGroupId,
      readState: parsed.output.readState,
      spam: parsed.output.spam,
      tags: parsed.output.tags,
      shipment: parsed.output.shipment,
    });
    // B1: seller เห็น counterparty = buyer identity
    const enriched = await enrichWithBuyerCounterparty(result.items);
    // unreadCount — badge ตัวเลข "จำนวนข้อความที่ยังไม่ได้อ่าน" ใน inbox list (user request 2026-07-23)
    // enrichment แยกเหมือน counterparty ไม่แตะ ConversationSummary (FROZEN CONTRACT)
    const unreadMap = await countUnreadByConversation(enriched.map((i) => i.id));
    const withUnread = enriched.map((i) => ({ ...i, unreadCount: unreadMap.get(i.id) ?? 0 }));
    // ป้ายขั้นตอนออเดอร์ล่าสุดในแถว (user request 2026-07-29 — แทนชิปตะกร้า+จำนวนเดิมของ 2026-07-25)
    // service กลาง: หน้า inbox โหลดหน้าแรกแบบ RSC ไม่ผ่าน route นี้ ต้องเรียกฟังก์ชันเดียวกันทั้งสองทาง
    const items = await enrichWithOrderStage(withUnread, activeCtx.shopId);

    // ชั้นที่ 3(ข) ของการกู้คืนงานตอบอัตโนมัติ (feature 00023, SDS TD-001)
    //
    // cron ของโปรเจกต์นี้เป็นรายวัน (เจ้าของระบบตัดสินแล้วว่าไม่อัป plan) จึงพึ่ง cron เป็น
    // กลไกหลักไม่ได้ — ทุกครั้งที่แอดมินเปิดกล่องข้อความคือโอกาสกวาดงานค้างของร้านนั้น
    // ซึ่งในทางปฏิบัติเกิดบ่อยกว่าวันละครั้งมาก
    //
    // อยู่ใน after() ห้าม await ในเส้นทางตอบ response — หน้ากล่องข้อความต้องไม่ช้าลงเพราะเรื่องนี้
    // และพังแล้วต้องไม่กระทบการโหลดรายการ
    const sweepShopId = activeCtx.shopId;
    after(async () => {
      try {
        await sweepStuckJobs({ shopId: sweepShopId, limit: 5 });
      } catch (e) {
        console.error("[chat] sweep งานตอบอัตโนมัติล้มเหลว", e instanceof Error ? e.message : e);
      }
    });

    return NextResponse.json({ items, nextCursor: result.nextCursor }, { headers: NO_STORE_HEADERS });
  }

  const result = await listConversationsForBuyer(userId, {
    cursor: parsed.output.cursor,
    take: parsed.output.take,
  });
  // B1: buyer เห็น counterparty = shop identity
  const items = await enrichWithShopCounterparty(result.items);
  return NextResponse.json({ items, nextCursor: result.nextCursor }, { headers: NO_STORE_HEADERS });
}
