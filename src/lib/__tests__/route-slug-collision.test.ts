import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] ห้ามมีชื่อ dynamic segment ต่างกันในระดับเดียวกันของ App Router
 *
 * 🛑 เขียนขึ้นหลังเหตุการณ์จริง 2026-08-27: เพิ่ม `api/channels/[channelId]/ice-breakers`
 * ทั้งที่มี `api/channels/[id]` อยู่แล้ว ⇒ Next โยน
 *   `You cannot use different slug names for the same dynamic path ('channelId' !== 'id')`
 * **ตอน runtime ของทุก request** ⇒ `/api/auth/*` · quick-messages · ไฟล์แนบ · wallet
 * ตายพร้อมกันหมด ร้านล็อกอินไม่ได้ ~23 นาทีบน prod จนลูกค้าโทรมาแจ้ง
 *
 * 🛑 **สิ่งที่ทำให้มันหลุดคือ `next build` ผ่าน (exit 0)** — tsc/eslint/เทส 4,326 ตัวเขียวหมด
 * ไม่มีด่านไหนของโปรเจกต์มองเห็นเลย เพราะไม่มีอะไรผิดใน *โค้ด* สิ่งที่ผิดคือ **ชื่อโฟลเดอร์**
 * ⇒ ต้องตรวจที่ระบบไฟล์เท่านั้น
 */
const APP = join(process.cwd(), 'src/app')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    if (name === 'node_modules') continue
    out.push(p)
    walk(p, out)
  }
  return out
}

/** `[id]` และ `[...slug]` นับเป็น dynamic · `(group)` และ `@slot` ไม่นับ (ไม่กินส่วนของ URL) */
const isDynamic = (n: string) => n.startsWith('[') && n.endsWith(']')
const slugName = (n: string) => n.replace(/^\[+\.*\.*\.*|\]+$/g, '').replace(/^\.\.\./, '')

describe('[blocker] App Router — ชื่อ dynamic segment', () => {
  it('ห้ามมีชื่อต่างกันในโฟลเดอร์แม่เดียวกัน', () => {
    const bad: string[] = []
    for (const dir of [APP, ...walk(APP)]) {
      const dyn = readdirSync(dir).filter((n) => {
        try {
          return statSync(join(dir, n)).isDirectory() && isDynamic(n)
        } catch {
          return false
        }
      })
      const names = new Set(dyn.map(slugName))
      if (names.size > 1) {
        bad.push(`${dir.replace(process.cwd() + '/', '')} → ${dyn.join(' , ')}`)
      }
    }
    expect(bad, `\nพบชื่อ slug ชนกัน — Next จะพังทุก request:\n${bad.join('\n')}\n`).toEqual([])
  })
})
