/**
 * active-shop — ร้านที่เลือกอยู่ของ session (id + ชื่อ) สำหรับข้อความบอกขอบเขตของกลุ่ม LINE (00070)
 *
 * กลุ่มผูกระดับบัญชีเจ้าของ ไม่ใช่ร้านที่เลือกอยู่ — หน้าจึงบอกว่ากลุ่มนี้รวมร้านไหน · ไม่ตัดสินสิทธิ์ใด ๆ (อ่านชื่อเพื่อแสดงเท่านั้น)
 * ไม่มี active shop / หลุดสิทธิ์ → null → ผู้เรียกข้ามการเน้น/ข้อความทั้งหมด
 */
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'

export type ActiveShopRef = { id: string; name: string }

export async function resolveActiveShopRef(session: unknown): Promise<ActiveShopRef | null> {
  // ตัวตนจาก sessionUserId เท่านั้น (convention session-exists-is-not-identity) · activeShopId เป็นแค่ค่าที่ขอ — resolveActiveShopContext ตรวจสมาชิกภาพเอง
  const userId = sessionUserId(session)
  if (!userId) return null
  const activeShopId = (session as { user?: { activeShopId?: string | null } } | null)?.user?.activeShopId ?? null
  const ctx = await resolveActiveShopContext({ user: { id: userId, activeShopId } })
  if (!ctx) return null
  const shop = await prisma.shop.findUnique({ where: { id: ctx.shopId }, select: { id: true, shopName: true } })
  return shop ? { id: shop.id, name: shop.shopName } : null
}
