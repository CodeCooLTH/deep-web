/**
 * [blocker] กันลูป "ยิง API ไม่หยุด" ที่เกิดจากการเอาค่าที่ `useListBusy()` คืน ไปใส่ dep array
 *
 * เหตุการณ์จริง 2026-08-09 (user เจอเองบน prod): `/inbox/comments` ยิง
 * `GET /api/chat/comments/posts` รัวไม่หยุด เพราะ effect ที่ดึงรายการเขียน deps ไว้ว่า
 *
 *     }, [channelId, show.postStatus, channelTab, refreshPosts, listBusy])
 *
 * `useListBusy()` คืน object literal ใหม่ทุก render (`return { busy, run, begin }`) ซึ่งไม่มีวัน
 * เท่ากับของ render ก่อนตาม Object.is → fetch เสร็จ → setState → re-render → อ็อบเจกต์ใหม่ →
 * effect รันใหม่ → fetch อีก วนเร็วเท่า round-trip
 *
 * ทำไมต้องเป็นเทสที่อ่าน "ซอร์ส" ไม่ใช่เทสที่ render hook จริง: โปรเจกต์นี้ตั้ง vitest
 * `environment: "node"` และไม่มี `@testing-library/react`/jsdom ในดีเพนเดนซี — การพิสูจน์
 * referential stability ต้อง render จริงถึงจะวัดได้ ซึ่งทำที่นี่ไม่ได้โดยไม่เพิ่มดีเพนเดนซีชุดใหญ่
 * สิ่งที่ตรวจได้จริงและตรงกับต้นเหตุคือ **รูปร่างของ dep array** จึงตรวจตรงนั้น
 *
 * 🛑 เทสนี้แดง = มีคนกำลังจะปล่อยลูปเดิมกลับขึ้น prod ห้าม merge — แก้ด้วยการดึงเฉพาะ
 * `begin`/`run` (ทั้งคู่เป็น `useCallback` ที่เสถียร) ออกมาใส่ deps แทนอ็อบเจกต์ทั้งก้อน
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue
      walk(full, out)
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/** ไฟล์ทุกไฟล์ที่เรียก `useListBusy(` — ตัวหน้าจอที่เสี่ยงกับลูปนี้ทั้งหมด (ไม่ hardcode รายชื่อ
    เพราะหน้าใหม่ที่หยิบ hook นี้ไปใช้ทีหลังต้องถูกตรวจด้วยโดยไม่มีใครต้องมาแก้เทส) */
function filesUsingListBusy(): string[] {
  return walk(SRC_ROOT).filter((f) => /\buseListBusy\s*\(/.test(readFileSync(f, 'utf8')))
}

/** ชื่อตัวแปรที่รับค่าจาก `useListBusy()` เช่น `const listBusy = useListBusy()` → "listBusy" */
function busyVarNames(source: string): string[] {
  const names: string[] = []
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*useListBusy\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) names.push(m[1])
  return names
}

/** dep array ทุกก้อนในไฟล์ — จับรูป `}, [ ... ])` ที่ปิดท้าย useEffect/useCallback/useMemo */
function depArrays(source: string): string[] {
  const out: string[] = []
  const re = /\}\s*,\s*\[([^\]]*)\]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.push(m[1])
  return out
}

describe('[blocker] useListBusy — ค่าที่คืนต้องไม่ถูกใส่ใน dep array ทั้งก้อน', () => {
  it('มีหน้าที่ใช้ useListBusy อยู่จริงอย่างน้อย 1 หน้า (กันเทสเขียวเพราะไม่เจออะไรเลย)', () => {
    // ถ้า hook ถูกลบ/เปลี่ยนชื่อ เทสข้างล่างจะเขียวตลอดโดยไม่ตรวจอะไร — ด่านนี้ทำให้รู้ตัว
    expect(filesUsingListBusy().length).toBeGreaterThan(0)
  })

  it('ไม่มีไฟล์ไหนใส่ตัวแปรของ useListBusy() ลง dep array', () => {
    const offenders: string[] = []
    for (const file of filesUsingListBusy()) {
      const source = readFileSync(file, 'utf8')
      const names = busyVarNames(source)
      if (names.length === 0) continue
      for (const deps of depArrays(source)) {
        // เทียบเป็น "ตัวระบุทั้งตัว" — `listBusy.begin` / `beginBusy` ต้องไม่ถูกนับว่าผิด
        const idents = deps.match(/[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/g) ?? []
        for (const ident of idents) {
          if (names.includes(ident.trim())) {
            offenders.push(`${file.replace(process.cwd() + '/', '')} → deps [${deps.trim()}]`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
