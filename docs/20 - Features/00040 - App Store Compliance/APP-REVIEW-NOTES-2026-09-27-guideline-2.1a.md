# App Review Notes — ตอบ rejection 2026-09-27 (Guideline 2.1 · App Completeness)

> วางในกล่อง **App Review Information → Notes** ของ App Store Connect
> ช่องนี้จำกัด **4,000 ตัวอักษร** — 🛑 ตัวเลขที่ ASC โชว์คือ **จำนวนที่เหลือ** ไม่ใช่ที่ใช้ไป
> (เคยอ่านผิดมาแล้ว 2026-09-25)

## รอบนี้ตีกลับข้อเดียว

| ข้อ | เขาว่าอะไร | สถานะ |
|---|---|---|
| **2.1** App Completeness | *"we were unable to sign in with Apple … no action took place"* | แก้แล้ว — **ฝั่งเว็บทั้งหมด** |
| ~~4~~ Sign in with Apple | — | **ผ่านแล้ว** |
| ~~3.1.2(c)~~ คำบรรยายแพ็กเกจ | — | **ผ่านแล้ว** |

## 🛑 ไม่ต้อง build ใหม่ — เลือก **บิลด์ 9** เดิม

ทุกอย่างที่แก้อยู่ในเว็บ (`seller.deepthailand.app`) ซึ่งแอปโหลดสด ⇒ **deploy แล้วกด Resubmit**
ห้าม `eas build` / `eas update` รอบนี้

## 🛑 ก่อนวางโน้ต ต้องเสร็จ 3 ข้อ

| # | ต้องทำ | ไม่ทำแล้วเป็นยังไง |
|---|---|---|
| 1 | **deploy PR รอบนี้ขึ้น prod ให้เสร็จก่อน** แล้วเปิดแอปยืนยันว่าแถบข้อความขึ้นจริง | คนตรวจได้เว็บตัวเก่า = เงียบเหมือนเดิม = ตีกลับข้อเดิม |
| 2 | ยืนยันว่า `appreview` **ล็อกอินด้วยชื่อผู้ใช้+รหัสผ่านได้** (นี่คือทางที่โน้ตบอกให้เขาใช้) | โน้ตชี้ไปทางที่ใช้ไม่ได้ = แย่กว่าไม่เขียน |
| 3 | รหัสของ `appreview` ในช่อง Password ของ ASC ต้องยังใช้ได้ | 🛑 ห้ามรัน `scripts/create-appstore-review-account.ts` เพื่อ "ดูรหัส" — มันสุ่มรหัสใหม่ทุกครั้ง |

## ข้อความที่ให้ก็อปไปวาง

```
Hello App Review Team,

Thank you for the 27 September review. We have fixed the issue.

Guideline 2.1 - Sign in with Apple showed no result

Sign in with Apple worked, but the Apple ID you used did not have a
Deep seller account yet, and the app's on-screen message disappeared
after a few seconds, so the screen looked unchanged.

As requested in your earlier review under Guideline 3.1.1, the app does
not create new business accounts. Sign in with Apple therefore signs in
existing sellers only.

What we changed:
- The result now stays on screen until you act on it, instead of
  disappearing.
- The message explains that the Apple ID has no seller account yet and
  points to the username and password fields on the same screen.
- The button shows a spinner as soon as it is tapped.
- Cancelling the Apple sheet now shows a message instead of nothing.

To sign in, please use the demo account in App Review Information
(username and password, on the same sign-in screen).

Thank you,
Deep Thailand
```

## 🛑 สิ่งที่ตั้งใจ **ไม่** เขียนลงไป

หัวหน้าสั่งไว้ว่า *"ไม่ต้องบอกอะไรเพิ่มมากนะ เราต้องการให้รีวิวผ่าน แก้ตามที่เขาสั่ง"*

- ไม่อธิบายสถาปัตยกรรม (nonce / คุกกี้ httpOnly / JWKS) — เขาไม่ได้ถาม
- ไม่ต่อรองเรื่อง 3.1.1 · ไม่ขอให้เปิดการสมัครในแอปกลับมา
- ไม่แนบตัวเลขจากฐานข้อมูลที่ใช้วินิจฉัย (อยู่ในภาคผนวก 8 แล้ว)
- ไม่อ้างว่า "ทดสอบบนเครื่องจริงแล้ว" จนกว่าจะได้ทำจริง
