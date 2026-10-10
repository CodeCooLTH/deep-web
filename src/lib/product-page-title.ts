/**
 * ชื่อแท็บเบราว์เซอร์ของหน้าสินค้า (generateMetadata) ผันตามประเภทกิจการของร้านที่ active อยู่
 *
 * ทำไมแยกไฟล์: 4 หน้า (list/detail/new/edit) ต้อง resolve ร้านเหมือนกัน — คำทั้งหมดมาจาก
 * seller-menu.ts (SSOT) ONLINE_SALES/LODGING ได้คำเดิมเป๊ะ ('สินค้า'), เฉพาะร้านบริการเปลี่ยน
 * resolve ไม่ได้/error ใด ๆ → ถอยไปคำเดิม (ชื่อแท็บห้ามทำให้หน้าล่ม)
 */
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { resolveProductVocab } from '@/lib/seller-menu'

type Kind = 'list' | 'detail' | 'new' | 'edit'

export async function productPageMetadata(kind: Kind): Promise<Metadata> {
  let vertical = 'ONLINE_SALES'
  try {
    const session = await getServerSession(authOptions)
    const active = await requireActiveShop(session as Parameters<typeof requireActiveShop>[0])
    if (active) vertical = active.shop.vertical
  } catch {
    // ใช้คำเดิม
  }
  const { productNoun, itemSingular } = resolveProductVocab(vertical)
  const title = {
    list: productNoun,
    detail: `รายละเอียด${itemSingular}`,
    new: `เพิ่ม${itemSingular}ใหม่`,
    edit: `แก้ไข${itemSingular}`,
  }[kind]
  return { title }
}
