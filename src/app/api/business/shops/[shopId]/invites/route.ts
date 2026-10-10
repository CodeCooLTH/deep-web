import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { InviteShopMemberSchema } from "@/lib/validations";
import { inviteShopMember, listInvites } from "@/services/shop-member.service";
import { maskPhone } from "@/lib/phone-mask";

/**
 * mask invitedContact ก่อนคืน client — RSC boundary neutralize-at-source (feedback_rsc_pii_neutralize_at_source)
 * service `listInvites` คืน raw PII โดยตั้งใจ (ดู comment ใน shop-member.service.ts) — mask ต้องทำที่ route/DAL boundary นี้
 * PHONE ใช้ maskPhone (util ที่มีอยู่แล้ว, ใช้กับ Order.buyerContact) — EMAIL ไม่มี shared util จึง mask local part ที่นี่
 */
function maskInviteContact(contact: string, contactType: "PHONE" | "EMAIL"): string {
  if (contactType === "PHONE") return maskPhone(contact);
  const at = contact.indexOf("@");
  if (at <= 1) return "***" + contact.slice(at);
  return contact[0] + "***" + contact.slice(at);
}

/**
 * POST /api/business/shops/[shopId]/invites — owner เชิญ admin เข้า Business shop
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * API.md §4.10
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  const { shopId } = await params;
  // 00071 T2: คงรหัส NOT_OWNER ที่ UI เดิมอ่าน
  const gate = await requireShopCapability(session, "T2", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const ownerId = gate.userId;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(InviteShopMemberSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const invite = await inviteShopMember(ownerId, shopId, parsed.output.contact, parsed.output.contactType, parsed.output.roles);
    return NextResponse.json({ inviteId: invite.id, status: invite.status }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && (e.message === "INVALID_ROLES" || e.message === "BILLING_NOT_AVAILABLE")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NO_ACTIVE_PACKAGE") {
      return NextResponse.json({ error: "NO_ACTIVE_PACKAGE" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "SHOP_LOCKED") {
      return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "ADMIN_QUOTA_EXCEEDED") {
      return NextResponse.json({ error: "ADMIN_QUOTA_EXCEEDED" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "INVITE_ALREADY_PENDING") {
      return NextResponse.json({ error: "INVITE_ALREADY_PENDING" }, { status: 409 });
    }
    console.error("[POST /api/business/shops/[shopId]/invites] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/**
 * GET /api/business/shops/[shopId]/invites — list invite PENDING (owner management page)
 *
 * 00071 มติ C-3: เจ้าของเท่านั้น (T2) — ผู้ดูแล/บทบาทอื่นได้ 403 NOT_OWNER
 *
 * API.md §4.11
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  const { shopId } = await params;
  // 00071 T2 (มติ C-3): รายการคำเชิญเห็นได้เฉพาะเจ้าของ — เดิมสมาชิกทุกคนเห็น (ผู้ดูแลได้รายชื่อที่เชิญ)
  const gate = await requireShopCapability(session, "T2", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");

  try {
    const invites = await listInvites(shopId);
    return NextResponse.json({
      invites: invites.map((i) => ({
        id: i.id,
        invitedContact: maskInviteContact(i.invitedContact, i.contactType as "PHONE" | "EMAIL"),
        contactType: i.contactType,
        status: i.status,
        roles: i.roles,
        createdAt: i.createdAt,
      })),
    });
  } catch (e: unknown) {
    console.error("[GET /api/business/shops/[shopId]/invites] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
