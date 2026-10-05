/**
 * bind-wizard-rules — boolean/ข้อความที่ wizard ผูกกลุ่ม LINE ตัดสิน (00068 · addendum E §4.1) · pure
 *
 * ทำไมอยู่ใน lib: ตามคอนเวนชัน `ui-boolean-needs-a-testable-home` — ปุ่มสร้างโค้ดกดได้เมื่อไหร่ต้องมีเทส mutation จับ
 * 🛑 ห้าม import `bind-code.ts` (ใช้ node crypto) — รูปโค้ดมีขีดมาจาก API แล้ว
 * นับถอยหลัง/หมดอายุ ใช้ `countdown.ts` ตัวเดียวกับรายการ (formatCountdown/isExpired)
 */
import { SHOP_VERTICALS, isShopVertical } from '@/lib/lodging'

/** เพดานร้านต่อกลุ่ม — ตรงกับ MAX_REPORT_SHOPS ใน line-report-shop.service (ไม่ import เพราะลาก prisma เข้า client) */
export const MAX_PICK_SHOPS = 10

export type CanCreateInput = {
  selectedIds: readonly string[]
  acknowledged: boolean
  busy: boolean
  /** ฟีเจอร์พร้อมสร้างโค้ดไหม (มีร้านให้เลือก ∧ แพ็กเกจใช้งาน ∧ บอทพร้อม) */
  available: boolean
}

/** ปุ่ม "สร้างโค้ด" กดได้เมื่อเลือก 1..10 ร้าน ∧ ติ๊กรับทราบ ∧ ไม่กำลังส่ง ∧ ฟีเจอร์พร้อม */
export function canCreateCode({ selectedIds, acknowledged, busy, available }: CanCreateInput): boolean {
  return available && !busy && acknowledged && selectedIds.length >= 1 && selectedIds.length <= MAX_PICK_SHOPS
}

/** ร้านเดียว = ติ๊กไว้ให้ (ถอดได้) · หลายร้านต้องเลือกเอง */
export function initialSelection(shops: readonly { id: string }[]): string[] {
  return shops.length === 1 ? [shops[0].id] : []
}

/** สลับการเลือก — ชนเพดานแล้วเพิ่มไม่ได้ (ถอดได้เสมอ) · ไม่แก้ array เดิม */
export function togglePick(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id)
  return selected.length >= MAX_PICK_SHOPS ? [...selected] : [...selected, id]
}

/** แถวที่ยังไม่ติ๊กจะ disabled เมื่อเลือกครบเพดาน */
export function isPickDisabled(selected: readonly string[], id: string): boolean {
  return selected.length >= MAX_PICK_SHOPS && !selected.includes(id)
}

/** ป้ายชนิดร้าน — vertical ตาม SSOT `SHOP_VERTICALS` · บัญชีส่วนตัว (`kind==='PERSONAL'`) ชนะ */
export function shopTypeLabel(shop: { vertical: string; kind: string }): string {
  if (shop.kind === 'PERSONAL') return 'บัญชีส่วนตัว'
  return isShopVertical(shop.vertical) ? SHOP_VERTICALS[shop.vertical] : SHOP_VERTICALS.ONLINE_SALES
}

/** บรรทัดสรุปร้านหลังสร้างโค้ด: "ร้านที่รวม: A" / "ร้านที่รวม: A และอีก 2 ร้าน" */
export function pickedShopsSummary(names: readonly string[]): string {
  if (names.length === 0) return 'ร้านที่รวม: -'
  const rest = names.length - 1
  return rest > 0 ? `ร้านที่รวม: ${names[0]} และอีก ${rest} ร้าน` : `ร้านที่รวม: ${names[0]}`
}

/** ข้อความช่วยใต้ปุ่มสร้างโค้ด — บอกเหตุเดียวที่ปุ่มยังกดไม่ได้ (null = กดได้/ไม่ต้องบอก) */
export function createHint(input: Pick<CanCreateInput, 'selectedIds' | 'acknowledged'>): string | null {
  if (input.selectedIds.length === 0) return 'ต้องเลือกอย่างน้อย 1 ร้าน'
  if (!input.acknowledged) return 'ติ๊กรับทราบก่อนสร้างโค้ด'
  return null
}

export type BindCodeRequest = { url: string; body: Record<string, unknown> }

/**
 * ตัดสินว่าจะยิง endpoint ไหนตอนสร้างโค้ด — กติกา "สร้างกลุ่มครั้งเดียวต่อ wizard" (addendum E §4.1 ข้อ 1)
 * มี groupId แล้ว = `/groups/{id}/bind-code` เสมอ (ห้ามยิง `/bind-code` ซ้ำ ไม่งั้นได้ PENDING ค้างเต็มเพดาน 10)
 * ไม่มี groupId: เฉพาะโหมด create ที่สร้างกลุ่มใหม่ได้ · resume/rebind ที่ไม่มี groupId = ผิดปกติ → null (ไม่ยิงอะไร)
 */
export function bindCodeRequest({ groupId, selected, mode }: { groupId: string | null; selected: readonly string[]; mode: 'create' | 'resume' | 'rebind' }): BindCodeRequest | null {
  if (groupId) return { url: `/api/line-report/groups/${groupId}/bind-code`, body: {} }
  if (mode !== 'create') return null
  return { url: '/api/line-report/bind-code', body: { shopIds: [...selected], acknowledged: true } }
}

export type PollFailure = 'DENIED' | 'GONE' | 'BUSY' | 'NETWORK'

/** จัดประเภทความล้มของ poll: 0 = เครือข่าย · 401/403 = หมดสิทธิ์ (หยุด) · 404 = ไม่พบ (หยุด) · อื่น ๆ (429/5xx) = ระบบไม่ว่าง (ลองต่อ) */
export function classifyPollStatus(status: number): PollFailure {
  if (status === 0) return 'NETWORK'
  if (status === 401 || status === 403) return 'DENIED'
  if (status === 404) return 'GONE'
  return 'BUSY'
}

export const POLL_NOTICE: Record<'NETWORK' | 'BUSY', string> = {
  NETWORK: 'เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่…',
  BUSY: 'ระบบไม่ว่างชั่วคราว กำลังลองใหม่…',
}
export const DENIED_FALLBACK_MESSAGE = 'ไม่มีสิทธิ์ดูกลุ่มนี้แล้ว'
