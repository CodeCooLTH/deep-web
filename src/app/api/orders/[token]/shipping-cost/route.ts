import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { SetOutboundShippingCostSchema } from "@/lib/validations";
import { canAccessShopWith } from "@/lib/shop-capability";
import { sessionUserId } from "@/lib/session-user";
import { jsonNoStore } from "@/lib/shop-api-guard";
import { prisma } from "@/lib/prisma";
import {
  setOutboundShippingCost,
  ShipmentTrackingNotFoundError,
  ShippingCostNotAllowedError,
  OrderNotFoundError,
} from "@/services/order.service";

/**
 * PATCH /api/orders/[token]/shipping-cost — แก้เฉพาะต้นทุนส่งเอง (00078 D06 · S1)
 * body `{ outboundShippingCost: number | null }` (null = ล้างเป็นยังไม่ระบุ)
 * 409 NO_TRACKING_ROW = ยังไม่เคยแจ้งจัดส่ง (ไม่สร้างแถวปลอม) · 409 SHIPPING_COST_NOT_ALLOWED = ใบยกเลิก/ร่าง
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!userId) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { publicToken: token }, select: { shopId: true } });
  if (!order) return jsonNoStore({ error: "Order not found" }, { status: 404 });
  if (!(await canAccessShopWith(order.shopId, userId, "S1"))) return jsonNoStore({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(SetOutboundShippingCostSchema, body);
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const outboundShippingCost = await setOutboundShippingCost(order.shopId, token, parsed.output.outboundShippingCost, userId);
    return jsonNoStore({ outboundShippingCost });
  } catch (err) {
    if (err instanceof ShipmentTrackingNotFoundError) return jsonNoStore({ error: "NO_TRACKING_ROW" }, { status: 409 });
    if (err instanceof ShippingCostNotAllowedError) return jsonNoStore({ error: "SHIPPING_COST_NOT_ALLOWED" }, { status: 409 });
    if (err instanceof OrderNotFoundError) return jsonNoStore({ error: "Order not found" }, { status: 404 });
    console.error("[shipping-cost] PATCH ล้มเหลว", err);
    return jsonNoStore({ error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
