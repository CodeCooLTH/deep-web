import { describe, it, expect, vi } from 'vitest'

// meta provider import ทั้ง graph กับ storage — mock เฉพาะฟังก์ชันที่ยิง network ออกไปจริง
// แต่ใช้ GraphApiError **ตัวจริง** ผ่าน importActual เพราะ isTokenDeadError เช็คด้วย instanceof
// (คลาสปลอมจะทำให้เทสผ่านแบบหลอก ๆ และลายเซ็น constructor ไม่ตรงจนพัง type-check)
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendTextMessage: vi.fn(), sendImageMessage: vi.fn() }
})
vi.mock('@/lib/storage', () => ({ getFileUrl: vi.fn() }))

import { getChannelProvider, listSupportedChannels, resolveWindowState } from '@/lib/channel-providers'
import { META_WINDOW_MS, isMetaMirrorAllowedHost } from '@/lib/channel-providers/meta'
import { GraphApiError } from '@/lib/facebook/graph'

const base = new Date('2026-07-25T10:00:00Z')

describe('resolveWindowState', () => {
  it('windowMs = null (ช่องทางไม่มีหน้าต่างเวลา เช่น TikTok Shop) → เปิดตลอด แม้ลูกค้าไม่เคยทัก', () => {
    const s = resolveWindowState({ windowMs: null }, null, base)
    expect(s.open).toBe(true)
    expect(s.expiresAt).toBeNull()
    expect(s.msRemaining).toBe(Number.POSITIVE_INFINITY)
  })

  it('windowMs = null → ยังเปิดแม้ข้อความขาเข้าล่าสุดเก่ามากแล้ว', () => {
    const ancient = new Date(base.getTime() - 30 * 24 * 60 * 60 * 1000)
    expect(resolveWindowState({ windowMs: null }, ancient, base).open).toBe(true)
  })

  it('มี windowMs แต่ไม่เคยมีข้อความขาเข้า → ปิด (ร้านเปิดเธรดใหม่เองไม่ได้)', () => {
    const s = resolveWindowState({ windowMs: META_WINDOW_MS }, null, base)
    expect(s.open).toBe(false)
    expect(s.expiresAt).toBeNull()
    expect(s.msRemaining).toBe(0)
  })

  it('ลูกค้าเพิ่งทัก → เปิด และเหลือเวลาเท่ากับ windowMs พอดี', () => {
    const s = resolveWindowState({ windowMs: META_WINDOW_MS }, base, base)
    expect(s.open).toBe(true)
    expect(s.msRemaining).toBe(META_WINDOW_MS)
    expect(s.expiresAt?.getTime()).toBe(base.getTime() + META_WINDOW_MS)
  })

  it('เกิน windowMs → ปิด และ msRemaining ไม่ติดลบ', () => {
    const past = new Date(base.getTime() - META_WINDOW_MS - 1000)
    const s = resolveWindowState({ windowMs: META_WINDOW_MS }, past, base)
    expect(s.open).toBe(false)
    expect(s.msRemaining).toBe(0)
  })

  it('หน้าต่าง 48 ชม. (กฎของ TikTok Business Messaging) คำนวณตาม windowMs ที่ส่งเข้ามา ไม่ผูก 24 ชม.', () => {
    const FORTY_EIGHT_H = 48 * 60 * 60 * 1000
    // เวลาที่ปิดแล้วสำหรับ Meta (24 ชม.) แต่ยังเปิดสำหรับกฎ 48 ชม.
    const thirtyHoursAgo = new Date(base.getTime() - 30 * 60 * 60 * 1000)
    expect(resolveWindowState({ windowMs: META_WINDOW_MS }, thirtyHoursAgo, base).open).toBe(false)
    expect(resolveWindowState({ windowMs: FORTY_EIGHT_H }, thirtyHoursAgo, base).open).toBe(true)
  })
})

describe('registry', () => {
  it('รองรับ MESSENGER และ INSTAGRAM', () => {
    expect(listSupportedChannels().sort()).toEqual(['INSTAGRAM', 'MESSENGER'])
    expect(getChannelProvider('MESSENGER')?.capabilities.provider).toBe('MESSENGER')
    expect(getChannelProvider('INSTAGRAM')?.capabilities.provider).toBe('INSTAGRAM')
  })

  it('DEEP (แชทในแอป) ไม่มี provider — ไม่ได้คุยกับต้นทางภายนอก', () => {
    expect(getChannelProvider('DEEP')).toBeNull()
  })

  it('ค่าที่ไม่รู้จัก / null / undefined / ว่าง → null (channel ใน DB เป็น String อิสระ)', () => {
    expect(getChannelProvider('TIKTOK_SHOP')).toBeNull()
    expect(getChannelProvider(null)).toBeNull()
    expect(getChannelProvider(undefined)).toBeNull()
    expect(getChannelProvider('')).toBeNull()
  })
})

describe('Meta capabilities (ต้องตรงกับพฤติกรรมเดิมของ feature 00018)', () => {
  it('หน้าต่าง 24 ชม. และส่งออกได้แค่ TEXT/IMAGE', () => {
    const caps = getChannelProvider('MESSENGER')!.capabilities
    expect(caps.windowMs).toBe(24 * 60 * 60 * 1000)
    expect(caps.outboundMediaTypes).toEqual(['TEXT', 'IMAGE'])
    expect(caps.maxConsecutiveOutbound).toBeNull()
  })

  it('Messenger กับ Instagram ใช้กฎชุดเดียวกัน ต่างแค่ค่า provider', () => {
    const m = getChannelProvider('MESSENGER')!.capabilities
    const i = getChannelProvider('INSTAGRAM')!.capabilities
    expect({ ...m, provider: 'X' }).toEqual({ ...i, provider: 'X' })
  })
})

describe('isTokenDeadError', () => {
  const provider = getChannelProvider('MESSENGER')!

  it('GraphApiError code 190 → ถือว่าการเชื่อมต่อตาย (ต้องให้ร้านเชื่อมใหม่)', () => {
    expect(provider.isTokenDeadError(new GraphApiError('Error validating access token', 190, null, 401))).toBe(true)
  })

  it('GraphApiError code อื่น → ไม่ใช่ token ตาย (เช่น 10 = นอกหน้าต่างเวลา)', () => {
    expect(provider.isTokenDeadError(new GraphApiError('outside allowed window', 10, 2018278, 400))).toBe(false)
  })

  it('error ทั่วไป / ค่าที่ไม่ใช่ Error → false ไม่ throw', () => {
    expect(provider.isTokenDeadError(new Error('network down'))).toBe(false)
    expect(provider.isTokenDeadError('190')).toBe(false)
    expect(provider.isTokenDeadError(null)).toBe(false)
    expect(provider.isTokenDeadError(undefined)).toBe(false)
  })
})

describe('isMetaMirrorAllowedHost (กัน SSRF — ย้ายมาจาก channel-chat.service เดิม)', () => {
  it('CDN ของ Meta ผ่าน', () => {
    for (const h of [
      'graph.facebook.com',
      'fbcdn.net',
      'scontent.fbcdn.net',
      'lookaside.fbsbx.com',
      'cdn.fbsbx.com',
      'scontent.cdninstagram.com',
    ]) {
      expect(isMetaMirrorAllowedHost(h), h).toBe(true)
    }
  })

  it('ตัวพิมพ์ใหญ่ก็ผ่าน (เทียบแบบ case-insensitive)', () => {
    expect(isMetaMirrorAllowedHost('SCONTENT.FBCDN.NET')).toBe(true)
  })

  it('host ที่ปลอมตัวด้วย suffix ไม่ผ่าน — กัน endsWith ตรง ๆ', () => {
    for (const h of ['evil-fbcdn.net', 'evilfbcdn.net', 'notcdninstagram.com', 'xfbsbx.com']) {
      expect(isMetaMirrorAllowedHost(h), h).toBe(false)
    }
  })

  it('internal address / host อื่นไม่ผ่าน (SSRF)', () => {
    for (const h of ['169.254.169.254', 'localhost', '127.0.0.1', 'metadata.google.internal', 'example.com']) {
      expect(isMetaMirrorAllowedHost(h), h).toBe(false)
    }
  })
})
