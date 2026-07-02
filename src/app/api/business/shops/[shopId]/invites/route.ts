import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InviteShopMemberSchema } from "@/lib/validations";
import { inviteShopMember, listInvites } from "@/services/shop-member.service";
import { isShopMember } from "@/lib/shop-context";
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
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(InviteShopMemberSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const invite = await inviteShopMember(ownerId, shopId, parsed.output.contact, parsed.output.contactType);
    return NextResponse.json({ inviteId: invite.id, status: invite.status }, { status: 201 });
  } catch (e: unknown) {
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
 * ทำไม guard ด้วย isShopMember แทน NOT_OWNER: endpoint นี้ member-scoped (Owner/Admin เข้าถึงเท่ากัน — API.md §2)
 *
 * API.md §4.11
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId } = await params;

  if (!(await isShopMember(shopId, userId))) {
    return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });
  }

  try {
    const invites = await listInvites(shopId);
    return NextResponse.json({
      invites: invites.map((i) => ({
        id: i.id,
        invitedContact: maskInviteContact(i.invitedContact, i.contactType as "PHONE" | "EMAIL"),
        contactType: i.contactType,
        status: i.status,
        createdAt: i.createdAt,
      })),
    });
  } catch (e: unknown) {
    console.error("[GET /api/business/shops/[shopId]/invites] shopId:", shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
