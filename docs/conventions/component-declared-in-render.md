# 🛑 ห้ามประกาศ component ไว้ในตัว render ของ component อื่น

> เกิดจริง 2026-08-12 · `ConnectedAccountsClient.tsx` · user รายงานว่าหน้าจอ "แวบ ๆ"
> ทุกครั้งที่กดปุ่มเชื่อม/ยกเลิกบัญชี

## กฎ

ฟังก์ชันที่คืน JSX (component) ต้องประกาศที่ **module scope** เสมอ — ห้ามประกาศไว้ในตัว
render ของ component อื่น ต่อให้มันใช้ที่เดียวและสั้นแค่ไหน

```tsx
// ผิด — ProviderRow เป็นชนิดใหม่ทุก re-render ของ Parent
function Parent() {
  const [busy, setBusy] = useState(false)
  function ProviderRow({ label }: { label: string }) { return <div>{label}</div> }
  return <ProviderRow label="Apple" />
}

// ถูก — ชนิดเดียวตลอดอายุแอป ส่งของที่ต้องใช้ผ่าน props
function ProviderRow({ label }: { label: string }) { return <div>{label}</div> }
function Parent() { /* … */ return <ProviderRow label="Apple" /> }
```

## ทำไม — React เทียบชนิดด้วย identity ของฟังก์ชัน

ตอน reconcile React ถามว่า "element ตัวนี้เป็น *ชนิดเดียวกับ* ตัวเดิมไหม" โดยเทียบ
`element.type` ด้วย `===` — ฟังก์ชันที่ประกาศในตัว render ถูกสร้างขึ้นใหม่ทุกครั้งที่แม่
render จึงเป็นคนละอ็อบเจกต์เสมอ

⇒ React สรุปว่า "ชนิดเปลี่ยน" แล้ว **unmount ของเดิมทิ้งทั้งซับทรีแล้ว mount ใหม่**
ไม่ใช่ patch attribute เดิม

## อาการที่ผู้ใช้เห็น

เกิดกับ **ทุก `setState` ของแม่** ไม่ว่าจะเกี่ยวกับแถวนั้นหรือไม่:

| ผลข้างเคียง | ที่ผู้ใช้รู้สึก |
|---|---|
| DOM node ถูกสร้างใหม่ | จอกระตุก / "แวบ ๆ" |
| ไอคอน (`@iconify/react`) เริ่มวงจรโหลดใหม่ | ไอคอนวูบหายแล้วกลับมา |
| `transition-*` เริ่มนับหนึ่งจากค่าตั้งต้น | animation ที่ควรลื่นกลายเป็นกระตุก |
| **โฟกัสหลุดจาก element ที่เพิ่งกด** | คนใช้คีย์บอร์ด/screen reader หลุดตำแหน่งทันที |
| state ภายในของลูก (`useState`) ถูกล้าง | ค่าที่ผู้ใช้พิมพ์ค้างไว้หายเงียบ ๆ |
| `useEffect` ของลูกยิง cleanup + setup ใหม่ | subscribe/fetch ซ้ำ |

**แถวสุดท้ายอันตรายที่สุด** เพราะมันไม่ใช่แค่เรื่องภาพ — ลูกที่มี `useEffect` ยิง fetch
จะยิงใหม่ทุกครั้งที่แม่ setState

## ทำไมไม่มี gate ไหนจับได้

`tsc` · `next build` · เทส · `theme-guard.sh` · `/impeccable` ผ่านหมด เพราะ**โค้ดถูกต้อง
ทุกตัวอักษร** สิ่งที่ผิดคือ *ตำแหน่งที่ประกาศ* ไม่ใช่เนื้อโค้ด และ `react-hooks/exhaustive-deps`
ไม่ได้ตรวจเรื่องนี้เลย

เป็นคลาสเดียวกับ `hook-return-identity-in-deps.md`: ทั้งคู่คือ **identity ของอ็อบเจกต์ที่
ไม่เสถียร** — อันนั้นเป็นอ็อบเจกต์ที่ hook คืน อันนี้เป็นตัวฟังก์ชัน component เอง

## ข้อยกเว้นที่ไม่ใช่ข้อยกเว้น

**"มันต้องใช้ตัวแปรจาก closure ของแม่"** — นั่นคือสิ่งที่ props มีไว้ทำ ยกออกไปแล้วส่งเข้ามา
ถ้า prop เยอะจนน่ารำคาญ แปลว่าควรแยกเป็นหลาย component ไม่ใช่ยัดกลับเข้าไปในตัว render

**"มันเป็นแค่ helper ที่คืน JSX ไม่ใช่ component"** — ถ้าเรียกด้วย `<Thing />` มันคือ
component ตามนิยามของ React ทุกประการ · ถ้าตั้งใจให้เป็น helper จริงต้องเรียกเป็นฟังก์ชัน
(`{renderThing()}`) ซึ่ง React จะ inline ผลลัพธ์เข้าไปในทรีของแม่ ไม่สร้าง component boundary
ใหม่ — แบบนั้นไม่มีปัญหา แต่ก็ไม่ได้ประโยชน์อะไรจากการเป็นฟังก์ชันแยกเช่นกัน

## ด่าน

`src/lib/__tests__/oauth-provider-parity.test.ts` → `describe('ConnectedAccountsClient — ต้องไม่กระพริบ')`
สแกนซอร์สว่า component ที่ระบุชื่อไว้ต้องอยู่ที่คอลัมน์ 0 (module scope) ไม่มีย่อหน้านำหน้า
พิสูจน์ด้วย mutation แล้วว่าแดงจริงเมื่อย้ายกลับเข้าไปในตัว render

🛑 **เขียนด่านแบบนี้ต้อง `[ \t]+` ไม่ใช่ `\s+`** — `\s` กิน `\n` ได้ ทำให้ `^\s+function X(`
ไปแมตช์ "บรรทัดว่าง + บรรทัดที่ไม่มีย่อหน้า" แล้วแดงทั้งที่ประกาศถูกที่แล้ว (false positive จริง
ที่เจอตอนเขียนด่านนี้)

🛑 **และต้องตัดคอมเมนต์ก่อนสแกน** — ไฟล์ที่ทำถูกตามกฎคือไฟล์ที่มักเขียนคอมเมนต์อธิบายกฎนั้น
ไว้ด้วย ด่านที่สแกนทั้งไฟล์จะเจอคำเตือนของตัวเองแล้วแดงตลอดกาล (คลาสเดียวกับ grep gate ของ
Hard Rule 9 ที่แดงค้างจากคำเตือนของตัวเองเมื่อ 2026-08-02 → 08-03)

## ที่เกี่ยวข้อง

- `docs/conventions/hook-return-identity-in-deps.md` — identity ไม่เสถียรของอ็อบเจกต์ที่ hook คืน
- `docs/conventions/ui-boolean-needs-a-testable-home.md` — บั๊ก UI ที่ทุก gate เขียวเพราะชนิดถูก
- `docs/conventions/rule-must-be-enforced-not-described.md` — กฎที่เขียนไว้ ≠ กฎที่บังคับได้
