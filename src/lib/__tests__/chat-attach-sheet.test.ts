import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldShowAttachPreviewSheet } from '../chat-attach-sheet'

describe('shouldShowAttachPreviewSheet', () => {
  it('[blocker] เปิดเมื่อครบทั้ง 3 เงื่อนไข', () => {
    expect(
      shouldShowAttachPreviewSheet({ isMobileComposer: true, requestedOpen: true, pendingCount: 3 }),
    ).toBe(true)
  })

  it('[blocker] เดสก์ท็อป/แท็บเล็ตไม่เปิดชีตเลย — ต้องได้แถบ thumbnail เดิมทุกประการ', () => {
    expect(
      shouldShowAttachPreviewSheet({ isMobileComposer: false, requestedOpen: true, pendingCount: 3 }),
    ).toBe(false)
  })

  it('[blocker] คิวถูกเติมโดยที่ผู้ใช้ไม่ได้เพิ่มไฟล์เอง (ข้อความสำเร็จรูปที่มีรูป / เลือกสินค้า) ต้องไม่เปิด', () => {
    // นี่คือเหตุผลทั้งหมดที่ requestedOpen มีอยู่ — สองเส้นทางนั้นเติมช่องพิมพ์ด้วย
    // ชีตเต็มจอจะบังข้อความที่เพิ่งเติมไปพอดี
    expect(
      shouldShowAttachPreviewSheet({ isMobileComposer: true, requestedOpen: false, pendingCount: 4 }),
    ).toBe(false)
  })

  it('[blocker] ลบไฟล์จนเหลือ 0 → ปิดเอง (ห้ามค้างเป็นจอเปล่ากับปุ่ม "ส่ง 0 รายการ")', () => {
    expect(
      shouldShowAttachPreviewSheet({ isMobileComposer: true, requestedOpen: true, pendingCount: 0 }),
    ).toBe(false)
  })

  it('ไฟล์ใบเดียวก็เปิด — ไม่มีเกณฑ์ขั้นต่ำซ่อนอยู่', () => {
    expect(
      shouldShowAttachPreviewSheet({ isMobileComposer: true, requestedOpen: true, pendingCount: 1 }),
    ).toBe(true)
  })
})

describe('[blocker] ผู้เรียกต้องใช้ฟังก์ชันนี้ ไม่ใช่เขียนเงื่อนไขซ้ำใน JSX', () => {
  // สแกนซอร์สจริง ไม่ใช่รายชื่อไฟล์ — กันคนกลับไปเขียน `pendingImages.length > 0 && ...` ในเทอร์นารี
  // ซึ่งเป็นรูปแบบที่ผ่าน tsc/build/eslint/theme-guard ได้ทั้งหมดแม้เขียนกลับด้าน
  const src = readFileSync(
    join(
      process.cwd(),
      'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx',
    ),
    'utf8',
  )

  it('ChatThread เรียก shouldShowAttachPreviewSheet เพื่อตัดสินการแสดงชีต', () => {
    expect(src).toContain('shouldShowAttachPreviewSheet(')
    expect(src).toContain("from '@/lib/chat-attach-sheet'")
  })

  it('AttachmentPreviewSheet ถูกเรนเดอร์หลังเงื่อนไขนั้นเท่านั้น', () => {
    // ต้องไม่มีการเรนเดอร์ชีตที่ไม่ได้ผ่านฟังก์ชัน — จับที่บรรทัดเปิดแท็ก
    const renderIdx = src.indexOf('<AttachmentPreviewSheet')
    expect(renderIdx).toBeGreaterThan(-1)
    const guardIdx = src.lastIndexOf('shouldShowAttachPreviewSheet(', renderIdx)
    expect(guardIdx).toBeGreaterThan(-1)
    // เงื่อนไขต้องอยู่ติดกับการเรนเดอร์ ไม่ใช่คนละที่กันคนละพันบรรทัด
    expect(renderIdx - guardIdx).toBeLessThan(400)
  })
})
