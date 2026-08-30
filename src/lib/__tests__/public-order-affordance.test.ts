import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] ทุกอย่างที่กดได้บน `/o/[token]` ต้อง **ดูออกว่ากดได้ และบอกว่าจะเกิดอะไร**
 *
 * หัวหน้าสั่งไว้ตรง ๆ (2026-08-30): "ให้เขารู้แต่ละปุ่ม แต่ละที่ทำไร ให้ครบ"
 *
 * "มีป้ายกำกับ" ไม่พอ — สิ่งที่ต้องรู้คือ *กดแล้วเกิดอะไร* โดยเฉพาะสองอย่างที่
 * ผู้ซื้อกู้คืนเองไม่ได้: **เด้งออกจากหน้าออเดอร์** และ **ออกไปเว็บอื่น**
 *
 * 🛑 แดง = ห้าม merge
 */
const strip = (raw: string) =>
  raw
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const page = strip(
  readFileSync(join(process.cwd(), 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'), 'utf8'),
)
const channels = strip(
  readFileSync(join(process.cwd(), 'src/views/pages/user-profile/v2/OfficialChannels.tsx'), 'utf8'),
)

describe('[blocker] ห้ามมีลิงก์ล่องหน', () => {
  it('ชื่อร้านต้องไม่เป็นลิงก์ — มันหน้าตาเหมือนหัวเรื่องทุกประการ', () => {
    /* 🛑 เดิมเป็นลิงก์ที่ `textDecoration:'none'` + `color:'text.primary'` ⇒ กดโดนตอนเลื่อนหน้า
       แล้วเด้งออกจากหน้าออเดอร์โดยไม่รู้เพราะอะไร · ตอนนี้มีทางเข้าที่มีป้ายบอกแล้ว
       ("ดูโปรไฟล์ร้าน ›") ลิงก์ล่องหนจึงไม่ได้เพิ่มอะไรนอกจากการกดผิด */
    const at = page.indexOf('{order.shop.shopName}')
    expect(at, 'ต้องมีชื่อร้าน').toBeGreaterThan(-1)
    const block = page.slice(page.lastIndexOf('<Typography', at), at)
    expect(block, 'ชื่อร้านต้องไม่ใช่ลิงก์').not.toMatch(/component=\{Link\}/)
    expect(block, 'และต้องไม่มี href').not.toMatch(/href=/)
  })

  it('ทางเข้าโปรไฟล์ที่เหลือต้องยังอยู่ และมองเห็นได้', () => {
    /* ถอดลิงก์ล่องหนออกได้ก็ต่อเมื่อยังมีทางเข้าที่ **มีป้าย** อยู่ —
       ไม่งั้นกลายเป็นการตัดทางเข้าทิ้ง (`rule-must-be-enforced-not-described.md`) */
    const at = page.indexOf('ดูโปรไฟล์ร้าน')
    expect(at, 'ต้องมีปุ่มดูโปรไฟล์ร้าน').toBeGreaterThan(-1)
    const btn = page.lastIndexOf('<Button', at)
    expect(btn).toBeGreaterThan(-1)
    expect(page.slice(btn, at), 'ต้องชี้ไปโปรไฟล์ร้านจริง').toMatch(
      /href=\{`\/u\/\$\{order\.shop\.user\.username\}`\}/,
    )
  })

  it('ปุ่มดูโปรไฟล์ต้องมีลูกศร — ภาษาของ "ไปที่อื่น"', () => {
    /* ผ่านมา 3 ท่าแล้วที่มันถูกทำให้หน้าตาเหมือนของรอบข้าง (ช่องกรอก / ป้าย)
       ลูกศรคือสิ่งที่ทำให้มันอ่านเป็น "การไปที่อื่น" โดยไม่ต้องยืมรูปทรงจากใคร */
    const at = page.indexOf('ดูโปรไฟล์ร้าน')
    expect(page.slice(Math.max(0, at - 700), at), 'ต้องมี endIcon เป็นลูกศร').toMatch(
      /endIcon=\{<Icon icon='tabler-chevron-right'/,
    )
  })
})

describe('[blocker] ลิงก์ที่ออกนอกเว็บต้องบอกก่อนกด', () => {
  it('ลิงก์ช่องทางต้องมีไอคอน external ที่ *มองเห็น* ไม่ใช่มีแต่ aria-label', () => {
    /* ลิงก์นี้เปิดแท็บใหม่ไปเว็บของ Meta/LINE — `aria-label` บอก screen reader อยู่แล้ว
       ที่ขาดคือคนที่ **มองเห็น** ⇒ ต้องมีทั้งคู่ ไม่ใช่อย่างใดอย่างหนึ่ง

       🛑 **ผูกกับกฎ ไม่ใช่กับลิงก์ตัวแรก** — `ChannelStrip` มี 2 โหมดแล้ว (`strip` · `rows`)
       ร่างเดิมไล่จาก `aria-label` ตัวแรกไปถึง `</a>` ⇒ พอเพิ่มโหมดที่สอง มันไปเจอโหมดใหม่
       ที่ประกอบเนื้อในไว้ก่อน (`const inner`) แล้วแดงทั้งที่ไอคอนอยู่ครบทั้งสองโหมด
       กฎที่ต้องบังคับคือ **ทุกลิงก์ที่เปิดแท็บใหม่ ต้องมีเครื่องหมายที่มองเห็น** */
    /**
     * 🛑 **ยกเว้นโหมด `logos`** — โหมดนั้นไม่มีข้อความบนจอเลย ตัวควบคุมทั้งอันคือ
     * **โลโก้แพลตฟอร์ม** ซึ่งบอกอยู่ในตัวว่ากดแล้วไปไหน (โลโก้ Facebook = ไป Facebook)
     * เติมไอคอน ↗ ทับโลโก้อีกชั้น = พูดซ้ำในพื้นที่ที่มีอยู่เพื่อ *ไม่* ใส่ข้อความ
     * ⇒ สัญญาของโหมดนี้คือ tooltip + `aria-label` ซึ่งตรวจแยกด้านล่าง
     *
     * ที่เหลือ (`strip`/`rows`) เป็นลิงก์ที่มี **ข้อความ** ⇒ กฎเดิมบังคับเต็ม
     */
    const logosAt = channels.indexOf("if (variant === 'logos')")
    const logosEnd = channels.indexOf("if (variant === 'rows')", logosAt)
    expect(logosAt, 'ต้องมีโหมด logos').toBeGreaterThan(-1)
    expect(logosEnd, 'ต้องหาจุดจบของโหมด logos ได้').toBeGreaterThan(logosAt)
    const logosBlock = channels.slice(logosAt, logosEnd)
    const rest = channels.slice(0, logosAt) + channels.slice(logosEnd)

    const blanks = [...rest.matchAll(/target='_blank'/g)].length
    /* นับ `external-link` ไม่เจาะจงชุดไอคอน — ไฟล์นี้ใช้ทั้ง `tabler-` และ `lucide:` ซึ่งถูกทั้งคู่ */
    const icons = [...rest.matchAll(/external-link/g)].length
    expect(blanks, 'ต้องมีลิงก์ที่เปิดแท็บใหม่').toBeGreaterThan(0)
    expect(icons, 'ไอคอน external ต้องมีอย่างน้อยเท่าจำนวนลิงก์ที่เปิดแท็บใหม่').toBeGreaterThanOrEqual(
      blanks,
    )

    /* โหมด logos: ไม่มีข้อความ ⇒ ต้องมี tooltip + aria-label ที่บอกปลายทางแทน */
    expect(logosBlock, 'โหมด logos ต้องมี tooltip').toContain('<Tooltip')
    expect(logosBlock, 'โหมด logos ต้องบอกปลายทางใน aria-label').toContain('เปิด ')
  })

  it('ไอคอน external ต้อง aria-hidden — ไม่งั้น screen reader อ่านซ้ำ', () => {
    const at = channels.indexOf('tabler-external-link')
    expect(channels.slice(at, at + 220)).toMatch(/aria-hidden='true'/)
  })

  it('ลิงก์ภายนอกทุกตัวต้องมี rel กันช่องโหว่ tabnabbing', () => {
    for (const m of channels.matchAll(/target='_blank'/g)) {
      expect(channels.slice(m.index, m.index + 90), "target=_blank ต้องคู่กับ rel").toMatch(
        /rel='noopener noreferrer'/,
      )
    }
  })
})
