/**
 * no-permission-copy — ข้อความการ์ด "ไม่มีสิทธิ์" (00071 P3 · UX spec §1)
 * ทดสอบทุก capability จริงจากตารางสิทธิ์ (ไม่ใช่ตัวอย่างที่เลือกมา) — เพิ่ม capability แล้วลืมข้อความ = ห้ามสตริงต้องห้ามหลุด/กรณีผิด
 */
import { describe, expect, it } from 'vitest'
import { FINANCE_NO_PERMISSION_DETAIL, noPermissionCopy, shopRoleBadgeLabel } from '@/lib/no-permission-copy'
import { CAPABILITY_ROLES, PRIMARY_OWNER_ONLY, STAFF_ROLES, type Capability, type ShopRole } from '@/lib/shop-permissions'

const CAPS = Object.keys(CAPABILITY_ROLES) as Capability[]
const FORBIDDEN = ['ไม่สามารถ', 'คุณไม่มีสิทธิ์', 'พนักงาน']
const staffOf = (c: Capability) => STAFF_ROLES.filter((r) => CAPABILITY_ROLES[c].has(r))
const VIEWERS: ShopRole[][] = [[], ['OWNER'], ['CHAT'], ['MANAGER', 'CHAT'], ['MANAGER', 'CHAT', 'TECHNICIAN']]

describe('noPermissionCopy', () => {
  it.each(CAPS)('%s: ไม่มีสตริงต้องห้าม ทุกชุดผู้ดู · ไม่ว่าง', (cap) => {
    for (const viewerRoles of VIEWERS) {
      const c = noPermissionCopy({ capability: cap, viewerRoles, detail: 'x' })
      const all = [c.title, c.body, c.viewerLine ?? ''].join('\n')
      for (const bad of FORBIDDEN) expect(all, `${cap} ${bad}`).not.toContain(bad)
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.body.length).toBeGreaterThan(0)
    }
  })

  it.each(CAPS)('%s: กรณีตรงตารางสิทธิ์ (T4 / เจ้าของล้วน / บางบทบาท)', (cap) => {
    const c = noPermissionCopy({ capability: cap, viewerRoles: ['CHAT'] })
    if (PRIMARY_OWNER_ONLY.has(cap)) expect(c.title).toBe('หน้านี้ดูได้เฉพาะเจ้าของหลักของร้าน')
    else if (staffOf(cap).length === 0) expect(c.title).toBe('หน้านี้ดูได้เฉพาะเจ้าของร้าน')
    else expect(c.title).toBe('หน้านี้ดูได้เฉพาะบางบทบาท')
  })

  it('เจ้าของล้วน + detail: ใช้ประโยคเดิมของหน้า (การเงิน P1 ไม่เปลี่ยนสักตัวอักษร) + บรรทัดผู้ดู', () => {
    const c = noPermissionCopy({ capability: 'F1', viewerRoles: ['MANAGER'], detail: FINANCE_NO_PERMISSION_DETAIL })
    expect(c).toEqual({
      title: 'หน้านี้ดูได้เฉพาะเจ้าของร้าน',
      body: 'ข้อมูลการเงินของร้านเปิดให้เจ้าของร้านเท่านั้น ถ้าต้องการตัวเลขส่วนนี้ ขอจากเจ้าของร้านได้โดยตรง',
      viewerLine: 'บทบาทของคุณตอนนี้: ผู้ดูแล',
    })
  })

  it('เจ้าของล้วน ไม่มี detail: ประโยคกลาง', () => {
    expect(noPermissionCopy({ capability: 'F3', viewerRoles: [] }).body).toBe('ถ้าต้องการใช้หน้านี้ ขอให้เจ้าของร้านเป็นคนทำให้ได้เลย')
  })

  it('T4: ประโยคเป็นกลาง ใช้ได้ทุกบทบาท (ไม่พูดถึง "เจ้าของร่วม" กับคนที่ไม่ใช่)', () => {
    const body = 'หน้านี้เปิดได้เฉพาะเจ้าของหลักของร้าน (ผู้ถือแพ็กเกจ) ถ้าต้องการใช้ ขอให้เจ้าของหลักเป็นคนทำ'
    expect(noPermissionCopy({ capability: 'T4', viewerRoles: ['OWNER'] })).toEqual({
      title: 'หน้านี้ดูได้เฉพาะเจ้าของหลักของร้าน',
      body,
      viewerLine: 'บทบาทของคุณตอนนี้: เจ้าของร้าน',
    })
    for (const v of VIEWERS) expect(noPermissionCopy({ capability: 'T4', viewerRoles: v }).body).not.toContain('เจ้าของร่วม')
  })

  it('บางบทบาท: {list} 1/2/3 ตัว ตามตารางจริง และบรรทัดผู้ดูต่อท้ายคำแนะนำ', () => {
    // H3 = [O,M] → ผู้ดูแล 1 ตัว ; S1 = [O,M,C] → 2 ; Q1 = [O,M,C,B,T] → 4
    expect(noPermissionCopy({ capability: 'F4', viewerRoles: [] }).body).toBe('เจ้าของร้านและคนที่มีบทบาท ผู้ดูแล เปิดหน้านี้ได้')
    expect(noPermissionCopy({ capability: 'H1', viewerRoles: [] }).body).toBe('เจ้าของร้านและคนที่มีบทบาท ผู้ดูแลหรือตอบแชท เปิดหน้านี้ได้')
    expect(noPermissionCopy({ capability: 'O2s', viewerRoles: [] }).body).toBe('เจ้าของร้านและคนที่มีบทบาท ผู้ดูแล ตอบแชท หรือเปิดบิล เปิดหน้านี้ได้')
    const c = noPermissionCopy({ capability: 'H1', viewerRoles: ['TECHNICIAN', 'BILLING'] })
    expect(c.viewerLine).toBe('บทบาทของคุณตอนนี้: ฝ่ายช่าง และ เปิดบิล · ถ้าต้องการใช้หน้านี้ ขอให้เจ้าของร้านเพิ่มบทบาทให้')
  })

  it('ผู้ดูไม่มีบทบาท = ไม่แสดงบรรทัดผู้ดู', () => {
    for (const cap of ['F1', 'T4', 'H1'] as Capability[]) expect(noPermissionCopy({ capability: cap, viewerRoles: [] }).viewerLine).toBeNull()
  })

  it('ผู้ดู 3 บทบาท: คั่นด้วย ", " และ "และ" ก่อนตัวสุดท้าย', () => {
    expect(noPermissionCopy({ capability: 'F1', viewerRoles: ['MANAGER', 'CHAT', 'BILLING'] }).viewerLine).toBe('บทบาทของคุณตอนนี้: ผู้ดูแล, ตอบแชท และ เปิดบิล')
  })
})

describe('shopRoleBadgeLabel (ป้ายตัวสลับบัญชี · แสดงผลเท่านั้น)', () => {
  it('null/ว่าง → ไม่มีป้าย (ห้ามเดาเป็น "ผู้ดูแล")', () => {
    expect(shopRoleBadgeLabel(null)).toBeNull()
    expect(shopRoleBadgeLabel(undefined)).toBeNull()
    expect(shopRoleBadgeLabel([])).toBeNull()
  })
  it('OWNER → เจ้าของ (หรือคำที่ผู้เรียกส่งมา เช่น EN)', () => {
    expect(shopRoleBadgeLabel(['OWNER'])).toBe('เจ้าของ')
    expect(shopRoleBadgeLabel(['OWNER'], 'Owner')).toBe('Owner')
  })
  it('สมาชิก: ชื่อบทบาทจริง ไม่ใช่ "ผู้ดูแล" ทุกคน · หลายบทบาทเรียงตามตาราง', () => {
    expect(shopRoleBadgeLabel(['TECHNICIAN'])).toBe('ฝ่ายช่าง')
    expect(shopRoleBadgeLabel(['BILLING'])).toBe('เปิดบิล')
    expect(shopRoleBadgeLabel(['MANAGER'])).toBe('ผู้ดูแล')
    expect(shopRoleBadgeLabel(['TECHNICIAN', 'CHAT'])).toBe('ตอบแชท · ฝ่ายช่าง')
  })
})
