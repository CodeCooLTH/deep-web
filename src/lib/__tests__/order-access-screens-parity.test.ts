import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] จอที่กั้นทางเข้าออเดอร์ ต้องมีทางออกเสมอ
 *
 * ## กฎที่ด่านนี้บังคับ
 *
 * `/o/[token]` มีจอกั้นอยู่ 3 จอ (`ClaimOtpPrompt` · `PhoneVerifyPrompt` · `OrderAccessBlock`)
 * ทั้งสามเป็น **จอเต็มหน้าที่ไม่มีเมนู ไม่มี header** — และ header ของ `FrontLayout`
 * ที่เคยเป็นทางออกถูกถอดออกไปแล้วตั้งแต่ FR-019
 *
 * ⇒ ถ้าจอไหนไม่มีตราแบรนด์ที่กดกลับหน้าแรกได้ **ผู้ซื้อที่มาถึงแล้วไม่อยากกรอกอะไร
 * จะติดตายทั้งจอ** — ซึ่งเป็นบั๊กที่ layout ตัวนั้นถูกสร้างมาแก้พอดี
 *
 * สองจอแรกเพิ่มไว้แล้วพร้อมคอมเมนต์อธิบาย แต่ `OrderAccessBlock` **ตกหล่นจากรอบนั้น**
 * และไม่มีอะไรจับได้เลยจนกว่าจะมีคนเปิดไฟล์ดู — ด่านนี้คือสิ่งที่ทำให้กฎ "บังคับได้"
 * ไม่ใช่แค่ "เขียนไว้ในคอมเมนต์ของไฟล์ที่ทำถูก"
 *
 * 🛑 แดง = ห้าม merge
 */
const DIR = 'src/app/(marketing)/o/[token]'

/** จอกั้นทั้งหมด — เพิ่มจอใหม่ในกลุ่มนี้ต้องเติมที่นี่ด้วย */
const GATE_SCREENS = ['ClaimOtpPrompt.tsx', 'PhoneVerifyPrompt.tsx', 'OrderAccessBlock.tsx'] as const

const codeOf = (f: string) =>
  readFileSync(join(process.cwd(), DIR, f), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

describe('[blocker] จอกั้นทางเข้าออเดอร์', () => {
  it.each(GATE_SCREENS)('%s — ต้องมีตราแบรนด์ที่กดกลับหน้าแรกได้', (file) => {
    const code = codeOf(file)

    expect(code, 'ต้องเรนเดอร์ <Logo />').toMatch(/<Logo\s*\/>/)

    /* 🛑 ต้องเป็น **ลิงก์** ไม่ใช่รูปเฉย ๆ — `Logo.tsx` ไม่มี `href` ในตัวเอง
       รูปที่กดไม่ได้ไม่ใช่ทางออก มันแค่ทำให้จอดูมีแบรนด์ */
    const at = code.indexOf('<Logo')
    const wrapper = code.slice(Math.max(0, at - 300), at)
    expect(wrapper, 'ตราแบรนด์ต้องถูกห่อด้วยลิงก์ไปหน้าแรก').toMatch(/href='\/'/)

    /* และต้องมีชื่อให้ screen reader — ลิงก์ที่มีแต่รูปข้างในไม่มีข้อความให้อ่าน
       (`aria-name-requires-supporting-role.md`: <a> รองรับชื่อจากผู้เขียน จึงใส่ได้จริง) */
    expect(wrapper, 'ลิงก์รูปต้องมี aria-label').toMatch(/aria-label='กลับหน้าแรก'/)
  })

  it('ทุกจอกั้นต้องไม่ทิ้งผู้ใช้ไว้กับข้อความเปล่า ๆ — ต้องมีอย่างน้อยหนึ่งปุ่ม/ลิงก์ที่พาไปที่อื่น', () => {
    for (const f of GATE_SCREENS) {
      const code = codeOf(f)
      const hasWayOut = /<Button/.test(code) || /component=\{Link\}/.test(code) || /<Link/.test(code)
      expect(hasWayOut, `${f} ต้องมีทางออก`).toBe(true)
    }
  })
})
