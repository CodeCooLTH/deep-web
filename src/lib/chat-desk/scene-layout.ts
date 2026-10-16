// ตำแหน่งทุกอย่างในฉาก 3D (หน่วยเมตร, [x, z]) — pure ไม่ import three เพื่อเทสได้ · ตัวเลขตรง mockup ที่ user อนุมัติ
import { LOUNGE_SEATS } from './constants'
import type { DeskCustomer, DeskTable, DeskView } from './types'

export type Vec = readonly [number, number]

export const ROOM = { W: 22, D: 16, WALL_H: 3.6 } as const
/** ประตูทางเข้า (ผนังซ้าย) / ทางออก (ผนังหลัง) */
export const ENTRANCE: Vec = [-ROOM.W / 2 + 0.6, 5]
export const EXIT: Vec = [-2.2, -ROOM.D / 2 + 0.6]
/** ทางเดินแนวตั้งระหว่างเลานจ์กับโต๊ะ */
export const HALL_X = -1.8

export const LOUNGE_AREA = { x: -6.4, z: 0.2, w: 7.6, d: 6.2 } as const
const SEAT_COLS = 6
const SEAT_GAP = 1.25

/** เก้าอี้ 24 ตัว (6×4) เรียงจากแถวหลัง — ตรงกับ LOUNGE_SEATS */
export const loungeSeat = (i: number): Vec => [
  LOUNGE_AREA.x + ((i % SEAT_COLS) - (SEAT_COLS - 1) / 2) * SEAT_GAP,
  LOUNGE_AREA.z + (Math.floor(i / SEAT_COLS) - (LOUNGE_SEATS / SEAT_COLS - 1) / 2) * SEAT_GAP,
]

/**
 * ตำแหน่งโต๊ะ: แอดมิน ≤3 = แถวเดียวห่าง 4 (ตาม mockup) · >3 = 4 คอลัมน์ห่าง 2.9 สูงสุด 2 แถว
 * โต๊ะอื่น (ตอบนอก/Meta AI/บอท) อยู่แถวหน้าสุดเสมอ
 */
export function deskSlots(tables: readonly DeskTable[]): Map<string, Vec> {
  const admins = tables.filter((t) => t.kind === 'ADMIN')
  const others = tables.filter((t) => t.kind !== 'ADMIN')
  const wide = admins.length > 3
  const out = new Map<string, Vec>()
  admins.forEach((t, i) => {
    const cols = wide ? 4 : 3
    const x = wide ? 1.0 + (i % cols) * 2.9 : 1.6 + (i % cols) * 4
    out.set(t.key, [x, -4.6 + Math.floor(i / cols) * 4.4])
  })
  const frontZ = admins.length > 4 ? 4.0 : 3.4
  others.forEach((t, i) => out.set(t.key, [1.6 + i * 4, frontZ]))
  return out
}

export type StageActor = {
  id: string
  customer: DeskCustomer
  pos: Vec
  seated: boolean
  /** หันหน้าไปทาง: เลานจ์หันเข้ากล้อง(+z) · หน้าโต๊ะหันหาโต๊ะ(-z) */
  ry: number
}

export function layoutActors(view: DeskView): StageActor[] {
  const slots = deskSlots(view.tables)
  const lounge = view.lounge.seats.map((c, i): StageActor => ({ id: c.id, customer: c, pos: loungeSeat(i), seated: true, ry: 0 }))
  const desks = view.tables.flatMap((t) => {
    const [x, z] = slots.get(t.key) ?? [0, 0]
    return t.shown.map((c, i): StageActor => ({
      id: c.id, customer: c, seated: false, ry: Math.PI,
      pos: [x + (i - (t.shown.length - 1) / 2) * 0.8, z + 1.5],
    }))
  })
  return [...lounge, ...desks]
}

/**
 * เส้นทางเดินจาก a ไป b (ไม่รวม a) — อยู่ในเลานจ์ด้วยกันเดินตรง ไม่งั้นอ้อมผ่านทางเดิน HALL_X
 * shortcut: ไม่หลบเก้าอี้/ตัวคนอื่น, ถ้าเลานจ์แน่นมากค่อยทำ pathfinding
 */
export function routeBetween(a: Vec, b: Vec): Vec[] {
  const inLounge = (v: Vec) => v[0] < HALL_X - 0.8
  if (inLounge(a) && inLounge(b)) return [b]
  return [[HALL_X, a[1]], [HALL_X, b[1]], b]
}
