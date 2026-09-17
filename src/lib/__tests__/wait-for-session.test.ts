/**
 * [blocker] ล็อกอินด้วยรหัสผ่านแล้วต้องเข้าได้เลย ไม่ต้องรีเฟรชเอง (2026-09-17)
 *
 * ## อาการจริง
 *
 * ล็อกอิน `appreview` (username+password) → **ไม่พาเข้าไป ต้องรีเฟรชเอง**
 *
 * `signIn(..., { redirect: false })` คืน `ok: true` ทันทีที่เซิร์ฟเวอร์ยอมรับรหัสผ่าน
 * — **ไม่ได้แปลว่าเบราว์เซอร์เก็บคุกกี้ลงแล้ว** ⇒ `router.push` ที่ตามมาทันทีอาจยิงคำขอ
 * ที่ยังไม่มีคุกกี้ ⇒ proxy เตะกลับ · ตระกูลเดียวกับบั๊ก Apple (#66) คนละทางเข้า
 */
import { describe, expect, it, vi } from 'vitest'

import { waitForSession } from '@/lib/wait-for-session'

const noSleep = async () => {}

describe('[blocker] รอจนเห็น session ก่อนพาไปหน้าถัดไป', () => {
  it('เห็นตั้งแต่ครั้งแรก → ไม่ถามซ้ำ', async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: 'u1' } })
    await expect(waitForSession(getSession, { sleep: noSleep })).resolves.toBe(true)
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('🛑 ครั้งแรกยังไม่เห็น → ต้องถามซ้ำ ไม่ใช่ยอมแพ้ทันที', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ user: { id: 'u1' } })
    await expect(waitForSession(getSession, { sleep: noSleep })).resolves.toBe(true)
    expect(getSession, 'ถามครั้งเดียวแล้วเลิก = บั๊กเดิม').toHaveBeenCalledTimes(2)
  })

  it('🛑 ต้องมีเพดาน ห้ามวนไม่รู้จบ', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    await expect(waitForSession(getSession, { retries: 3, sleep: noSleep })).resolves.toBe(false)
    /* 1 ครั้งแรก + ถามซ้ำอีก 3 = 4 */
    expect(getSession).toHaveBeenCalledTimes(4)
  })

  it('เน็ตสะดุด (throw) → ถือว่ายังไม่เห็น แล้วลองใหม่ ไม่ใช่พังทั้งฟังก์ชัน', async () => {
    const getSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ user: { id: 'u1' } })
    await expect(waitForSession(getSession, { sleep: noSleep })).resolves.toBe(true)
  })

  it('ถามอย่างน้อย 1 ครั้งเสมอ แม้ตั้ง retries = 0', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    await expect(waitForSession(getSession, { retries: 0, sleep: noSleep })).resolves.toBe(false)
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('รอระหว่างถามซ้ำจริง ๆ — ไม่ยิงรัวติดกัน', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const getSession = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ user: {} })
    await waitForSession(getSession, { delayMs: 250, sleep })
    expect(sleep, 'ไม่หน่วงเลย = ถามซ้ำก่อนคุกกี้จะทันลงตัว').toHaveBeenCalledWith(250)
  })
})

describe('[blocker] หน้าล็อกอินต้องเรียกใช้จริง', () => {
  it('🛑 `onSubmit` ต้องรอ session ก่อน push และต้อง refresh ล้างของที่ client เก็บไว้', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    const at = code.indexOf('result?.ok')
    expect(at, 'ไม่พบเส้นทางล็อกอินสำเร็จ').toBeGreaterThan(-1)
    const block = code.slice(at, at + 400)

    expect(block, 'ไม่รอ session = ต้องรีเฟรชเองเหมือนเดิม').toContain('waitForSession(')
    expect(block, 'App Router เก็บผลหน้าไว้ฝั่ง client — ต้องสั่งล้าง').toContain('router.refresh()')

    /* ลำดับสำคัญ: รอ → refresh → push · push ก่อนรอ = ไปทั้งที่ยังไม่รู้ว่าเห็นคุกกี้ไหม */
    expect(block.indexOf('waitForSession(')).toBeLessThan(block.indexOf('router.push('))
  })
})
