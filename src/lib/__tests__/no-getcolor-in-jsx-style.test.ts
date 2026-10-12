import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { colorVar } from '@/utils/helpers'

/**
 * getColor ห้ามอยู่ใน style ของ JSX — บนเซิร์ฟเวอร์คืนสีสำรอง rgba(0,0,0,0.2) แต่เบราว์เซอร์คืนสีจริง
 * ⇒ hydration mismatch (จุด legend ของ SalesChannelDonut/ProvinceSalesMap บนแดชบอร์ดคอม 2026-10-12)
 * ใช้ colorVar (var(--color-…) สตริงเดียวกันทั้งสองฝั่ง) · getColor ใช้ได้กับ option ของกราฟเท่านั้น
 */
const ROOTS = ['src/app/(paces)', 'src/components/safepay']

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : tsxFiles(p)
    return p.endsWith('.tsx') ? [p] : []
  })
}

/** เนื้อใน style={{ … }} ทุกก้อน (นับวงเล็บปีกกาจนปิด) */
function styleBlocks(src: string): string[] {
  const out: string[] = []
  let i = src.indexOf('style={{')
  while (i !== -1) {
    let depth = 0
    let j = i + 'style='.length
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) break
    }
    out.push(src.slice(i, j + 1))
    i = src.indexOf('style={{', j)
  }
  return out
}

describe('สีใน style ของ JSX ต้องไม่ต่างกันระหว่างเซิร์ฟเวอร์กับเบราว์เซอร์', () => {
  it('[blocker] ไม่มี getColor( / colorOf( ใน style={{ … }} ของ (paces) และ components/safepay', () => {
    const hits = ROOTS.flatMap((root) =>
      tsxFiles(root).flatMap((f) =>
        styleBlocks(readFileSync(f, 'utf8'))
          .filter((b) => /\bgetColor\(|\bcolorOf\(/.test(b))
          .map((b) => `${f}: ${b.replace(/\s+/g, ' ').slice(0, 80)}`),
      ),
    )
    expect(hits).toEqual([])
  })

  it('colorVar อ่าน token ชุดเดียวกับ getColor (--color-…) และมีสีสำรองเดียวกัน', () => {
    expect(colorVar('chart-primary')).toBe('var(--color-chart-primary, rgba(0,0,0,0.2))')
  })
})
