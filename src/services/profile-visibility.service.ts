import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'

/**
 * profile-visibility.service — "รายการไหนขึ้นหน้าร้านสาธารณะบ้าง" (feature 00053)
 *
 * ทุก DB access ของสวิตช์รายตัวอยู่ในไฟล์นี้ไฟล์เดียว — API route ห้ามคุย Prisma ตรง ๆ
 * (pattern เดียวกับ shop-page-layout.service ของ 00035)
 *
 * 🛑 คอลัมน์ `showOnProfile` ตอบคำถามเดียว: "โชว์บนหน้าร้านไหม" — ไม่ใช่ "ขายอยู่ไหม" (`isActive`)
 * และไม่ใช่ "ปักหมุดไหม" (`pinnedAt`) ฟังก์ชันในไฟล์นี้จึงห้ามแตะสองคอลัมน์นั้นเด็ดขาด
 * (BR-PPD-04 · TC-D2 พิสูจน์ด้วย mutation)
 */

export type ProfileItemKind = 'PRODUCT' | 'ROOM' | 'SERVICE'

export type ProfileVisibilityItem = {
  id: string
  kind: ProfileItemKind
  name: string
  showOnProfile: boolean
  /** รูปแรกของรายการ (สินค้า/ห้องพัก) — บริการไม่มีรูปในสคีมา จึงเป็น null เสมอ */
  imageFileId: string | null
  /** ปักหมุดอยู่ไหม — ใช้ขึ้นป้ายในหน้าตั้งค่าเท่านั้น (สินค้าเท่านั้นที่ปักหมุดได้) */
  pinned: boolean
}

export type ProfileVisibilityGroup = {
  kind: ProfileItemKind
  items: ProfileVisibilityItem[]
  /** จำนวนที่ยังแสดงอยู่ — คิดที่นี่ทีเดียว ไม่ให้ UI นับเองแล้วเพี้ยนจากตัวจริง */
  visibleCount: number
}

/** images ของ Product/Room เป็น Json (array ของ fileId) — ตัวแรกคือรูปหลัก */
function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images[0]
  return typeof first === 'string' && first.length > 0 ? first : null
}

/**
 * listProfileVisibilityItems — รายการทั้งหมดที่ร้านเลือกแสดง/ซ่อนได้ พร้อมสถานะปัจจุบัน
 *
 * ใช้เฉพาะหน้าตั้งค่า `/public-profile` (ไม่ใช่ public read) จึงมี guard เหมือนทุก mutation
 *
 * 🛑 นับเฉพาะรายการที่ `isActive` — รายการที่ปิดการขายไปแล้วไม่ขึ้นหน้าร้านอยู่แล้วไม่ว่า
 * `showOnProfile` จะเป็นอะไร การเอามาแสดงในหน้าตั้งค่าจะทำให้ตัวนับ "แสดงอยู่ x จาก y" โกหก
 * (นับของที่ไม่มีวันโชว์รวมเข้าไปด้วย)
 *
 * ชนิดที่ร้านไม่มีเลยจะไม่ถูกคืนเป็นกลุ่มว่าง — ไม่คืนกลุ่มนั้นเลย เพื่อให้หน้าจอไม่ต้องตัดสินใจ
 * ว่าจะซ่อนการ์ดเปล่าตอนไหน
 */
export async function listProfileVisibilityItems(
  shopId: string,
  actorUserId: string,
): Promise<ProfileVisibilityGroup[]> {
  if (!(await canAccessShop(shopId, actorUserId))) throw new Error('FORBIDDEN')

  const [products, rooms, services] = await Promise.all([
    prisma.product.findMany({
      where: { shopId, isActive: true },
      select: { id: true, name: true, images: true, showOnProfile: true, pinnedAt: true },
      orderBy: [{ pinnedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.room.findMany({
      where: { shopId, isActive: true },
      select: { id: true, name: true, images: true, showOnProfile: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceResource.findMany({
      where: { shopId, isActive: true },
      select: { id: true, name: true, showOnProfile: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const groups: ProfileVisibilityGroup[] = []

  const push = (kind: ProfileItemKind, items: ProfileVisibilityItem[]) => {
    if (items.length === 0) return
    groups.push({ kind, items, visibleCount: items.filter((i) => i.showOnProfile).length })
  }

  push(
    'PRODUCT',
    products.map((p) => ({
      id: p.id,
      kind: 'PRODUCT' as const,
      name: p.name,
      showOnProfile: p.showOnProfile,
      imageFileId: firstImage(p.images),
      pinned: p.pinnedAt != null,
    })),
  )
  push(
    'ROOM',
    rooms.map((r) => ({
      id: r.id,
      kind: 'ROOM' as const,
      name: r.name,
      showOnProfile: r.showOnProfile,
      imageFileId: firstImage(r.images),
      pinned: false,
    })),
  )
  push(
    'SERVICE',
    services.map((s) => ({
      id: s.id,
      kind: 'SERVICE' as const,
      name: s.name,
      showOnProfile: s.showOnProfile,
      imageFileId: null,
      pinned: false,
    })),
  )

  return groups
}

/**
 * setProfileItemVisibility — เขียนสวิตช์ของรายการเดียว
 *
 * 🛑 scope ด้วย `shopId` ใน `where` ของ `updateMany` ตั้งแต่คำสั่งแรก ไม่ใช่ดึงมาแล้วเทียบทีหลัง
 * (feedback_rsc_dal_authz) — `updateMany` เป็นตัวเดียวที่รับ `where` แบบไม่ใช่ unique key ได้
 * `count === 0` จึงครอบทั้ง "ไม่มีรายการนี้" และ "มีแต่เป็นของร้านอื่น" ⇒ ตอบ NOT_FOUND
 * เหมือนกันทั้งสองกรณี (ไม่ยืนยันให้คนนอกรู้ว่า id นี้มีอยู่จริง)
 *
 * 🛑 `data` มีคีย์เดียวเท่านั้น — ห้ามเพิ่ม `pinnedAt`/`isActive` เข้ามาไม่ว่ากรณีใด
 * การซ่อนของที่ปักหมุดไว้ต้องไม่ถอดหมุด (FR-PPD-11) เปิดกลับแล้วต้องอยู่ที่เดิม
 */
export async function setProfileItemVisibility(
  shopId: string,
  actorUserId: string,
  kind: ProfileItemKind,
  id: string,
  showOnProfile: boolean,
): Promise<{ kind: ProfileItemKind; id: string; showOnProfile: boolean }> {
  if (!(await canAccessShop(shopId, actorUserId))) throw new Error('FORBIDDEN')

  const where = { id, shopId }
  const data = { showOnProfile }

  // allow-list ตาม kind — เขียนเป็น switch ที่ครบทุกค่าของ union ให้ tsc บังคับ ไม่ใช่ ternary
  // สองทางที่ค่าที่สามจะตกเข้า branch ผิดอย่างเงียบ ๆ (docs/conventions/enum-value-removal.md)
  let count: number
  switch (kind) {
    case 'PRODUCT':
      ;({ count } = await prisma.product.updateMany({ where, data }))
      break
    case 'ROOM':
      ;({ count } = await prisma.room.updateMany({ where, data }))
      break
    case 'SERVICE':
      ;({ count } = await prisma.serviceResource.updateMany({ where, data }))
      break
  }

  if (count === 0) throw new Error('NOT_FOUND')
  return { kind, id, showOnProfile }
}
