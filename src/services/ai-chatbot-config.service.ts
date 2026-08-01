// feature 00023 · phase `00023-ai-enhance` — ตั้งค่า ChatBot ระดับร้าน
//
// แยก endpoint/service จาก `auto-reply-config.service` โดยเจตนา: ตัวนั้นเป็น full-replace
// (upsertConfig เขียนทุกคอลัมน์ทุกครั้ง) การเอาฟิลด์ AI ไปฝากไว้แปลว่าทุกครั้งที่กดสวิตช์ AI
// ต้อง merge ค่า cooldown/handoffPhrases/ตารางเวลาของ Auto Reply มาด้วย ซึ่งพลาดทีเดียว
// = ล้างการตั้งค่าที่ร้านทำไว้ทิ้ง — ไฟล์นี้แตะเฉพาะคอลัมน์ของตัวเอง

import { prisma } from '@/lib/prisma'
import { DEFAULT_AI_DAILY_CAP_BAHT } from '@/lib/auto-reply-constants'

export interface ChatbotConfig {
  aiChatbotEnabled: boolean
  aiChatbotTone: string | null
  aiChatbotStartTime: string | null
  aiChatbotEndTime: string | null
  aiEnhanceEnabled: boolean
  aiDailyCapBaht: number
  aiCapAlertSmsOptIn: boolean
}

const DEFAULTS: ChatbotConfig = {
  aiChatbotEnabled: false,
  aiChatbotTone: null,
  aiChatbotStartTime: null,
  aiChatbotEndTime: null,
  aiEnhanceEnabled: false,
  aiDailyCapBaht: DEFAULT_AI_DAILY_CAP_BAHT,
  aiCapAlertSmsOptIn: false,
}

export async function getChatbotConfig(shopId: string): Promise<ChatbotConfig> {
  const row = await prisma.autoReplyConfig.findUnique({
    where: { shopId },
    select: {
      aiChatbotEnabled: true,
      aiChatbotTone: true,
      aiChatbotStartTime: true,
      aiChatbotEndTime: true,
      aiEnhanceEnabled: true,
      aiDailyCapBaht: true,
      aiCapAlertSmsOptIn: true,
    },
  })
  // ร้านที่ยังไม่เคยมีแถว config = ยังไม่เคยตั้งอะไรเลย -> ค่าเริ่มต้นทั้งหมด (ไม่ใช่ error)
  return row ?? DEFAULTS
}

export async function updateChatbotConfig(
  shopId: string,
  input: Partial<ChatbotConfig>
): Promise<ChatbotConfig> {
  const data = {
    ...(input.aiChatbotEnabled !== undefined ? { aiChatbotEnabled: input.aiChatbotEnabled } : {}),
    ...(input.aiChatbotTone !== undefined ? { aiChatbotTone: input.aiChatbotTone?.trim() || null } : {}),
    ...(input.aiChatbotStartTime !== undefined ? { aiChatbotStartTime: input.aiChatbotStartTime || null } : {}),
    ...(input.aiChatbotEndTime !== undefined ? { aiChatbotEndTime: input.aiChatbotEndTime || null } : {}),
    ...(input.aiEnhanceEnabled !== undefined ? { aiEnhanceEnabled: input.aiEnhanceEnabled } : {}),
    ...(input.aiDailyCapBaht !== undefined ? { aiDailyCapBaht: input.aiDailyCapBaht } : {}),
    ...(input.aiCapAlertSmsOptIn !== undefined ? { aiCapAlertSmsOptIn: input.aiCapAlertSmsOptIn } : {}),
  }

  // upsert: ร้านที่ยังไม่มีแถว config ต้องสร้างได้จากหน้านี้ ไม่ใช่บังคับให้ไปตั้ง Auto Reply ก่อน
  const row = await prisma.autoReplyConfig.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
    select: {
      aiChatbotEnabled: true,
      aiChatbotTone: true,
      aiChatbotStartTime: true,
      aiChatbotEndTime: true,
      aiEnhanceEnabled: true,
      aiDailyCapBaht: true,
      aiCapAlertSmsOptIn: true,
    },
  })
  return row
}
