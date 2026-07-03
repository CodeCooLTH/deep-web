import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { getShopByUserId } from "@/services/shop.service";
import {
  getOrCreateConversation,
  listConversationsForShop,
  listConversationsForBuyer,
} from "@/services/chat.service";
import { StartConversationSchema, ChatConversationsQuerySchema } from "@/lib/validations";

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
 * seller.* → shop ของ session user (personal shop เท่านั้น — ดู SDS §1.4 multi-shop caveat)
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
  };
  const parsed = v.safeParse(ChatConversationsQuerySchema, input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 3. role branch ตาม subdomain — ไม่รับ role/shopId จาก client
  const host = request.headers.get("host") || "";
  const subdomain = getSubdomain(host);

  if (subdomain === "seller") {
    const shop = await getShopByUserId(userId);
    if (!shop) {
      return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
    }
    const result = await listConversationsForShop(shop.id, {
      cursor: parsed.output.cursor,
      take: parsed.output.take,
    });
    return NextResponse.json(result);
  }

  const result = await listConversationsForBuyer(userId, {
    cursor: parsed.output.cursor,
    take: parsed.output.take,
  });
  return NextResponse.json(result);
}
