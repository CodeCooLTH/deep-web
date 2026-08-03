# Paces Toast — toast/alert รวมศูนย์ฝั่งหลังบ้าน (Hard Rule 9)

> **กฎ:** ทุก **toast / notification** (กล่องเด้งมุมจอแล้วหายเอง, non-blocking) ในหน้า `(paces)/**` (seller + admin) **ต้องเรียกผ่าน `pacesToast` เท่านั้น** — ห้ามใช้ `react-toastify`, `toast()`, `window.alert()`, หรือ Preline toast ดิบ. นี่คือ component/helper เดียวที่อนุญาตให้แสดง toast ในหลังบ้าน.
>
> **⚠️ ขอบเขต — toast ไม่ใช่ modal dialog:** กล่อง **blocking** ที่ต้องให้ผู้ใช้ตัดสินใจ/รับทราบก่อนทำต่อ (confirm "ยืนยันยกเลิก/ลบ?", success/error result popup, prompt) **ไม่ใช่งานของ `pacesToast`** — ต้องใช้ **Sweet Alerts (sweetalert2 `Swal`)** ตาม safepay-ux Hard Rule 8 (Base: `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx`). เส้นแบ่ง: เด้งแล้วหายเอง = `pacesToast`; ต้องคลิกตอบ = Sweet Alerts.

ที่มา: user สั่ง (2026-06-16) ให้รวมทุกจุดที่เป็น toastr มาใช้ component เดียว โดยยึด markup จาก
`theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx` (Paces Basic/Stacking toast) — กัน look-and-feel
เพี้ยน (react-toastify default ไม่ใช่ mood Paces) และมีจุดแก้จุดเดียวเวลาปรับดีไซน์.

---

## วิธีใช้ (developer)

```ts
import { pacesToast } from '@/lib/paces-toast'

// alert จากการกดปุ่ม / action ใด ๆ → top-right (default)
pacesToast.success('บันทึกแล้ว')
pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
pacesToast.warning('ส่ง SMS สำเร็จบางส่วน')
pacesToast.info('ข้อมูลถูกอัปเดต')

// alert จากระบบ chat → bottom-right
pacesToast.chat.info('มีข้อความใหม่')
pacesToast.chat.success('ส่งข้อความแล้ว')

// override อายุ toast (default 3000ms; 0 = ไม่ปิดอัตโนมัติ)
pacesToast.success('คัดลอกแล้ว', { duration: 1500 })
```

API mirror `react-toastify` (`.success/.error/.warning` + เพิ่ม `.info`) เพื่อให้ migrate ได้แค่สลับ import + เปลี่ยนชื่อเรียก — logic อื่นไม่ต้องแตะ.

### Placement แยกตามแหล่งที่มา (กำหนดโดย user)

| แหล่งที่มา | เรียกผ่าน | มุมที่แสดง |
|---|---|---|
| กดปุ่ม / action ใด ๆ | `pacesToast.success/error/warning/info(...)` | **top-right** (default) |
| ระบบ chat | `pacesToast.chat.success/error/warning/info(...)` | **bottom-right** |

(เลี่ยงชน: หรือส่ง `{ placement: 'top-right' \| 'bottom-right' }` ใน options ตรง ๆ ก็ได้ — `chat.*` คือ shortcut ที่ fix bottom-right ให้). `PacesToastContainer` render เป็น **2 region แยก** (top-right + bottom-right) cap region ละ 5 — chat ยิงรัวไม่ดัน action toast ทิ้ง.

---

## สถาปัตยกรรม

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/paces-toast.ts` | helper imperative — `pacesToast.*` dispatch `CustomEvent('paces:toast')` บน `window` (SSR-safe) |
| `src/components/paces/PacesToastContainer.tsx` | mount **จุดเดียว** ใน `AppProvidersWrapper` — subscribe event, จัดคิว (cap 5/region), render **2 region**: action=top-right (`fixed end-4 top-4`), chat=bottom-right (`fixed end-4 bottom-4`), `z-[1080]` |
| `src/components/paces/PacesToastItem.tsx` | toast เดี่ยว — markup Paces (Base: reference บรรทัด 44–58) + semantic icon + relative time + auto-dismiss + pause-on-hover + slide animation |
| `src/lib/relative-time-th.ts` | formatter "เมื่อสักครู่"/"N นาทีที่แล้ว" สำหรับ header |

**ทำไม event bus ไม่ใช่ React Context:** caller อยู่ deep-nested — event bus เรียกได้ flat ไม่ต้อง prop-drill/wrap Context และเข้ากับ pattern ของ Preline (ใช้ window event เช่นกัน).

**variant → สี/icon** (Paces semantic token): success=`text-success tabler:circle-check`, error=`text-danger tabler:alert-circle`, warning=`text-warning tabler:alert-triangle`, info=`text-info tabler:info-circle`.

---

## ขอบเขต — เฉพาะ (paces) เท่านั้น

- ✅ `src/app/(paces)/**` (seller + admin / Paces / Preline) → `pacesToast`
- ⛔️ `src/app/(marketing)/**` (buyer + landing / Vuexy / MUI) → **ยังใช้ `react-toastify` ตามเดิม** (`ToastMount.tsx`). Paces markup (`bg-default-*`, Preline class) ใช้ใน Vuexy ไม่ได้ — จะ render เพี้ยน. ถ้าจะ unify buyer ในอนาคต = task แยก (Vuexy-equivalent toast).

---

## Reviewer grep gate (ต้องผ่านก่อน merge ทุก PR ที่แตะ `(paces)/**`)

```bash
# ต้องคืน 0 — ถ้าพบ import react-toastify ใน (paces) = block merge
# 🛑 ต้อง match `from 'react-toastify'` ไม่ใช่คำว่า react-toastify เปล่า ๆ
#    ไฟล์ที่ทำถูกกฎมักเขียนคอมเมนต์อ้างชื่อกฎไว้บนหัวไฟล์ ("Toast: pacesToast — ห้าม react-toastify")
#    gate แบบ match คำเปล่าจึงแดงตลอดกาลและถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิด
#    (เข้าใจผิดจริงมาแล้ว: carry note 2026-08-02 อ้างว่าตกค้าง 3 ไฟล์ — ตรวจซ้ำ 2026-08-03 ไม่จริงสักไฟล์)
rg "from ['\"]react-toastify" "src/app/(paces)/"

# ต้องคืน 0 — ห้าม bare toast.* / native alert|confirm|prompt ใน (paces)
# (Sweet Alerts `Swal` = อนุญาต สำหรับ modal dialog ตาม safepay-ux Hard Rule 8)
# หมายเหตุ: ripgrep ใช้ regex เป็น default — อย่าใส่ -E (ใน rg แปลว่า --encoding ไม่ใช่ extended-regex)
rg -n "(^|[^s])toast\.(success|error|warning|info)\(|\bwindow\.(alert|confirm|prompt)\(|(^|[^.\w])(alert|confirm|prompt)\(" "src/app/(paces)/"
```

ถ้าพบ → toast/notification แทนด้วย `pacesToast.*`; ส่วน confirm/blocking dialog แทนด้วย Sweet Alerts (`Swal`).
