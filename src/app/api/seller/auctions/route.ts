import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { CreateAuctionSchema } from "@/lib/validations";
import { createAuction, listSellerAuctions } from "@/services/auction.service";
import { getMaxVerificationLevel } from "@/services/verification.service";
import { mapAuctionError, requireSellerShop } from "./_shared";

// POST /api/seller/auctions — สร้างประมูล (TFR-001)
// L2 gate ที่ route เป็นด่านแรก (SDS §4.1) — service มี backstop ซ้ำอีกชั้น (defense-in-depth)
export async function POST(request: NextRequest) {
  const auth = await requireSellerShop();
  if ("response" in auth) return auth.response;
  const { userId, shop } = auth;

  const maxLevel = await getMaxVerificationLevel(userId);
  if (maxLevel < 2) {
    return NextResponse.json(
      { error: "ต้องยืนยันตัวตนระดับ L2 ก่อนเปิดประมูล" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = v.safeParse(CreateAuctionSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    // shopId มาจาก session (shop.id) เท่านั้น — ห้ามรับจาก body (FR-AUC-01-AC-09)
    const dto = await createAuction(shop.id, parsed.output);
    return NextResponse.json(dto, { status: 201 });
  } catch (e) {
    return mapAuctionError(e, "POST /api/seller/auctions");
  }
}

// GET /api/seller/auctions?status=&page= — list ประมูลของร้านตัวเอง (TFR-004)
export async function GET(request: NextRequest) {
  const auth = await requireSellerShop();
  if ("response" in auth) return auth.response;
  const { shop } = auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const pageParam = searchParams.get("page");
  const page = pageParam ? Number(pageParam) : undefined;

  try {
    const result = await listSellerAuctions(shop.id, { status, page });
    return NextResponse.json(result);
  } catch (e) {
    return mapAuctionError(e, "GET /api/seller/auctions");
  }
}
