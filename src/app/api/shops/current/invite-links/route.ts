import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { inviteLinkCreateSchema } from "@/lib/validations";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { createInviteLink, listActiveInviteLinks } from "@/services/invite-link.service";
import { buildInviteUrl, DEFAULT_INVITE_EXPIRY_KEY, type InviteExpiryKey } from "@/lib/invite-link";

/**
 * POST /api/shops/current/invite-links — owner สร้างลิงก์เชิญ admin เข้า Business shop ปัจจุบัน (active context)
 * GET  /api/shops/current/invite-links — list ลิงก์ที่ยัง active ของ shop ปัจจุบัน (owner-only)
 *
 * ทำไม guard ต้อง kind==='BUSINESS' && role==='OWNER': ลิงก์เชิญเป็นสิทธิ์ owner เท่านั้น
 * (ต่างจาก /api/business/shops/[shopId]/invites GET ที่เปิดให้ member ดูได้ — endpoint นี้จัดการลิงก์กลาง
 * ซึ่งกระทบ quota/security ของทั้งร้าน จึงจำกัดแค่ OWNER)
 *
 * feature 00012, Task 2.1
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // 00071 T2: ลิงก์เชิญ = เจ้าของ (รวมเจ้าของร่วม) · เฉพาะร้านธุรกิจ · คงรหัส NOT_OWNER ที่ UI เดิมอ่าน
  const gate = await requireShopCapability(session, "T2");
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const active = gate.active;
  if (active.kind !== "BUSINESS") return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
  const ownerId = gate.userId;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(inviteLinkCreateSchema, body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const expiryKey: InviteExpiryKey = parsed.output.expiryKey ?? DEFAULT_INVITE_EXPIRY_KEY;

  try {
    const { slug, expiresAt } = await createInviteLink(ownerId, active.shop.id, expiryKey, parsed.output.roles);
    return NextResponse.json({ url: buildInviteUrl(slug), slug, expiresAt }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && (e.message === "INVALID_ROLES" || e.message === "BILLING_NOT_AVAILABLE")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "SHOP_LOCKED") {
      return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NO_ACTIVE_PACKAGE") {
      return NextResponse.json({ error: "NO_ACTIVE_PACKAGE" }, { status: 403 });
    }
    console.error("[POST /api/shops/current/invite-links] shopId:", active.shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  const gate = await requireShopCapability(session, "T2");
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const active = gate.active;
  if (active.kind !== "BUSINESS") return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });

  try {
    const links = await listActiveInviteLinks(active.shop.id);
    return NextResponse.json({
      links: links.map((l) => ({
        url: buildInviteUrl(l.slug),
        slug: l.slug,
        expiresAt: l.expiresAt,
        createdAt: l.createdAt,
        roles: l.roles,
      })),
    });
  } catch (e: unknown) {
    console.error("[GET /api/shops/current/invite-links] shopId:", active.shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
