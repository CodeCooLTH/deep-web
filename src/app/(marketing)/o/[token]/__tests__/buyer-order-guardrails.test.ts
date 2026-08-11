/**
 * [blocker] ด่านกันพลาดบนหน้าออเดอร์ฝั่งผู้ซื้อ — feature 00041
 *
 * ทั้งหมดมาจาก impeccable critique 2026-08-11 ซึ่งจับได้ในสิ่งที่ `tsc`/build/detector/
 * theme-guard ผ่านหมด เพราะแต่ละจุดเป็นโค้ดที่ถูกต้องตามชนิดทุกตัวอักษร — สิ่งที่ผิดคือความหมาย
 *
 * เทสอ่านซอร์ส เพราะ vitest ของโปรเจกต์ตั้ง `environment: "node"` และรีโปไม่มี jsdom
 * สิ่งที่ต้องกันคือ "มีคนแก้กลับ" ไม่ใช่พฤติกรรม runtime
 *
 * 🛑 แดง = ห้าม merge
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const DIR = join(process.cwd(), 'src/app/(marketing)/o/[token]')

/** ตัดคอมเมนต์ก่อนตรวจ — ไฟล์เหล่านี้อธิบายบั๊กเดิมไว้ในคอมเมนต์ด้วยตัวอักษรเดียวกับที่ห้าม */
function read(rel: string): string {
  return readFileSync(join(DIR, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
}

describe('การยืนยันรับของต้องมีด่านถาม', () => {
  // กดแล้วออเดอร์เป็น CONFIRMED ถาวร ป้อนเข้า Trust Score และซ่อนปุ่มแจ้งปัญหาทิ้ง
  // ขณะที่ "ยกเลิกคำสั่งซื้อ" ซึ่งอยู่ห่างลงไป 5 บรรทัดมี dialog มาตลอด
  it('ปุ่มหลักเปิด dialog ไม่ยิง handleConfirm ตรง ๆ', () => {
    const src = read('OrderDetailMobile.tsx')

    expect(src).toContain('onClick={() => setConfirmDialogOpen(true)}')
    expect(src).not.toMatch(/variant='contained'[\s\S]{0,200}?onClick=\{handleConfirm\}/)
  })

  // ข้อความต้องบอกสิ่งที่ *แลกไป* ไม่ใช่แค่ถามซ้ำว่าแน่ใจไหม
  it('dialog บอกว่ายืนยันแล้วแจ้งปัญหาไม่ได้อีก', () => {
    expect(read('OrderDetailMobile.tsx')).toContain('ยืนยันแล้วจะแจ้งปัญหากับคำสั่งซื้อนี้ไม่ได้อีก')
  })
})

describe('อัปโหลดสลิป', () => {
  // 🛑 เพดานเคยมี 3 ตัวเลขที่ไม่ตรงกันสักตัว: จอเขียน 10MB · client ตัด 5MB ·
  // และเส้นทางจริงเป็น multipart ที่ Vercel ตอบ 413 ที่ 4.5MB ก่อนถึงโค้ดเรา
  it('ไม่ส่งไฟล์ผ่าน body ของ API route อีกแล้ว', () => {
    const src = read('OrderDetailMobile.tsx')

    expect(src).not.toContain('new FormData()')
    expect(src).toContain("uploadFileId(file, 'DOCUMENT')")
  })

  // เลขบนจอต้องมาจากตัวเดียวกับที่ server บังคับ ไม่ใช่ literal ที่พิมพ์ไว้
  it('เพดานที่แสดงอ่านจาก uploadMaxSize ไม่ใช่เลขที่พิมพ์เอง', () => {
    const src = read('OrderDetailMobile.tsx')

    expect(src).toContain("uploadMaxSize('DOCUMENT')")
    expect(src).toContain('{SLIP_MAX_MB}MB')
    expect(src).not.toMatch(/≤\s*\d+MB/)
  })

  // "ลองอีกครั้ง" กับไฟล์ที่ใหญ่เกินคือคำเชิญให้ทำสิ่งที่ไม่มีวันสำเร็จ
  it('แสดงเหตุผลจริงจาก uploadFileId ก่อนข้อความกลาง', () => {
    expect(read('OrderDetailMobile.tsx')).toContain('err instanceof Error ? err.message')
  })
})

describe('แถบ CTA ที่ยึดขอบจอ', () => {
  // (marketing)/layout.tsx ตั้ง viewportFit:'cover' แล้ว env() จึงคืนค่าจริงบนเส้นทางนี้
  // จอที่ล็อกอินแล้วใส่ไว้ถูกมาตลอด แต่จอแรกที่ผู้ซื้อทุกคนเจอกลับไม่มี
  it('ทั้งจอ guest และจอที่ล็อกอินแล้วรับ safe-area inset', () => {
    for (const f of ['GuestOrderView.tsx', 'OrderDetailMobile.tsx']) {
      expect(read(f)).toContain('env(safe-area-inset-bottom)')
    }
  })
})

describe('คำบนหน้าจอ (/impeccable clarify)', () => {
  // 🛑 ปุ่มยิง POST /confirm ทำให้ออเดอร์ CONFIRMED ถาวร — ป้ายที่บอกว่ากำลัง "ยืนยันการชำระเงิน"
  // คือช่องทางของสแกมที่ product นี้มีไว้กัน: ร้านส่งลิงก์ก่อนส่งของ ผู้ซื้อกดเพราะคิดว่ากำลัง
  // ยืนยันการโอนของตัวเอง แล้วทางออก (ปุ่มแจ้งปัญหา) หายไปในหนึ่งแตะ
  it('ป้ายปุ่มหลักไม่อ้างว่าเป็นการยืนยันการชำระเงิน', () => {
    const src = read('OrderDetailMobile.tsx')

    expect(src).not.toContain('ยืนยันการชำระเงิน')
    expect(src).toContain('ยืนยันรับสินค้า')
  })

  // ป้ายต้องบอกผลลัพธ์ ไม่ใช่ท่าทางที่ใช้กด — และห้ามพูดสิ่งเดียวกับปุ่มที่อยู่เหนือมัน 4px
  it('ไม่มีคำอธิบายที่บรรยายท่าทางการกด', () => {
    expect(read('OrderDetailMobile.tsx')).not.toMatch(/แตะเพื่อ/)
  })

  // ระบบเป็นคนพูด ไม่ใช่พนักงานคนหนึ่ง — คำลงท้ายระบุเพศไม่ควรอยู่ในเสียงของระบบ
  it('ไม่มีคำลงท้ายระบุเพศในข้อความของระบบ', () => {
    for (const f of ['PublicOrderClient.tsx', 'OrderDetailMobile.tsx', 'GuestOrderView.tsx']) {
      expect(read(f)).not.toMatch(/ขอบคุณครับ|ขอบคุณค่ะ|นะคะ|นะครับ/)
    }
  })
})

describe('หน้าต่างแก้ไขรีวิว 24 ชม.', () => {
  // ตัวนับถอยหลังเดิมอยู่ในการ์ดรีวิวที่โพสต์แล้วอย่างเดียว = บอกเฉพาะคนที่รู้อยู่แล้ว
  // คนที่เขียนเสร็จแล้วปิดแท็บจะไม่มีทางรู้ว่าเคยมีหน้าต่างนี้
  it('ประกาศตอนกดส่ง ไม่ใช่รอให้ไปเจอในการ์ดหลังโพสต์', () => {
    const src = read('ReviewForm.tsx')

    expect(src).toContain('แก้ไขหรือลบรีวิวได้ภายใน 24 ชั่วโมงหลังส่ง')
    expect(src).toContain('แก้ไขได้ภายใน 24 ชม.')
  })
})
