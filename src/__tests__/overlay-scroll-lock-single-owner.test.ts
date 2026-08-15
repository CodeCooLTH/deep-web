/**
 * ล็อก scroll ต้องมี "เจ้าของเดียว" — ห้ามเรียก `useLockBodyScroll` ในไฟล์ที่ใช้ overlay ของ MUI
 *
 * ## บั๊กที่กันอยู่ (เกิดจริงบน prod 2026-08-15 — user เจอเอง)
 *
 * หน้าโปรไฟล์สาธารณะ `/b/[slug]` + `/u/[username]`: กด "ดูเหรียญทั้งหมด" หรือ "ดูเพจทางการ
 * ทั้งหมด" แล้วปิด ⇒ **หน้าเลื่อนไม่ได้อีกเลยจนกว่าจะรีโหลด** (`<body style="overflow:hidden">`
 * ค้างถาวร)
 *
 * ต้นเหตุคือ **ตัวล็อกสองตัวเก็บ snapshot ของกันและกัน** ไม่ใช่ตัวใดตัวหนึ่งเขียนโค้ดผิด:
 *
 *   เปิด:  useLockBodyScroll (effect ของ component)  → จำ body.overflow=''      → เขียน 'hidden'
 *          MUI ModalManager (effect ของ <Dialog>)     → จำ body.overflow='hidden' ← ค่าของเรา!
 *   ปิด:   useLockBodyScroll cleanup (ทันที)          → คืน ''                    ✅ ถูก
 *          MUI restore (หลัง transition จบ ~1 วิ)      → คืน 'hidden'              ❌ ทับกลับ
 *
 * MUI เขียน `restoreStyle` ตอน mount ว่า "ค่าเดิมของ body คืออะไร" — ถ้าเราล็อกไปก่อน ค่าเดิม
 * ในสายตามันคือ `hidden` มันจึง "คืนค่า" เป็น hidden แล้วไม่มีใครมาลบให้อีก
 * (`@mui/material/Modal/ModalManager.js` → `handleContainer()` / `restore()`)
 *
 * 🛑 **ไม่มี gate ไหนของโปรเจกต์จับได้เลย** — `tsc`/build/eslint/theme-guard ผ่านหมด เพราะโค้ด
 * ทั้งสองฝั่งถูกต้องในตัวเอง สิ่งที่ผิดคือ *การมีสองเจ้าของ* และคอมเมนต์ที่เขียนกำกับไว้เองใน
 * `BadgeShowcase.tsx` ว่า "MUI Dialog สั่งให้อยู่แล้ว แต่เรียกซ้ำไม่เสียหาย" คือคำที่ผิด
 * (คลาสเดียวกับ Hard Rule 16: ข้อความที่อ้างพฤติกรรมโค้ดต้องยืนยันกับโค้ดก่อนเชื่อ)
 *
 * ## เขียนให้ถูกยังไง
 *
 * - overlay ที่ขับด้วยไลบรารีที่ล็อกเอง (**MUI `Dialog`/`Drawer`/`Modal`/`Popover`/`Menu`**,
 *   Preline `HSOverlay`) → **ไม่ต้องเรียก `useLockBodyScroll`** ไลบรารีจัดการให้ครบแล้ว
 * - overlay ที่ **ประกอบเองด้วย React state** (`fixed inset-0` + portal) → เรียกได้ตามปกติ
 *   นั่นคือเหตุผลเดียวที่ hook นี้มีอยู่ (`ProfileLightbox.tsx` เป็นตัวอย่างที่ถูก)
 * - อยากได้ทั้งสองอย่าง (ล็อกระดับ `<html>` แบบ iOS + overlay ของ MUI) → ต้องส่ง
 *   `disableScrollLock` ให้ MUI ด้วย เพื่อให้เหลือเจ้าของเดียว **ห้ามปล่อยให้ล็อกซ้อนกันเฉย ๆ**
 *
 * ดู `docs/conventions/overlay-scroll-lock.md`
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

/** overlay ของ MUI ที่วิ่งผ่าน `Modal` ทั้งหมด — ทุกตัวสั่ง scroll lock ของตัวเองเสมอ */
const MUI_OVERLAY_IMPORT = /@mui\/material\/(Dialog|Modal|Drawer|SwipeableDrawer|Popover|Menu)\b/

/** ต้อง match "การเรียกใช้" (`useLockBodyScroll(`) ไม่ใช่แค่ชื่อ — บรรทัด import ก็มีชื่อนี้ */
const LOCK_HOOK_CALL = /\buseLockBodyScroll\s*\(/

/**
 * ตัดคอมเมนต์ทิ้งก่อนสแกน
 *
 * 🛑 จำเป็น: ไฟล์ที่ทำ **ถูก** กฎนี้คือไฟล์ที่มักเขียนคอมเมนต์อธิบายกฎนี้ไว้ (hook เองก็เขียน
 * คำเตือนไว้บนหัวไฟล์) ⇒ gate ที่สแกนซอร์สดิบจะแดงค้างกับไฟล์ที่ไม่มีการละเมิดเลย
 * (บทเรียนเดียวกับ grep gate ของ Hard Rule 9 ที่ match คำเปล่า ๆ 2026-08-02→03)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue
      walk(full, out)
    } else if (name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('[blocker] scroll lock ต้องมีเจ้าของเดียว', () => {
  const files = walk(SRC)

  it('มีไฟล์ให้สแกนจริง (กันเทสเขียวเพราะ walk พัง)', () => {
    expect(files.length).toBeGreaterThan(300)
  })

  it('เห็นทั้งสองแพตเทิร์นในรีโปจริง (กันเทสเขียวเพราะ regex ไม่เคย match อะไรเลย)', () => {
    const sources = files.map((f) => stripComments(readFileSync(f, 'utf8')))

    expect(sources.some((s) => MUI_OVERLAY_IMPORT.test(s))).toBe(true)
    expect(sources.some((s) => LOCK_HOOK_CALL.test(s))).toBe(true)
  })

  it('ไม่มีไฟล์ไหนเรียก useLockBodyScroll พร้อมกับใช้ overlay ของ MUI', () => {
    const offenders = files.filter((f) => {
      const src = stripComments(readFileSync(f, 'utf8'))
      return LOCK_HOOK_CALL.test(src) && MUI_OVERLAY_IMPORT.test(src)
    })

    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, '')),
      'overlay ของ MUI ล็อก scroll ให้อยู่แล้ว — ล็อกซ้อนทำให้ body ค้าง overflow:hidden ถาวรหลังปิด (ดูหัวไฟล์เทสนี้)',
    ).toEqual([])
  })
})
