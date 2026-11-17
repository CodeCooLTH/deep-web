import type { DragStart, DragUpdate, DropResult, ResponderProvided } from '@hello-pangea/dnd'

import { fmt } from '@/i18n/fmt'
import type { useT } from '@/i18n/LocaleProvider'

/**
 * ข้อความอ่านออกเสียงตอนลาก (@hello-pangea/dnd) เป็นไทย/อังกฤษตามภาษาที่เลือก — ค่าเริ่มต้นของไลบรารีเป็นอังกฤษล้วน
 * ใช้ร่วม RoundsSection (รอบ) กับ PieceList (ชิ้น) — ตำแหน่งนับจาก 1
 */
export function useDragAnnounce(t: ReturnType<typeof useT>['salesFollowBot'], total: number) {
  return {
    start: (s: DragStart, p: ResponderProvided) => p.announce(fmt(t.dragLifted, { pos: s.source.index + 1, total })),
    update: (u: DragUpdate, p: ResponderProvided) =>
      p.announce(u.destination ? fmt(t.dragMoved, { pos: u.destination.index + 1, total }) : t.dragOutside),
    end: (r: DropResult, p: ResponderProvided) =>
      p.announce(
        r.reason === 'CANCEL' || !r.destination
          ? fmt(t.dragCancelled, { pos: r.source.index + 1 })
          : fmt(t.dragDropped, { from: r.source.index + 1, to: r.destination.index + 1 }),
      ),
  }
}
