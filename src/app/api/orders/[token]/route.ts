import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";
import { CreateOrderSchema } from "@/lib/validations";
import {
  updateOrder,
  OrderNotFoundError,
  OrderNotEditableError,
  ProductNotInShopError,
  ShippingAddressRequiredError,
  OrderDateOutOfWindowError,
} from "@/services/order.service";
import { ORDER_DATE_OUT_OF_WINDOW_MESSAGE } from "@/lib/order-date-window";

// GET/PATCH /api/orders/[token] — โหลด/แก้ไขคำสั่งซื้อ (user request 2026-07-25: แก้ใน modal จากแชท)
// seller-only: ต้องเป็นเจ้าของ/สมาชิกร้านที่ active (scope shopId ใน WHERE — กัน IDOR)
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * ร้านที่คำขอนี้ทำงานด้วย — `requestedShopId` มาจากร่างในกล่องแชทรวมหลายร้าน (feature 00037)
 *
 * ไม่ส่งมา = ร้านที่ active (พฤติกรรมเดิมทุกประการ) · ส่งมา = ต้องเป็นร้านนั้นเท่านั้น
 * 🛑 ห้าม fallback ไปร้าน active เมื่อระบุมาแล้วเข้าไม่ถึง — ออเดอร์คนละใบกันจะถูกอ่าน/เขียนแทนกัน
 * (คลาสเดียวกับบั๊ก POST /api/orders ที่ user เจอบน prod 2026-08-11)
 */
async function resolveShop(session: unknown, requestedShopId?: string | null) {
  const user = (session as { user?: { id?: string; activeShopId?: string | null } } | null)?.user;
  if (!user?.id) return null;
  return resolveActiveShopContext({
    user: { id: user.id, activeShopId: requestedShopId ?? user.activeShopId ?? null },
  });
}

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

// GET — ข้อมูลสำหรับ prefill ฟอร์มแก้ไข (เฉพาะ field ที่ฟอร์มใช้)
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shopId = readShopId(request.nextUrl.searchParams.get("shopId"));
  if (shopId === null) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveShop(session, shopId);
  if (!ctx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId: ctx.shopId },
    select: {
      publicToken: true, status: true, type: true, createdAt: true,
      buyerName: true, buyerContact: true, paymentMethod: true, salesChannel: true,
      internalNote: true, discount: true, vatRate: true, vatAmount: true, shippingAddress: true,
      items: { select: { productId: true, name: true, description: true, qty: true, price: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });

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
  const ctx = await resolveShop(session, shopId);
  if (!ctx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const parsed = v.safeParse(CreateOrderSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    // feature 00031 — actor ของ ORDER_EDITED มาจาก session เสมอ ไม่รับจาก body
    const actorUserId = (session as { user?: { id?: string } }).user?.id ?? null;
    const order = await updateOrder(ctx.shopId, token, parsed.output, actorUserId);
    return NextResponse.json(order, { headers: NO_STORE });
  } catch (e: unknown) {
    if (e instanceof OrderNotFoundError) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });
    if (e instanceof OrderNotEditableError) {
      return NextResponse.json({ error: "แก้ไขได้เฉพาะคำสั่งซื้อที่ยังรอดำเนินการเท่านั้น" }, { status: 400 });
    }
    if (e instanceof ProductNotInShopError) return NextResponse.json({ error: "มีสินค้าที่ไม่ใช่ของร้านนี้" }, { status: 400 });
    if (e instanceof ShippingAddressRequiredError) {
      return NextResponse.json({ error: "ออเดอร์ที่ต้องจัดส่งต้องกรอกที่อยู่ให้ครบ" }, { status: 400 });
    }
    if (e instanceof Error && e.name === "OutOfStockError") {
      return NextResponse.json({ error: "สินค้าบางรายการสต็อกไม่พอ" }, { status: 400 });
    }
    if (e instanceof OrderDateOutOfWindowError) {
      return NextResponse.json({ error: ORDER_DATE_OUT_OF_WINDOW_MESSAGE }, { status: 400 });
    }
    console.error("[PATCH /api/orders/[token]]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "แก้ไขคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
