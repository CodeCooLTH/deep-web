import { describe, expect, it } from 'vitest'
import { initialAlbumShape, knownChatImageSize, shapeFromRatio, shouldShowImagePlaceholder } from './chat-image-reserve'

describe('[blocker] chat-image-reserve', () => {
  it('knownChatImageSize: ต้องมีทั้งคู่ > 0', () => {
    expect(knownChatImageSize(100, 50)).toEqual({ width: 100, height: 50 })
    expect(knownChatImageSize(100, null)).toBeNull()
    expect(knownChatImageSize(undefined, 50)).toBeNull()
    expect(knownChatImageSize(0, 50)).toBeNull()
    expect(knownChatImageSize(100, -1)).toBeNull()
  })
  it('shapeFromRatio ขอบเขต', () => {
    expect(shapeFromRatio(0.85)).toBe('PORTRAIT')
    expect(shapeFromRatio(0.86)).toBe('SQUARE')
    expect(shapeFromRatio(1.19)).toBe('SQUARE')
    expect(shapeFromRatio(1.2)).toBe('LANDSCAPE')
  })
  it('initialAlbumShape: รู้ขนาดใช้สัดส่วน ไม่รู้ = SQUARE', () => {
    expect(initialAlbumShape(600, 1200)).toBe('PORTRAIT')
    expect(initialAlbumShape(1200, 600)).toBe('LANDSCAPE')
    expect(initialAlbumShape(null, null)).toBe('SQUARE')
    expect(initialAlbumShape(600, null)).toBe('SQUARE')
  })
  it('placeholder: เฉพาะรู้ขนาด+ไม่ใช่สติกเกอร์+ยังไม่โหลด', () => {
    expect(shouldShowImagePlaceholder({ known: true, isSticker: false, loaded: false })).toBe(true)
    expect(shouldShowImagePlaceholder({ known: false, isSticker: false, loaded: false })).toBe(false)
    expect(shouldShowImagePlaceholder({ known: true, isSticker: true, loaded: false })).toBe(false)
    expect(shouldShowImagePlaceholder({ known: true, isSticker: false, loaded: true })).toBe(false)
  })
})
