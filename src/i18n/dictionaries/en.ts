/**
 * คำแปลภาษาอังกฤษ (feature 00047)
 *
 * 🛑 `const en: Dictionary` คือด่านจริงของ BR-I18N-11 — ไม่ใช่คอมเมนต์นี้
 * ขาดคีย์ที่ th.ts มี → tsc แดง · ใส่คีย์ที่ th.ts ไม่มี → tsc แดง (excess property)
 * ห้ามเปลี่ยนเป็น `Partial<Dictionary>` หรือ `Record<string, unknown>` ไม่ว่าด้วยเหตุผลใด
 * เพราะนั่นคือการถอดด่านออกทั้งอัน แล้วคำแปลที่หายจะไปโผล่ที่หน้าจอผู้ใช้แทน
 *
 * 🛑 ห้ามเพิ่ม fallback ที่ไหนก็ตามที่ยอมให้คีย์หายแล้วระบบยังผ่านได้ (BR-I18N-12)
 * คำแปลที่หายไปไม่ทำให้ระบบพัง มันแค่ทำให้ผู้ใช้เห็นของแปลก = ไม่มีอะไรฟ้อง
 * (docs/conventions/rule-must-be-enforced-not-described.md)
 *
 * แนวทางการเลือกคำ:
 * - ใช้คำที่ Meta/แพลตฟอร์มใช้เองเมื่อพูดถึงของของเขา (Page, Messenger, Instagram)
 *   ไม่คิดคำใหม่ — reviewer ต้องจับคู่สิ่งที่เห็นบนจอกับคำอธิบายในใบยื่นได้ทันที
 * - ศัพท์ธุรกิจยึดนิยามในโค้ด ไม่แปลตามตัวอักษร (BR-I18N-08)
 * - สั้นเข้าไว้ — อังกฤษยาวกว่าไทยเป็นปกติ และของยาวจะไปปลุกบั๊กในกล่องขนาดคงที่
 *   (BR-I18N-17 / docs/conventions/flex-header-truncation.md)
 */
import type { Dictionary } from './th'

export const en: Dictionary = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    loading: 'Loading…',
    retry: 'Try again',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },

  language: {
    buttonLabel: 'Change language',
    // 🛑 ค่านี้เป็นภาษาไทยโดยตั้งใจ ไม่ใช่คำที่ลืมแปล — อยู่ใน THAI_ALLOWED_IN_EN ของเทส
    // ชื่อภาษาต้องเขียนด้วยภาษาของตัวเองเสมอ ไม่งั้นผู้ใช้ที่กดผิดจะหาทางกลับไม่เจอ
    th: 'ไทย',
    en: 'English',
    thCode: 'TH',
    enCode: 'EN',
  },

  menu: {
    dashboard: 'Shop overview',
    // "ภาพรวมกำไร/ขาดทุน" — ใช้ P&L ซึ่งเป็นศัพท์บัญชีสากล สั้นกว่า "Profit and loss" มาก
    // และเมนูซ้ายกว้างคงที่ 245px (BR-I18N-17)
    sales: 'P&L overview',
    orders: {
      ONLINE_SALES: 'Orders',
      // ไม่ใช่ "Services" เฉย ๆ — ของเดิมคือ "การเข้ารับบริการ" ซึ่งหมายถึงใบงานที่ลูกค้าเข้ามารับ
      // บริการ ไม่ใช่รายการบริการที่ร้านมีขาย (อันหลังคือเมนู "ประเภทงาน")
      SERVICE_QUEUE: 'Service visits',
      LODGING: 'Stay bills',
    },
    auctions: 'Auctions',
    products: 'Products',
    inventory: 'Stock',
    queues: 'Schedule',
    rooms: 'Rooms',
    calendar: 'Booking calendar',
    bookings: 'Bookings',
    housekeepers: 'Housekeepers',
    customers: 'Customers',
    expenses: 'Expenses',
    inbox: 'Messages',
    settingsAutoReply: 'Auto-reply',
    settingsCommentReply: 'Comment replies',
    settingsChatbot: 'AI assistant',
    reviews: 'Reviews',
    verification: 'Shop level',
    badges: 'Achievements',
    wallet: 'Wallet',
    subscriptions: 'My plan',
    admins: 'Staff',
    shop: 'Shop',
    publicProfile: 'Storefront',
    // "การจัดส่ง" — เมนูนี้ตั้งค่าการจัดส่งของร้าน ไม่ใช่หน้าตั้งค่าทั่วไป (ชื่อ slug เป็น
    // seller:settings ด้วยเหตุผลทางประวัติศาสตร์ ป้ายถูกเปลี่ยนเป็น "การจัดส่ง" ไปแล้ว)
    settings: 'Shipping',
    settingsChannels: 'Sales channels',
    settingsJobTypes: 'Service types',
  },

  auth: {
    signIn: {
      pageTitle: 'Seller sign-in',
      title: 'Welcome, seller',
      subtitle: 'Enter your username and password to sign in',
      loading: 'Loading…',
      // ชื่อผู้ให้บริการเป็นชื่อแบรนด์ ห้ามแปล — reviewer ต้องจับคู่กับคำอธิบายในใบยื่นได้ทันที
      withApple: 'Sign in with Apple',
      withFacebook: 'Sign in with Facebook',
      withLine: 'Sign in with LINE',
      withInstagram: 'Sign in with Instagram',
      orUsername: 'Or use your username',
      usernameLabel: 'Username',
      passwordLabel: 'Password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      forgotPassword: 'Forgot password?',
      submit: 'Sign in',
      submitting: 'Signing in…',
      noAccount: "Don't have an account?",
      signUp: 'Sign up',
      errUsernameMin: 'Username must be at least 3 characters',
      errUsernameRequired: 'Please enter your username',
      errPasswordRequired: 'Please enter your password',
      errInvalidCredentials: 'Incorrect username or password',
    },
  },

  account: {
    language: {
      cardTitle: 'Language',
      description: 'Choose the display language for the seller app. This affects only your account, not others in your shop.',
      saveSuccess: 'Language changed',
      saveError: "Couldn't change the language. Please try again.",
    },
  },
}
