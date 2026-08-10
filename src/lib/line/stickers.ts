// (S-18, feature 00025) SSOT ของ "สติกเกอร์ LINE ที่ยิงออกผ่าน Messaging API ได้จริง"
//
// LINE ไม่ยอมให้ยิง sticker message ด้วย stickerId ใด ๆ ก็ได้ — ต้องเป็นคู่ packageId/stickerId ที่อยู่ใน
// หน้า "Sticker list" ของเอกสารเท่านั้น (ผิดคู่ = LINE ปฏิเสธทั้งข้อความ)
// ที่มา: https://developers.line.biz/en/docs/messaging-api/sticker-list/ (ดึงมาแปลง 2026-08-10)
//
// 🛑 **"CDN มีรูป" ไม่ได้แปลว่า "ส่งได้"** — ห้ามขยายรายการนี้ด้วยการเดาว่า id ในแพ็กเรียงต่อกัน แล้วยิง
// CDN ทดสอบว่าได้ 200 ไหม. พิสูจน์แล้วว่าไม่จริง: สติกเกอร์ `1993` (ตัวถัดจาก `1992` ในแพ็ก 446)
// โหลดจาก `stickershop.line-scdn.net` ได้ 200 ตามปกติ **แต่ไม่อยู่ในรายการที่ส่งได้** — ถ้าเอาเข้ามา
// ผู้ขายจะกดส่งแล้วโดน LINE ปฏิเสธ โดยที่รูปในตัวเลือกขึ้นสวยงามทุกประการ (บั๊กที่หน้าจอไม่มีทางบอกได้)
//
// ⚠️ เอกสารให้แพ็กละ **5 ตัวเท่านั้น** (15 แพ็ก = 75 ตัว) — นี่คือรายการเต็ม ไม่ใช่ตัวอย่างที่ตัดมา
// (ยืนยันแล้วว่าหน้าเอกสารไม่มีเลข `1993` อยู่เลย และไม่มีปุ่มโหลดเพิ่ม) วันที่ LINE เพิ่มแพ็กใหม่
// ให้กลับไปดึงจากหน้าเดิม ห้ามพิมพ์เลขจากความจำ

export interface LineStickerPack {
  packageId: string
  /** ชื่อแพ็กตามเอกสาร LINE — ใช้เป็นป้ายแท็บในตัวเลือก (คงชื่ออังกฤษตามต้นทาง ไม่มีชื่อไทยทางการ) */
  title: string
  stickerIds: readonly string[]
}

export const LINE_STICKER_PACKS: readonly LineStickerPack[] = [
  { packageId: '446', title: 'Moon: Special Edition', stickerIds: ['1988', '1989', '1990', '1991', '1992'] },
  { packageId: '789', title: 'Sally: Special Edition', stickerIds: ['10855', '10856', '10857', '10858', '10859'] },
  { packageId: '1070', title: 'Moon: Special Edition', stickerIds: ['17839', '17840', '17841', '17842', '17843'] },
  {
    packageId: '6136',
    title: 'LINE Characters: Making Amends',
    stickerIds: ['10551376', '10551377', '10551378', '10551379', '10551380'],
  },
  {
    packageId: '6325',
    title: 'Brown and Cony Fun Size Pack',
    stickerIds: ['10979904', '10979905', '10979906', '10979907', '10979908'],
  },
  {
    packageId: '6359',
    title: 'Brown and Cony Fun Size Pack',
    stickerIds: ['11069848', '11069849', '11069850', '11069851', '11069852'],
  },
  {
    packageId: '6362',
    title: 'LINE Characters',
    stickerIds: ['11087920', '11087921', '11087922', '11087923', '11087924'],
  },
  {
    packageId: '6370',
    title: 'Brown and Cony Fun Size Pack',
    stickerIds: ['11088016', '11088017', '11088018', '11088019', '11088020'],
  },
  {
    packageId: '6632',
    title: 'LINE Characters',
    stickerIds: ['11825374', '11825375', '11825376', '11825377', '11825378'],
  },
  {
    packageId: '8515',
    title: 'LINE Characters: Pretty Phrases',
    stickerIds: ['16581242', '16581243', '16581244', '16581245', '16581246'],
  },
  {
    packageId: '8522',
    title: 'LINE Characters: Pretty Phrases',
    stickerIds: ['16581266', '16581267', '16581268', '16581269', '16581270'],
  },
  {
    packageId: '8525',
    title: 'LINE Characters',
    stickerIds: ['16581290', '16581291', '16581292', '16581293', '16581294'],
  },
  {
    packageId: '11537',
    title: 'Brown & Cony & Sally: Animated Special',
    stickerIds: ['52002734', '52002735', '52002736', '52002737', '52002738'],
  },
  {
    packageId: '11538',
    title: 'CHOCO & Friends: Animated Special',
    stickerIds: ['51626494', '51626495', '51626496', '51626497', '51626498'],
  },
  {
    packageId: '11539',
    title: 'UNIVERSTAR BT21: Animated Special',
    stickerIds: ['52114110', '52114111', '52114112', '52114113', '52114114'],
  },
]

export interface LineStickerDef {
  packageId: string
  stickerId: string
}

/** แบนราบไว้ให้ค้นหา — สร้างครั้งเดียวตอน import ไม่ใช่ทุกครั้งที่เรียก */
const STICKER_INDEX: ReadonlyMap<string, string> = new Map(
  LINE_STICKER_PACKS.flatMap((p) => p.stickerIds.map((id) => [id, p.packageId] as const)),
)

export const LINE_SENDABLE_STICKERS: readonly LineStickerDef[] = LINE_STICKER_PACKS.flatMap((p) =>
  p.stickerIds.map((stickerId) => ({ packageId: p.packageId, stickerId })),
)

/**
 * หา packageId จาก stickerId — คืน `undefined` เมื่อไม่รู้จัก
 *
 * 🛑 ผู้เรียกต้องปฏิเสธด้วย error ที่อ่านออก **ห้ามเดา packageId เอง** (เช่นใช้ค่าของแพ็กแรก) เพราะ LINE
 * จะตอบ 400 ที่ผู้ขายแปลไม่ออก แทนที่จะรู้ว่าสติกเกอร์ตัวนั้นส่งไม่ได้ตั้งแต่ต้น
 */
export function findLineStickerPackageId(stickerId: string): string | undefined {
  return STICKER_INDEX.get(stickerId)
}

/** URL รูปสติกเกอร์บน CDN ของ LINE — ใช้ทั้งฝั่งแสดงตัวเลือกและฝั่ง mirror ข้อความขาเข้า (S-7b) */
export function lineStickerImageUrl(stickerId: string): string {
  return `https://stickershop.line-scdn.net/stickershop/v1/sticker/${encodeURIComponent(stickerId)}/android/sticker.png`
}
