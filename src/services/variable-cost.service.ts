/**
 * ต้นทุนต่อออเดอร์ที่ร้านตั้งเอง — อ่าน/บันทึก `Shop.variableCosts` (feature 00096 P2 · BRD FR-016)
 * สูตร/ค่าตั้งต้น/การตรวจค่า อยู่ที่ src/lib/variable-cost.ts ที่เดียว
 */
import { prisma } from '@/lib/prisma'
import { resolveVariableCosts, type VariableCostSettings } from '@/lib/variable-cost'

export async function getShopVariableCosts(shopId: string): Promise<VariableCostSettings> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { variableCosts: true } })
  return resolveVariableCosts(shop?.variableCosts)
}

/** ผู้เรียกตรวจค่าด้วย VariableCostSchema แล้ว (route) — เขียนทับทั้งชุด */
export async function updateShopVariableCosts(shopId: string, next: VariableCostSettings): Promise<VariableCostSettings> {
  const shop = await prisma.shop.update({ where: { id: shopId }, data: { variableCosts: next }, select: { variableCosts: true } })
  return resolveVariableCosts(shop.variableCosts)
}
