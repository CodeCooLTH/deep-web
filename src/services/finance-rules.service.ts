/**
 * finance-rules.service.ts — ถามกติกาการเงินจาก shopId (สำหรับ service ที่ไม่ได้รับ vertical มา)
 *
 * ตัวตัดสินจริงอยู่ที่ `usesServiceFinanceRules` (src/lib/finance-rules.ts) ที่เดียว — ไฟล์นี้แค่ดึง
 * vertical ของร้านให้ เพื่อไม่ต้องไล่เพิ่มพารามิเตอร์ให้ผู้เรียกหลายสิบจุด (เช่น getBestSellerProducts มี 6 ราย)
 *
 * ร้านหาไม่เจอ ⇒ vertical = undefined ⇒ resolveShopVertical ตกไป ONLINE_SALES ⇒ กติกาเดิม
 * (fail-closed ไปทางของเดิมที่ลูกค้าใช้อยู่ — ไม่ใช่ไปทางกติกาใหม่)
 */
import { prisma } from '@/lib/prisma'
import { usesServiceFinanceRules } from '@/lib/finance-rules'

export async function shopUsesServiceFinanceRules(shopId: string): Promise<boolean> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  return usesServiceFinanceRules(shop?.vertical)
}

/**
 * สินค้าชุดนี้อยู่ใต้กติกาใหม่ไหม — ผู้เรียก (หน้าร้าน /u /b) scope สินค้าด้วยร้านเดียวมาแล้ว
 * ถ้าบังเอิญมีหลายร้านปนกัน ใช้กติกาใหม่เฉพาะเมื่อ **ทุกร้าน** เป็นร้านบริการ ไม่งั้นของเดิม
 */
export async function productsUseServiceFinanceRules(productIds: string[]): Promise<boolean> {
  if (productIds.length === 0) return false
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { shop: { select: { vertical: true } } },
    distinct: ['shopId'],
  })
  return rows.length > 0 && rows.every((r) => usesServiceFinanceRules(r.shop?.vertical))
}
