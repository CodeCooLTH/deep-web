import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatScope } from "@/lib/chat-scope";
import { getProductsByShop, getBestSellerProducts } from "@/services/product.service";
import { isEntitlementActive } from "@/services/inventory-entitlement.service";
import { listServiceResources } from "@/services/service-resource.service";
import { canUseAppointments } from "@/lib/appointments";
import { resolveOrderVocab } from "@/lib/seller-menu";
import { resolveChatIshipCreateMode } from "@/lib/iship/chat-create-mode";
import { sessionUserId } from "@/lib/session-user";

/**
 * GET /api/chat/shop-context?shopId=... — ข้อมูลประกอบฟอร์ม "สร้างรายการ" ของร้านหนึ่ง (feature 00037)
 *
 * ทำไมต้องมี endpoint นี้: ก่อนหน้านี้ (chat)/layout.tsx โหลดของชุดนี้ให้ **ร้านที่ active ร้านเดียว**
 * แล้วส่งลง DraftOrderProvider ตรง ๆ ซึ่งใช้ได้เพราะ "ร้านที่ active" = "ร้านของเธรดที่เปิดอยู่" เสมอ
 * กล่องแชทรวมหลายร้านตัดความเท่ากันนั้นทิ้ง — เปิดเธรดร้าน B ขณะ active ร้าน A ได้แล้ว ฟอร์มจึงต้อง
 * ไปเอาของร้าน B มาเองตอนนั้น
 *
 * 🛑 ทำไมต้องเอามาทั้งชุดใน request เดียว ไม่แยกเป็นหลาย endpoint: กฎ "ร้านนี้ต้องกรอกที่อยู่จัดส่งไหม"
 * ตัดสินจาก vertical + ธง fulfillmentMode ของสินค้าในแคตตาล็อกร่วมกัน ถ้าสองอย่างนี้มาคนละจังหวะ
 * จะมีช่วงที่ฟอร์มถือ vertical ของร้านหนึ่งกับสินค้าของอีกร้าน — ซึ่งเป็นคลาสบั๊กเดียวกับที่ทำให้
 * ร้านบริการถูกบังคับกรอกที่อยู่เมื่อ 2026-08-07 (docs/conventions/stored-flag-vs-owner-truth.md)
 *
 * ownership: shopId ต้องอยู่ใน scope.shopIds เท่านั้น — ไม่อยู่ = 403 (ที่นี่ตอบ 403 ได้ ต่างจาก
 * ตัวกรองรายการที่ต้องคืนผลว่าง เพราะนี่คือการ "ขอข้อมูลของร้านที่ระบุ" ไม่ใช่การกรองรายการ
 * ผู้เรียกรู้อยู่แล้วว่าร้านนี้มีตัวตน — มันมาจากเธรดที่เขาเพิ่งเปิด)
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scope = await resolveChatScope({
    user: {
      id: userId,
      activeShopId:
        ((session.user as { activeShopId?: string | null }).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!scope) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const shopId = request.nextUrl.searchParams.get("shopId") ?? scope.activeShopId;
  if (!scope.shopIds.includes(shopId)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงร้านนี้" }, { status: 403 });
  }

  try {
    const [catalog, bestSellers, inventoryEnabled, shopRow, shipping] = await Promise.all([
      getProductsByShop(shopId),
      getBestSellerProducts(shopId, 8),
      isEntitlementActive(shopId).catch(() => false),
      prisma.shop.findUnique({
        where: { id: shopId },
        select: { kind: true, vertical: true, appointmentGranularity: true },
      }),
      prisma.shopShippingAccount
        .findUnique({ where: { shopId }, select: { status: true, createMode: true } })
        .catch(() => null),
    ]);
    if (!shopRow) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

    const serviceResourcesEnabled = canUseAppointments({
      kind: shopRow.kind,
      vertical: shopRow.vertical,
    });
    const serviceResources = serviceResourcesEnabled
      ? (await listServiceResources(shopId, { activeOnly: true }).catch(() => [])).map((r) => ({
          id: r.id,
          name: r.name,
          durationMinutes: r.durationMinutes,
          capacity: r.capacity,
          depositMode: r.depositMode,
          depositValue: r.depositValue.toFixed(2),
        }))
      : [];

    return NextResponse.json(
      {
        shopId,
        // toCatalog ของ layout ทำ mapping เดียวกันนี้ — รูปแบบต้องตรงกันเป๊ะ ไม่งั้นฟอร์มที่โหลด
        // ผ่านเส้นทางนี้จะได้ข้อมูลคนละหน้าตากับที่ preload มาจาก layout
        catalog: catalog.map(toCatalog),
        bestSellers: bestSellers.map(toCatalog),
        inventoryEnabled,
        vocab: resolveOrderVocab(shopRow.vertical),
        shopVertical: shopRow.vertical,
        serviceResourcesEnabled,
        serviceResources,
        appointmentGranularity: shopRow.appointmentGranularity ?? "DAY",
        // feature 00022 × 00037 — โหมดเปิดพัสดุของ "ร้านนี้" ต้องเดินทางมาพร้อมชุดข้อมูลเดียวกัน
        // (BR-UNI-04: ห้ามให้ฟอร์มถือ vertical ของร้านหนึ่งกับการตั้งค่าขนส่งของอีกร้าน)
        // ต้องคำนวณด้วย resolveChatIshipCreateMode ตัวเดียวกับที่ (chat)/layout.tsx ใช้ seed
        ishipCreateMode: resolveChatIshipCreateMode(shipping),
        hasShipping: shipping?.status === "ACTIVE",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    console.error("[GET /api/chat/shop-context]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "โหลดข้อมูลร้านไม่สำเร็จ" }, { status: 500 });
  }
}

/** มิเรอร์ toCatalog ของ (chat)/layout.tsx — ทั้งสองทางต้องประกอบ CatalogProduct เหมือนกัน */
function toCatalog(p: {
  id: string;
  name: string;
  price: unknown;
  type: string;
  fulfillmentMode: string;
  images: unknown;
  sku: string | null;
  stockQty: number | null;
}) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    type: p.type,
    fulfillmentMode: p.fulfillmentMode,
    image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : null,
    sku: p.sku ?? null,
    stockQty: p.stockQty ?? null,
  };
}
