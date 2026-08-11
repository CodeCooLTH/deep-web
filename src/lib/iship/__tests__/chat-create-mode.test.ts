import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveChatIshipCreateMode } from '@/lib/iship/chat-create-mode'

/**
 * [blocker] โหมดเปิดพัสดุต้องเป็น "ของร้านที่ร่างผูกอยู่" ไม่ใช่ร้านที่ active (feature 00022 × 00037)
 *
 * เดิม `DraftOrderProvider` ถือค่าเดียวทั้งหน้า ⇒ ร่างของร้าน B ใช้โหมดของร้าน A เสมอ
 * (ไม่ใช่บางครั้ง) — เพิ่งเข้าถึงได้จริงหลังปิดบั๊กสร้างออเดอร์ข้ามร้าน 2026-08-11
 */
describe('[blocker] resolveChatIshipCreateMode', () => {
  it('ACTIVE + โหมดที่รู้จัก → คืนโหมดนั้น', () => {
    expect(resolveChatIshipCreateMode({ status: 'ACTIVE', createMode: 'AUTO' })).toBe('AUTO')
    expect(resolveChatIshipCreateMode({ status: 'ACTIVE', createMode: 'ASK' })).toBe('ASK')
    expect(resolveChatIshipCreateMode({ status: 'ACTIVE', createMode: 'OFF' })).toBe('OFF')
  })

  it('ไม่เคยเชื่อม / ถอดแล้ว / token เสีย → OFF (fail-closed)', () => {
    expect(resolveChatIshipCreateMode(null)).toBe('OFF')
    expect(resolveChatIshipCreateMode(undefined)).toBe('OFF')
    expect(resolveChatIshipCreateMode({ status: 'DISCONNECTED', createMode: 'AUTO' })).toBe('OFF')
    expect(resolveChatIshipCreateMode({ status: 'TOKEN_INVALID', createMode: 'AUTO' })).toBe('OFF')
  })

  it('ค่าที่ไม่รู้จักในคอลัมน์ (TEXT ไม่มี CHECK) → OFF ไม่ใช่ปล่อยผ่าน', () => {
    expect(resolveChatIshipCreateMode({ status: 'ACTIVE', createMode: 'SOMETHING_NEW' })).toBe('OFF')
    expect(resolveChatIshipCreateMode({ status: 'ACTIVE', createMode: '' })).toBe('OFF')
  })
})

/**
 * ด่านกัน drift ระหว่าง 2 ทางเข้า — SDS ของ 00037 §4 เตือนไว้ตรง ๆ ว่าข้อมูลรายร้านที่เพิ่มใหม่
 * ต้องเพิ่ม **ทั้งใน `shop-context` route และใน seed ของ layout** ไม่งั้นร้าน active กับร้านอื่น
 * ได้ค่าคนละแบบ — ซึ่งเป็นบั๊กที่ไม่มี tsc/เทสหน่วยไหนจับได้เลยเพราะทั้งสองฝั่ง "ถูก" ในตัวเอง
 */
describe('[blocker] ทั้งสองทางเข้าต้องคำนวณโหมดด้วย SSOT ตัวเดียวกัน', () => {
  const files = [
    'src/app/(paces)/seller/(chat)/layout.tsx',
    'src/app/api/chat/shop-context/route.ts',
  ]

  it.each(files)('%s เรียก resolveChatIshipCreateMode จริง', (file) => {
    const src = readFileSync(file, 'utf8')
    // 🛑 ต้องจับ "การเรียก" (มีวงเล็บ) ไม่ใช่แค่ชื่อที่โผล่ในบรรทัด import — เวอร์ชันแรกของเทสนี้
    // เช็คแค่ชื่อ แล้วพิสูจน์ด้วย mutation ว่ามันเขียวอยู่ทั้งที่โค้ดถูกเปลี่ยนเป็นค่าคงที่ 'OFF'
    // (เทสที่ยืนยันสิ่งที่ไม่ใช่พฤติกรรม = เทสที่เขียวตลอดกาล)
    expect(src).toContain('resolveChatIshipCreateMode(')
    // และต้องเป็นตัวที่ถูกเอาไปใช้จริง ไม่ใช่เรียกทิ้งไว้เฉย ๆ
    expect(src).toMatch(/ishipCreateMode\s*[:=]\s*resolveChatIshipCreateMode\(/)
  })
})
