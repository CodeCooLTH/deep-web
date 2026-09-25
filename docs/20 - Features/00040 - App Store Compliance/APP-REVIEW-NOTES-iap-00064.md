# App Review Notes — รอบเปิด In-App Purchase (feature 00064)

> วางข้อความในกล่อง **App Review Information → Notes** ของ App Store Connect
> เขียนเป็นภาษาอังกฤษเพราะทีมรีวิวอ่านอังกฤษ · ช่องนี้จำกัด **4,000 ตัวอักษร**
>
> 🛑 **รอบนี้กลับทิศจาก `APP-REVIEW-NOTES-resubmit.md`** — รอบก่อนเราบอกว่า "เอาทางซื้อ
> ออกหมดแล้ว" (3.1.3(b)) รอบนี้เราบอกว่า "ทำ IAP แล้ว" · อย่าส่งโน้ตเก่าซ้ำเด็ดขาด
> เพราะสองข้อความนี้ขัดกันเอง และคนตรวจเห็นประวัติทุกรอบ

---

## 🛑 ก่อนวางโน้ต ต้องเสร็จ 3 ข้อนี้ก่อน

| # | ต้องทำ | ไม่ทำแล้วเป็นยังไง |
|---|---|---|
| 1 | สินค้าสมาชิกทั้ง 3 ตัวต้องมี screenshot แล้วกด **Add for Review** | สินค้าไม่ถูกส่งไปพร้อมบิลด์ ⇒ คนตรวจกดซื้อแล้วไม่มีอะไรขึ้น = ตีกลับข้อเดิม |
| 2 | env `APPLE_IAP_KEY_ID` / `APPLE_IAP_ISSUER_ID` / `APPLE_IAP_PRIVATE_KEY` บน Vercel prod | ตัวเดินตรวจซ้ำตอบ 503 · สิทธิ์ที่หลุดจะไม่มีใครตามเก็บ |
| 3 | บัญชี `appreview` ต้อง **ไม่มีแพ็กเกจที่ใช้งานอยู่** | หน้าจะขึ้น "คุณใช้แพ็กเกจ ... อยู่แล้ว" แทนปุ่มซื้อ ⇒ คนตรวจสรุปว่าไม่มี IAP |

ข้อ 3 ตรวจเร็ว ๆ ได้โดยล็อกอิน `appreview` ในแอปแล้วกดตามทางในโน้ต — ต้องเห็นปุ่มซื้อ 3 ปุ่ม

---

## ข้อความที่ให้ก็อปไปวาง

```
Hello App Review Team,

We have addressed all three issues from your 23 August review.

1. Guideline 3.1.1 - In-App Purchase
Our subscription plans are now sold only through In-App Purchase
(auto-renewable subscriptions). There is no other purchase method and no
external purchase link in the app.
Purchase screen: Shop > Manage shop > My package.

2. Guideline 3.1.1 - Account registration
Business account registration has been removed from the app. The app now
offers sign-in only, for existing merchants. If you sign in with an Apple ID
that is not linked to a Deep account, you will see the screen
"ยังไม่มีร้านค้าของคุณ" (You do not have a shop yet). This is expected.

3. Guideline 2.1(a) - Sign in with Apple on iPad
The issue where the app stayed on the login screen after Sign in with Apple
has been fixed and tested on iPad and iPhone.

Demo account
Username: appreview
Password: provided in the App Review Information fields
This account has no active subscription, so the purchase buttons are visible
for testing.

Thank you.
```

---

## ข้อควรระวังตอนกรอก

- **อย่าเอ่ยถึงราคาบนเว็บ หรือบอกว่าซื้อที่อื่นถูกกว่า** — เชิญให้เทียบราคาคือเชิญปัญหา
  ราคาที่แสดงในแอปมาจาก StoreKit ตรง ๆ ตามที่ตั้งใน App Store Connect
- **อย่าใส่ลิงก์เว็บไซต์ในโน้ต** (คลาสเดียวกับข้อห้ามใน `OAuthErrorNotice` — ดู
  `app-no-account-notice.test.ts` ที่บังคับกฎนี้กับข้อความบนจอ)
- ทางกดต้องเขียนเป็น **ลำดับการกดจริงบนมือถือ** ไม่ใช่ชื่อ URL — แอปเป็น WebView
  คนตรวจพิมพ์ URL เองไม่ได้ (นี่คือสาเหตุที่ถูกตีกลับรอบที่ผ่านมา)
- ถ้าคนตรวจใช้ iPad ให้ยืนยันเองก่อนว่า Sign in with Apple บน iPad ผ่านจริง
  (`TestCase.md` TC-IAP-49 ยังไม่เคยยืนยัน)

## หลังกดส่งแล้ว

🛑 **ห้าม deploy deep-web และห้าม `eas update`** จนกว่ารีวิวจะจบ — คนตรวจจะได้โค้ด
คนละชุดกับที่เราทดสอบ (ดู memory `appstore-review-freeze`)
