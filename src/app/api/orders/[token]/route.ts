import { stripOrderItemCost } from "@/lib/order-cost-redact";
import { orderNounFor, itemNounFor } from "@/lib/api-error-vocab";
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability, ForbiddenRoleError } from "@/lib/shop-capability";
import { can, moneyLevel } from "@/lib/shop-permissions";
import { toNoMoneyOrder } from "@/lib/order-view-by-level";
import { isBillingOnlyEditor } from "@/lib/order-role-rules";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { prisma } from "@/lib/prisma";
import { CreateOrderSchema } from "@/lib/validations";
import {
  updateOrder,
  OrderNotFoundError,
  OrderNotEditableError,
  ProductNotInShopError,
  ShippingAddressRequiredError,
  OrderDateOutOfWindowError,
  PickupNotAllowedError,
} from "@/services/order.service";
import { ORDER_DATE_OUT_OF_WINDOW_MESSAGE } from "@/lib/order-date-window";

// GET/PATCH /api/orders/[token] — โหลด/แก้ไขคำสั่งซื้อ (user request 2026-07-25: แก้ใน modal จากแชท)
// seller-only: ต้องเป็นเจ้าของ/สมาชิกร้านที่ active (scope shopId ใน WHERE — กัน IDOR)
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * shopId ที่ client ส่งมา — คืน undefined ถ้าไม่ส่ง, null ถ้าส่งมาแต่รูปแบบผิด (caller ตอบ 400)
 *
 * สตริงว่าง = "ส่งมาแต่ผิด" ไม่ใช่ "ไม่ส่ง" — ต้องตรงกับ `POST /api/orders` เป๊ะ ไม่งั้นค่าเดียวกัน
 * ให้ผลคนละอย่างสองเส้นทาง (เส้นหนึ่ง 400 อีกเส้นถอยไปร้าน active เงียบ ๆ)
 */
function readShopId(raw: unknown): string | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  const parsed = v.safeParse(v.pipe(v.string(), v.uuid()), raw);
  return parsed.success ? parsed.output : null;
}

// ไม่ใช่สมาชิกร้านที่ระบุ → 404 (ไม่เปิดเผยว่าออเดอร์/ร้านมีอยู่ · 00037 API.md ข้อ 3) · สมาชิกที่ไม่มีสิทธิ์ยังได้ 403 FORBIDDEN_ROLE
function notMemberAs404(gate: { response: NextResponse; reason: string }) {
  return gate.reason === "NOT_MEMBER" ? NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 }) : gate.response;
}

// GET — ข้อมูลสำหรับ prefill ฟอร์มแก้ไข (เฉพาะ field ที่ฟอร์มใช้)
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shopId = readShopId(request.nextUrl.searchParams.get("shopId"));
  if (shopId === null) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  // ไม่ส่ง shopId = ร้านที่ active · ส่งมา = ต้องเป็นร้านนั้นเท่านั้น ห้ามถอย (feature 00037 — เหมือน POST /api/orders)
  const gate = await requireShopCapability(session, "O1", { shopId });
  if (!gate.ok) return notMemberAs404(gate);
  const ctx = { shopId: gate.shopId };

  const canSeeCost = can(gate.roles, "P3");
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId: ctx.shopId },
    select: {
      publicToken: true, status: true, type: true, createdAt: true,
      buyerName: true, buyerContact: true, paymentMethod: true, salesChannel: true,
      internalNote: true, discount: true, vatRate: true, vatAmount: true, shippingAddress: true,
      // feature 00062 — หน้าแก้ไขต้องรู้ว่าใบนี้เป็น "นัดรับ" เพื่อ default ปุ่มให้ถูก
      // 🛑 ถ้าไม่คืนค่านี้ ร้านที่กดบันทึกโดยไม่แตะปุ่มจะทำให้ออเดอร์นัดรับ **กลับเป็นจัดส่งเงียบ ๆ**
      // (updateOrder คำนวณใหม่จาก items เมื่อไม่ได้รับค่า) — คลาสเดียวกับบั๊ก createAt ข้างล่าง
      fulfillmentMode: true,
      // cost เลือกเฉพาะเจ้าของ (00071 S-3) — ผู้อื่นไม่ query ต้นทุนเลย
      items: { select: { productId: true, name: true, description: true, qty: true, price: true, ...(canSeeCost ? { cost: true } : {}) } },
    },
  });
  if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });

  // ช่าง (ระดับเงิน NONE): allow-list ไม่มีเงิน — ตัดด้วย "ไม่มีคีย์" (00071 P3 · S-15)
  if (moneyLevel(gate.roles) === "NONE") return NextResponse.json(toNoMoneyOrder(order), { headers: NO_STORE });

  return NextResponse.json(
    {
      token: order.publicToken,
      status: order.status,
      type: order.type,
      // feature 00033 — วันที่สั่งซื้อเดิม ให้หน้าแก้ไขโหลดเข้าฟอร์ม (select เพิ่มด้านบนแล้ว
      // แต่ response เดิมสร้างจาก object literal ไม่ spread จึงต้องแปะ field นี้ด้วย ไม่งั้นไม่ถึง client)
      createdAt: order.createdAt,
      buyerName: order.buyerName,
      buyerContact: order.buyerContact,
      paymentMethod: order.paymentMethod,
      salesChannel: order.salesChannel,
      fulfillmentMode: order.fulfillmentMode,
      internalNote: order.internalNote,
      discount: order.discount != null ? Number(order.discount) : null,
      // vatRate ใน DB เป็น decimal 0..1 — ฟอร์มใช้ % (ดู OrderCreateForm) แปลงกลับที่ client
      vatRate: order.vatRate != null ? Number(order.vatRate) : null,
      vatAmount: order.vatAmount != null ? Number(order.vatAmount) : null,
      shippingAddress: order.shippingAddress ?? null,
      items: order.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        description: it.description,
        qty: it.qty,
        price: Number(it.price),
        // ต้นทุนที่บันทึกไว้ในใบนี้ — ฟอร์มแก้ไขต้องได้ค่าเดิมกลับไป (ร้านแจ้ง 2026-10-08)
        // 🛑 เดิมไม่ส่ง ⇒ ฟอร์มส่งทุนว่างตอนบันทึก ⇒ updateOrder ใช้ทุน *ล่าสุด* ของสินค้าแทนทุนเดิม
        //    และรายการพิมพ์เองที่เคยใส่ทุนไว้ ทุนหายเป็น null ⇒ กำไรของใบนั้นเปลี่ยนเอง
        ...(canSeeCost ? { cost: "cost" in it && it.cost != null ? Number(it.cost) : null } : {}),
      })),
    },
    { headers: NO_STORE },
  );
}

// PATCH — แก้ไขคำสั่งซื้อเต็มรูป (body เดียวกับ POST /api/orders)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const shopId = readShopId((body as { shopId?: unknown } | null)?.shopId);
  if (shopId === null) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const gate = await requireShopCapability(session, "O3", { shopId });
  if (!gate.ok) return notMemberAs404(gate);
  const ctx = { shopId: gate.shopId };

  const parsed = v.safeParse(CreateOrderSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    // feature 00031 — actor ของ ORDER_EDITED มาจาก session เสมอ ไม่รับจาก body
    const actorUserId = (session as { user?: { id?: string } }).user?.id ?? null;
    // ผู้ไม่ใช่เจ้าของ: ตัด items[].cost ทิ้งเงียบ (D-7) + รักษา cost เดิมของใบ (D-4)
    const isOwner = can(gate.roles, "P3");
    const data = isOwner
      ? parsed.output
      : { ...parsed.output, items: parsed.output.items.map(({ cost: _cost, ...it }) => it) };
    const order = await updateOrder(ctx.shopId, token, data, actorUserId, {
      keepLineCosts: !isOwner,
      // O3 ของ BILLING มีเงื่อนไขต่อใบ (SERVICE ∧ ยังไม่ชำระ) — service ตรวจในธุรกรรมเดียวกับที่แก้
      billingOnly: isBillingOnlyEditor(gate.roles),
    });
    // response ก็ต้องไม่มีต้นทุน — updateOrder คืน items ทั้งแถว (review T7)
    return NextResponse.json(stripOrderItemCost(order, isOwner), { headers: NO_STORE });
  } catch (e: unknown) {
    // vertical ของร้านสำหรับเลือกคำในข้อความ — ดึงเฉพาะทาง error (ctx ของ resolveActiveShopContext ไม่มี vertical)
    // ไม่เพิ่ม round-trip ให้ทางสำเร็จ
    const vertical = (await prisma.shop.findUnique({ where: { id: ctx.shopId }, select: { vertical: true } }))?.vertical;
    const orderNoun = orderNounFor(vertical);
    const itemNoun = itemNounFor(vertical);
    // OrderLockedForRoleError / OrderRoleRestrictedError ⊂ ForbiddenRoleError → 403 FORBIDDEN_ROLE
    if (e instanceof ForbiddenRoleError) return forbiddenRoleResponse();
    if (e instanceof OrderNotFoundError) return NextResponse.json({ error: `ไม่พบ${orderNoun}นี้` }, { status: 404 });
    if (e instanceof OrderNotEditableError) {
      return NextResponse.json({ error: `แก้ไขได้เฉพาะ${orderNoun}ที่ยังรอดำเนินการเท่านั้น` }, { status: 400 });
    }
    if (e instanceof ProductNotInShopError) return NextResponse.json({ error: `มี${itemNoun}ที่ไม่ใช่ของร้านนี้` }, { status: 400 });
    if (e instanceof ShippingAddressRequiredError) {
      return NextResponse.json({ error: "ออเดอร์ที่ต้องจัดส่งต้องกรอกที่อยู่ให้ครบ" }, { status: 400 });
    }
    // feature 00062 (API.md §5) — ร้านที่ไม่ใช่ ONLINE_SALES ส่ง fulfillmentMode:'PICKUP' มา
    if (e instanceof PickupNotAllowedError) {
      return NextResponse.json(
        { error: "PICKUP_NOT_ALLOWED", message: "ร้านนี้ตั้งค่า \"นัดรับ\" ไม่ได้" },
        { status: 400 },
      );
    }
    if (e instanceof Error && e.name === "OutOfStockError") {
      return NextResponse.json({ error: `${itemNoun}บางรายการสต็อกไม่พอ` }, { status: 400 });
    }
    if (e instanceof OrderDateOutOfWindowError) {
      return NextResponse.json({ error: ORDER_DATE_OUT_OF_WINDOW_MESSAGE }, { status: 400 });
    }
    console.error("[PATCH /api/orders/[token]]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: `แก้ไข${orderNoun}ไม่สำเร็จ กรุณาลองใหม่` }, { status: 500 });
  }
}
