// [blocker] หลักฐานปิดหลุดสาธารณะ = ความเสียหายที่กู้ไม่ได้ (feature 00060 · T10)

import { describe, expect, it } from 'vitest'
import { INSPECTION_CHECK_KEYS } from './checks'
import { resolveEvidenceVisibility, type EvidenceKind } from './evidence-visibility'

const KINDS: EvidenceKind[] = ['PHOTO', 'VIDEO_STILL', 'DOCUMENT', 'GEO']

describe('resolveEvidenceVisibility', () => {
  it('🛑 mutation: เปลี่ยนเป็น deny-list (ไม่รู้จัก = PUBLIC) → เคสนี้ต้องแดง', () => {
    // ทุกคู่ที่ไม่ได้อยู่ใน allow-list ต้องเป็น PRIVATE — รวมคู่ที่ยังไม่มีใครคิดถึง
    const publicPairs: string[] = []
    for (const checkKey of INSPECTION_CHECK_KEYS) {
      for (const kind of KINDS) {
        const d = resolveEvidenceVisibility(kind, checkKey)
        if (d.ok && d.visibility === 'PUBLIC') publicPairs.push(`${kind}:${checkKey}`)
      }
    }
    expect(publicPairs.sort()).toEqual([
      'GEO:location_exists',
      'PHOTO:deep_photo_album',
      'VIDEO_STILL:video_tour',
    ])
  })

  it('🛑 DOCUMENT เป็น PRIVATE เสมอ ไม่มีข้อยกเว้น', () => {
    for (const checkKey of INSPECTION_CHECK_KEYS) {
      const d = resolveEvidenceVisibility('DOCUMENT', checkKey)
      if (d.ok) expect(d.visibility, checkKey).toBe('PRIVATE')
    }
  })

  it('🛑 mutation: กลืน DOCUMENT ที่ส่งมาผิดข้อแล้วลดเป็น PRIVATE เงียบ ๆ → เคสนี้ต้องแดง', () => {
    // ปฏิเสธดีกว่ากลืน เพราะการกลืนแปลว่าฝั่งเรียกเข้าใจผิดแล้วไม่มีใครรู้
    expect(resolveEvidenceVisibility('DOCUMENT', 'deep_photo_album')).toEqual({
      ok: false,
      reason: 'EVIDENCE_VISIBILITY_FORBIDDEN',
    })
  })

  it('รูปของข้อที่หลักฐานเป็นความลับ → PRIVATE (เช่นบัตรประชาชนคู่เซลฟี่)', () => {
    expect(resolveEvidenceVisibility('PHOTO', 'id_card_selfie')).toEqual({ ok: true, visibility: 'PRIVATE' })
    expect(resolveEvidenceVisibility('PHOTO', 'lease_right_document')).toEqual({ ok: true, visibility: 'PRIVATE' })
  })

  it('รูปของข้อสาธารณะที่ไม่ใช่คู่ใน allow-list ยังเป็น PRIVATE', () => {
    // photos_match เปิดหลักฐานได้ในเชิงนโยบาย แต่รูปที่ผู้ตรวจถ่ายเปรียบเทียบยังไม่อยู่ใน
    // ชุดที่ตกลงให้เผยแพร่ ⇒ ต้องไม่หลุดเพราะ "ข้อนี้ publicEvidence = true"
    expect(resolveEvidenceVisibility('PHOTO', 'photos_match')).toEqual({ ok: true, visibility: 'PRIVATE' })
  })
})
