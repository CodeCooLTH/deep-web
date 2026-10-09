import { describe, expect, it } from 'vitest'
import type { AutoSuggestState } from '@/lib/ai-suggest-auto-types'
import {
  AUTO_SUGGEST_DEBOUNCE_MS,
  AUTO_SUGGEST_POLL_INTERVAL_MS,
  AUTO_SUGGEST_POLL_MAX_MS,
  getAutoSuggestView,
  isResultCurrent,
  nextStep,
  shouldRequest,
  type AutoSuggestViewInput,
} from '../auto-suggest-machine'

const okReq = { enabled: true, visible: true, latestMessageIsBuyer: true, anchorId: 'B', handledAnchorId: null }

describe('constants', () => {
  it('ค่าตามแผน', () => {
    expect(AUTO_SUGGEST_DEBOUNCE_MS).toBe(1500)
    expect(AUTO_SUGGEST_POLL_INTERVAL_MS).toBe(1500)
    expect(AUTO_SUGGEST_POLL_MAX_MS).toBe(10_000)
  })
})

describe('shouldRequest', () => {
  it('ครบเงื่อนไข → ขอ', () => expect(shouldRequest(okReq)).toBe(true))
  it('แท็บ hidden → ไม่ขอ', () => expect(shouldRequest({ ...okReq, visible: false })).toBe(false))
  it('ไม่ใช่โหมด auto (enabled=false) → ไม่ขอ', () => expect(shouldRequest({ ...okReq, enabled: false })).toBe(false))
  it('ร้านตอบก่อน (ข้อความล่าสุดไม่ใช่ BUYER) → ไม่ขอ', () =>
    expect(shouldRequest({ ...okReq, latestMessageIsBuyer: false })).toBe(false))
  it('ไม่มี anchor → ไม่ขอ', () => expect(shouldRequest({ ...okReq, anchorId: null })).toBe(false))
  it('anchor เดิมที่ขอแล้ว → ไม่ยิงซ้ำ', () => expect(shouldRequest({ ...okReq, handledAnchorId: 'B' })).toBe(false))
  it('ส่ง A แล้ว B: A handled แล้ว B ใหม่ → ขอ B', () =>
    expect(shouldRequest({ ...okReq, anchorId: 'B', handledAnchorId: 'A' })).toBe(true))
})

const none = (reason: 'NO_RUN' | 'SKIPPED_BOT' | 'ERROR'): AutoSuggestState => ({
  status: 'NONE',
  anchorMessageId: 'B',
  attempt: null,
  reason,
})
const thinking: AutoSuggestState = { status: 'THINKING', anchorMessageId: 'B', attempt: 1 }
const ready: AutoSuggestState = { status: 'READY', anchorMessageId: 'B', attempt: 1, suggestion: 'x', feedback: null }

describe('nextStep (กฎ ข)', () => {
  it('GET → NO_RUN → POST', () => expect(nextStep('GET', none('NO_RUN'), 0)).toBe('post'))
  it('GET → READY → ไม่ POST', () => expect(nextStep('GET', ready, 0)).toBe('done'))
  it('GET → NONE เหตุอื่น (เช่น SKIPPED_BOT/ERROR) → ไม่ POST', () => {
    expect(nextStep('GET', none('SKIPPED_BOT'), 0)).toBe('done')
    expect(nextStep('GET', none('ERROR'), 0)).toBe('done')
  })
  it('POST → NO_RUN → ไม่วน POST ซ้ำ', () => expect(nextStep('POST', none('NO_RUN'), 0)).toBe('done'))
  it('THINKING ในกรอบเวลา → poll', () => {
    expect(nextStep('GET', thinking, 0)).toBe('poll')
    expect(nextStep('POST', thinking, AUTO_SUGGEST_POLL_MAX_MS - 1)).toBe('poll')
  })
  it('THINKING ครบ 10 วิ → giveup (กลับ none)', () => {
    expect(nextStep('GET', thinking, AUTO_SUGGEST_POLL_MAX_MS)).toBe('giveup')
    expect(nextStep('POST', thinking, AUTO_SUGGEST_POLL_MAX_MS + 1)).toBe('giveup')
  })
})

describe('isResultCurrent (ทิ้งผลเก่า)', () => {
  it('anchor ตรง + BUYER ล่าสุด → ใช้ได้', () => expect(isResultCurrent(ready, 'B', true)).toBe(true))
  it('ส่ง A แล้ว B → ผลของ A ถูกทิ้ง', () => expect(isResultCurrent({ ...ready, anchorMessageId: 'A' }, 'B', true)).toBe(false))
  it('ร้านตอบก่อนผลมา → ทิ้ง', () => expect(isResultCurrent(ready, 'B', false)).toBe(false))
  it('ไม่มี anchor ปัจจุบัน → ทิ้ง', () => expect(isResultCurrent(ready, null, true)).toBe(false))
  it('NONE ที่ anchor=null (STALE_ANCHOR) → ผ่านได้ (ไม่มีเนื้อหา)', () =>
    expect(isResultCurrent({ status: 'NONE', anchorMessageId: null, attempt: null, reason: 'STALE_ANCHOR' }, 'B', true)).toBe(true))
})

const v: AutoSuggestViewInput = {
  mode: 'auto',
  status: 'ready',
  anchorIsLatestBuyer: true,
  typing: false,
  dismissedAnchorId: null,
  anchorId: 'B',
  recalledAnchorId: null,
  activePanel: null,
  composerDisabled: false,
}

describe('getAutoSuggestView', () => {
  it('ready ปกติ → ready', () => expect(getAutoSuggestView(v)).toBe('ready'))
  it('thinking ปกติ → thinking', () => expect(getAutoSuggestView({ ...v, status: 'thinking' })).toBe('thinking'))
  it('mode manual → none (แม้ ready)', () => expect(getAutoSuggestView({ ...v, mode: 'manual' })).toBe('none'))
  it('status none → none', () => expect(getAutoSuggestView({ ...v, status: 'none' })).toBe('none'))
  it('anchor ไม่ใช่ BUYER ล่าสุด → none', () => expect(getAutoSuggestView({ ...v, anchorIsLatestBuyer: false })).toBe('none'))
  it('composerDisabled → none', () => expect(getAutoSuggestView({ ...v, composerDisabled: true })).toBe('none'))
  it('มีแผงอื่นเปิด → none (แม้ซ่อนอยู่ก็ไม่มีปุ่มเรียกกลับ)', () => {
    expect(getAutoSuggestView({ ...v, activePanel: 'emoji' })).toBe('none')
    expect(getAutoSuggestView({ ...v, activePanel: 'emoji', typing: true })).toBe('none')
  })
  it('พิมพ์อยู่ + ready → recall', () => expect(getAutoSuggestView({ ...v, typing: true })).toBe('recall'))
  it('พิมพ์อยู่ + thinking → none (ไม่มีอะไรให้เรียกกลับ)', () =>
    expect(getAutoSuggestView({ ...v, typing: true, status: 'thinking' })).toBe('none'))
  it('กดเรียกกลับแล้ว (recalled=anchor) ระหว่างพิมพ์ → ready', () =>
    expect(getAutoSuggestView({ ...v, typing: true, recalledAnchorId: 'B' })).toBe('ready'))
  it('recalled เป็นของ anchor เก่า ระหว่างพิมพ์ → recall', () =>
    expect(getAutoSuggestView({ ...v, typing: true, recalledAnchorId: 'A' })).toBe('recall'))
  it('ปิด anchor นี้ + ready → recall', () => expect(getAutoSuggestView({ ...v, dismissedAnchorId: 'B' })).toBe('recall'))
  it('ปิด anchor นี้ + thinking → none', () =>
    expect(getAutoSuggestView({ ...v, dismissedAnchorId: 'B', status: 'thinking' })).toBe('none'))
  it('ปิด anchor เก่า → ไม่กระทบ anchor ใหม่', () => expect(getAutoSuggestView({ ...v, dismissedAnchorId: 'A' })).toBe('ready'))
  it('ปิดแล้วแต่ recalled ตอนพิมพ์ ยังซ่อน (dismissed ชนะ)', () =>
    expect(getAutoSuggestView({ ...v, typing: true, recalledAnchorId: 'B', dismissedAnchorId: 'B' })).toBe('recall'))
  it('ไม่พิมพ์ + recalled → ready', () => expect(getAutoSuggestView({ ...v, recalledAnchorId: 'B' })).toBe('ready'))
})
