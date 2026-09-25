# App Review Notes — รอบตอบ rejection 2026-09-24

> วางในกล่อง **App Review Information → Notes** ของ App Store Connect
> เขียนเป็นภาษาอังกฤษเพราะทีมรีวิวอ่านอังกฤษ · ช่องนี้จำกัด **4,000 ตัวอักษร**

## Apple ตีกลับ 2 ข้อ — โน้ตนี้ตอบทั้งคู่

| ข้อ | เขาว่าอะไร | แก้ที่ไหน |
|---|---|---|
| **3.1.2(c)** | *"does not clearly describe what the user will receive for the price"* | PR #77 (merged แล้ว) — จอแพ็กเกจในแอปแสดงสิทธิ์ของแต่ละแพ็กเกจ |
| **4** | Sign in with Apple เป็นหน้าเว็บ ไม่ใช่แผ่นของระบบ | PR #78 + บิลด์ใหม่ |

---

## 🛑 ก่อนวางโน้ต ต้องเสร็จ 4 ข้อนี้ก่อน

| # | ต้องทำ | ไม่ทำแล้วเป็นยังไง |
|---|---|---|
| 1 | **จัดกลุ่ม identifier ในพอร์ทัล Apple** — Services ID `com.deepthailand.seller.web` ต้องอยู่ในกลุ่มของ primary App ID `com.deepthailand.seller` | `sub` ไม่ตรงกัน ⇒ ผู้ขายที่เคยเชื่อม Apple ทางเว็บจะเห็น "ยังไม่มีบัญชีผู้ขาย" |
| 2 | **build ใหม่ + ขึ้น TestFlight แล้วเลือกบิลด์นั้นใน ASC** | คนตรวจได้บิลด์เก่าที่ยังเป็นหน้าเว็บ = ตีกลับข้อเดิม |
| 3 | ล็อกอินจริงด้วย Apple ID ที่เคยผูกไว้ทางเว็บ — ต้องเข้าบัญชีเดิมได้ | ข้อนี้คือตัวพิสูจน์ข้อ 1 |
| 4 | บัญชี `appreview` ต้อง **ไม่มีแพ็กเกจที่ใช้งานอยู่** | หน้าจะขึ้น "คุณใช้แพ็กเกจ … อยู่แล้ว" แทนปุ่มซื้อ ⇒ คนตรวจสรุปว่าไม่มี IAP |

---

## ข้อความที่ให้ก็อปไปวาง

```
Hello App Review Team,

We have addressed both issues from your 24 September review.

1. Guideline 4 - Sign in with Apple
Sign in with Apple now uses the native AuthenticationServices sheet
instead of a web page. Tapping "Sign in with Apple" opens the system
sheet with Face ID / Touch ID. This applies both on the sign-in screen
and in Profile > How you sign in.

2. Guideline 3.1.2(c) - Subscription information
Each subscription plan now lists what it includes (number of businesses,
number of admins per business, and separate product/order/wallet data)
next to its name and price.
Purchase screen: Shop > Manage shop > My package.

Demo account
Username: appreview
Password: provided in the App Review Information fields
This account has no active subscription, so the purchase buttons are
visible for testing.

Thank you.
```

**1,039 → ~880 ตัวอักษร** อยู่ในเพดาน 4,000 สบาย

---

## ข้อควรระวังตอนกรอก (เหมือนรอบก่อนทุกข้อ)

- **อย่าเอ่ยถึงราคาบนเว็บ หรือบอกว่าซื้อที่อื่นถูกกว่า** — เชิญให้เทียบราคาคือเชิญปัญหา
- **อย่าใส่ลิงก์เว็บไซต์ในโน้ต**
- ทางกดต้องเขียนเป็น **ลำดับการกดจริงบนมือถือ** ไม่ใช่ชื่อ URL — แอปเป็น WebView
  คนตรวจพิมพ์ URL เองไม่ได้ (นี่คือสาเหตุที่ถูกตีกลับรอบก่อน ๆ)
- 🛑 **ห้ามเขียนว่า "ถ้าล็อกอิน Apple ด้วยบัญชีที่ไม่เคยผูก จะเห็นหน้าสมัคร"** — มันจะไม่เห็น
  เขาจะเห็นข้อความ *"ยังไม่มีบัญชีผู้ขาย"* ซึ่งเป็นพฤติกรรมที่ตั้งใจตาม Guideline 3.1.1
  ถ้าอยากเขียนก็เขียนแบบนี้: *"Signing in with an Apple ID that is not linked to a Deep
  account shows an explanatory message; account registration is not available in the app."*

## หลังกดส่งแล้ว

🛑 **ห้าม deploy deep-web และห้าม `eas update`** จนกว่ารีวิวจะจบ — คนตรวจจะได้โค้ด
คนละชุดกับที่เราทดสอบ (ดู memory `appstore-review-freeze`)
