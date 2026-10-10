/**
 * no-permission-copy — ข้อความการ์ด "บทบาทนี้เข้าหน้านี้ไม่ได้" (00071 P3 · UX spec §1)
 *
 * ไฟล์บริสุทธิ์ (conventions/ui-boolean-needs-a-testable-home): ตัดสินว่าเป็นกรณีไหนจากตารางสิทธิ์จริง
 * ไม่ฮาร์ดโค้ดรายหน้า — เพิ่ม/แก้ capability ในตารางแล้วข้อความตามเอง
 * ศัพท์ล็อก: ห้าม "ไม่สามารถ" / "คุณไม่มีสิทธิ์" / "พนักงาน"
 */
import { CAPABILITY_ROLES, PRIMARY_OWNER_ONLY, STAFF_ROLES, type Capability, type ShopRole } from '@/lib/shop-permissions'

/** ประโยคเดิมของหน้าการเงิน (P1) — ส่งเป็น detail เพื่อให้ข้อความคงเดิมทุกตัวอักษร */
export const FINANCE_NO_PERMISSION_DETAIL =
  'ข้อมูลการเงินของร้านเปิดให้เจ้าของร้านเท่านั้น ถ้าต้องการตัวเลขส่วนนี้ ขอจากเจ้าของร้านได้โดยตรง'

export const ROLE_LABEL: Record<ShopRole, string> = {
  OWNER: 'เจ้าของร้าน',
  MANAGER: 'ผู้ดูแล',
  CHAT: 'ตอบแชท',
  BILLING: 'เปิดบิล',
  TECHNICIAN: 'ฝ่ายช่าง',
}

/** "{list}" ของประโยคหลัก: 1=a · 2=aหรือb · 3+=a b หรือc */
function orList(xs: string[]): string {
  if (xs.length === 1) return xs[0]
  if (xs.length === 2) return `${xs[0]}หรือ${xs[1]}`
  return `${xs.slice(0, -1).join(' ')} หรือ${xs[xs.length - 1]}`
}

/** "{roles}" ของบรรทัดผู้ดู: a · a และ b · a, b และ c */
function andList(xs: string[]): string {
  if (xs.length === 1) return xs[0]
  return `${xs.slice(0, -1).join(', ')} และ ${xs[xs.length - 1]}`
}

export type NoPermissionCopy = { title: string; body: string; viewerLine: string | null }

export function noPermissionCopy(input: {
  capability: Capability
  viewerRoles: readonly ShopRole[]
  detail?: string
}): NoPermissionCopy {
  const { capability, viewerRoles, detail } = input
  const staff = STAFF_ROLES.filter((r) => CAPABILITY_ROLES[capability].has(r))
  const who = viewerRoles.length ? `บทบาทของคุณตอนนี้: ${andList(viewerRoles.map((r) => ROLE_LABEL[r]))}` : null

  if (PRIMARY_OWNER_ONLY.has(capability)) {
    return {
      title: 'หน้านี้ดูได้เฉพาะเจ้าของหลักของร้าน',
      // ประโยคเป็นกลาง: ผู้ดูอาจไม่ใช่เจ้าของร่วม (เข้าลิงก์ตรง) จึงห้ามพูดถึง "เจ้าของร่วม"
      body: 'หน้านี้เปิดได้เฉพาะเจ้าของหลักของร้าน (ผู้ถือแพ็กเกจ) ถ้าต้องการใช้ ขอให้เจ้าของหลักเป็นคนทำ',
      viewerLine: who,
    }
  }
  if (staff.length === 0) {
    return {
      title: 'หน้านี้ดูได้เฉพาะเจ้าของร้าน',
      body: detail ?? 'ถ้าต้องการใช้หน้านี้ ขอให้เจ้าของร้านเป็นคนทำให้ได้เลย',
      viewerLine: who,
    }
  }
  return {
    title: 'หน้านี้ดูได้เฉพาะบางบทบาท',
    body: `เจ้าของร้านและคนที่มีบทบาท ${orList(staff.map((r) => ROLE_LABEL[r]))} เปิดหน้านี้ได้`,
    viewerLine: who ? `${who} · ถ้าต้องการใช้หน้านี้ ขอให้เจ้าของร้านเพิ่มบทบาทให้` : null,
  }
}

/**
 * ป้ายบทบาทในตัวสลับบัญชี (แสดงผลเท่านั้น ไม่ใช่ authz) — เจ้าของ → "เจ้าของ" ; สมาชิก → ชื่อบทบาทคั่น " · "
 * roles = null/ว่าง → ไม่มีป้าย (ผู้เรียกไม่ควรเดาเป็น "ผู้ดูแล")
 */
export function shopRoleBadgeLabel(roles: readonly ShopRole[] | null | undefined, ownerLabel = 'เจ้าของ'): string | null {
  if (!roles || roles.length === 0) return null
  if (roles.includes('OWNER')) return ownerLabel
  return STAFF_ROLES.filter((r) => roles.includes(r)).map((r) => ROLE_LABEL[r]).join(' · ')
}
