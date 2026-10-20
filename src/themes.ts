import type { RewardsState, ThemeId } from './types'

export const DAILY_REWARD_POINTS = 30

export const themeCatalog: Array<{
  id: ThemeId
  name: string
  description: string
  cost: number
  swatches: [string, string, string]
}> = [
  { id: 'classic', name: '纸上经典', description: '温和纸色与朱红重点', cost: 0, swatches: ['#f5f4f0', '#c5483d', '#30322f'] },
  { id: 'sakura', name: '樱色晨光', description: '柔粉纸面与莓红强调', cost: 90, swatches: ['#fff4f3', '#b7435a', '#453238'] },
  { id: 'forest', name: '森林午后', description: '浅叶背景与琥珀点缀', cost: 180, swatches: ['#f1f5ee', '#39705a', '#26332d'] },
  { id: 'midnight', name: '墨夜灯火', description: '深色书桌与暖色文字', cost: 300, swatches: ['#1c211f', '#d96457', '#f1e7d4'] },
]

const themeIds = new Set<ThemeId>(themeCatalog.map((theme) => theme.id))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIds.has(value as ThemeId)
}

export function normalizeRewards(raw: unknown): RewardsState {
  const value = raw && typeof raw === 'object' ? raw as Partial<RewardsState> : {}
  const unlockedThemes = Array.isArray(value.unlockedThemes)
    ? value.unlockedThemes.filter(isThemeId)
    : []
  const uniqueUnlocked = [...new Set<ThemeId>(['classic', ...unlockedThemes])]
  const activeTheme = isThemeId(value.activeTheme) && uniqueUnlocked.includes(value.activeTheme)
    ? value.activeTheme
    : 'classic'
  const checkInDates = Array.isArray(value.checkInDates)
    ? [...new Set(value.checkInDates.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)))]
    : []

  return {
    points: Number.isFinite(value.points) ? Math.max(0, Math.floor(Number(value.points))) : 0,
    checkInDates,
    unlockedThemes: uniqueUnlocked,
    activeTheme,
  }
}

export function themeById(id: ThemeId) {
  return themeCatalog.find((theme) => theme.id === id) ?? themeCatalog[0]
}
