import type { AppState, CardProgress, QuizStat, Rating, ReviewCard } from './types'

export const MAX_NEW_CARDS_PER_DAY = 5
export const MASTERED_INTERVAL_DAYS = 21

const EASE_MIN = 1.3
const EASE_MAX = 2.8
const DEFAULT_EASE = 2.5

export function todayISO(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return todayISO(date)
}

function clampEase(ease: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, Math.round(ease * 100) / 100))
}

function nextInterval(progress: CardProgress, rating: Rating): number {
  if (rating === 'again') return 0
  if (rating === 'hard') return Math.max(1, Math.round(progress.intervalDays * 1.2) || 1)
  if (progress.reps === 0) return 1
  if (progress.reps === 1 || progress.intervalDays < 2) return 6
  const base = Math.round(progress.intervalDays * progress.ease)
  return rating === 'easy' ? Math.round(base * 1.3) : base
}

/** SM-2 简化调度：根据评分计算卡片下一次复习进度 */
export function scheduleCard(progress: CardProgress | undefined, rating: Rating, today = todayISO()): CardProgress {
  const current: CardProgress = progress ?? {
    ease: DEFAULT_EASE,
    intervalDays: 0,
    dueISO: today,
    reps: 0,
    lapses: 0,
  }
  const intervalDays = nextInterval(current, rating)
  const easeDelta = rating === 'again' ? -0.2 : rating === 'hard' ? -0.15 : rating === 'easy' ? 0.15 : 0
  return {
    ease: clampEase(current.ease + easeDelta),
    intervalDays,
    dueISO: intervalDays === 0 ? today : addDaysISO(today, intervalDays),
    reps: rating === 'again' ? current.reps : current.reps + 1,
    lapses: current.lapses + (rating === 'again' ? 1 : 0),
  }
}

/** 掌握度 0-100：未学为 0，间隔达到 MASTERED_INTERVAL_DAYS 视为 100 */
export function masteryOf(progress: CardProgress | undefined): number {
  if (!progress || progress.reps === 0) return 0
  if (progress.intervalDays >= MASTERED_INTERVAL_DAYS) return 100
  const scaled = (Math.log2(progress.intervalDays + 1) / Math.log2(MASTERED_INTERVAL_DAYS + 1)) * 100
  return Math.max(1, Math.min(99, Math.round(scaled)))
}

export function isDue(progress: CardProgress | undefined, today = todayISO()): boolean {
  if (!progress) return true
  return progress.dueISO <= today
}

/** 今日复习队列：到期卡片按到期日排序，未学新卡补足（每日新卡上限） */
export function reviewQueueToday(
  cards: ReviewCard[],
  progress: Record<string, CardProgress>,
  today = todayISO(),
): { card: ReviewCard; progress: CardProgress | undefined }[] {
  const due: { card: ReviewCard; progress: CardProgress; order: string }[] = []
  const fresh: ReviewCard[] = []
  for (const card of cards) {
    const cardProgress = progress[card.id]
    if (!cardProgress || cardProgress.reps === 0) {
      fresh.push(card)
      continue
    }
    if (isDue(cardProgress, today)) due.push({ card, progress: cardProgress, order: cardProgress.dueISO })
  }
  due.sort((a, b) => (a.order === b.order ? a.card.id.localeCompare(b.card.id) : a.order < b.order ? -1 : 1))
  return [
    ...due.map((entry) => ({ card: entry.card, progress: entry.progress })),
    ...fresh.slice(0, MAX_NEW_CARDS_PER_DAY).map((card) => ({ card, progress: undefined })),
  ]
}

/** 下一次到期日期（用于"全部完成"提示） */
export function nextDueDate(progress: Record<string, CardProgress>, today = todayISO()): string | null {
  const future = Object.values(progress)
    .filter((cardProgress) => cardProgress.reps > 0 && cardProgress.dueISO > today)
    .map((cardProgress) => cardProgress.dueISO)
    .sort()
  return future[0] ?? null
}

/** 评分按钮的下次间隔文案 */
export function intervalLabel(progress: CardProgress | undefined, rating: Rating): string {
  const scheduled = scheduleCard(progress, rating)
  if (scheduled.intervalDays === 0) return '稍后再来'
  if (scheduled.intervalDays === 1) return '明天'
  return `${scheduled.intervalDays} 天后`
}

/** 连续学习天数：从今天（或昨天）往前连续有学习记录的天数 */
export function streakOf(studyLog: Record<string, number>, today = todayISO()): number {
  const hasStudied = (iso: string) => (studyLog[iso] ?? 0) > 0
  if (!hasStudied(today) && !hasStudied(addDaysISO(today, -1))) return 0
  let cursor = hasStudied(today) ? today : addDaysISO(today, -1)
  let streak = 0
  while (hasStudied(cursor)) {
    streak += 1
    cursor = addDaysISO(cursor, -1)
  }
  return streak
}

/** 本周（周一至周日）每日学习分钟数，索引 0 = 周一 */
export function weekMinutes(studyLog: Record<string, number>, today = todayISO()): number[] {
  const date = new Date(`${today}T00:00:00`)
  const weekdayOffset = (date.getDay() + 6) % 7
  const monday = addDaysISO(today, -weekdayOffset)
  return Array.from({ length: 7 }, (_, index) => studyLog[addDaysISO(monday, index)] ?? 0)
}

export function weekRangeLabel(today = todayISO()): string {
  const date = new Date(`${today}T00:00:00`)
  const weekdayOffset = (date.getDay() + 6) % 7
  const monday = new Date(date)
  monday.setDate(monday.getDate() - weekdayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const format = (value: Date) => `${value.getMonth() + 1} 月 ${value.getDate()} 日`
  return `${format(monday)} - ${format(sunday)}`
}

export function weekTotalMinutes(studyLog: Record<string, number>, today = todayISO()): number {
  return weekMinutes(studyLog, today).reduce((sum, minutes) => sum + minutes, 0)
}

export function masteredCount(progress: Record<string, CardProgress>): number {
  return Object.values(progress).filter((cardProgress) => cardProgress.intervalDays >= MASTERED_INTERVAL_DAYS).length
}

/** 某组卡片的平均掌握度；只统计已学过的卡片 */
export function groupMastery(
  cards: ReviewCard[],
  progress: Record<string, CardProgress>,
  group: ReviewCard['group'],
): { mastery: number; learned: number; total: number } {
  const groupCards = cards.filter((card) => card.group === group)
  const learned = groupCards.filter((card) => (progress[card.id]?.reps ?? 0) > 0)
  if (!learned.length) return { mastery: 0, learned: 0, total: groupCards.length }
  const sum = learned.reduce((total, card) => total + masteryOf(progress[card.id]), 0)
  return { mastery: Math.round(sum / learned.length), learned: learned.length, total: groupCards.length }
}

export function quizAccuracy(stats: Partial<Record<string, QuizStat>>): number | null {
  const entries = Object.values(stats).filter((stat): stat is QuizStat => Boolean(stat && stat.total > 0))
  if (!entries.length) return null
  const correct = entries.reduce((sum, stat) => sum + stat.correct, 0)
  const total = entries.reduce((sum, stat) => sum + stat.total, 0)
  return total ? Math.round((correct / total) * 100) : null
}

/** 综合掌握度：复习卡片平均掌握度与测验正确率的加权平均 */
export function overallMastery(state: AppState, cards: ReviewCard[]): number {
  const kana = groupMastery(cards, state.cardProgress, 'kana').mastery
  const vocab = groupMastery(cards, state.cardProgress, 'vocab').mastery
  const accuracy = quizAccuracy(state.quizStats)
  const parts = [kana, vocab, ...(accuracy !== null ? [accuracy] : [])]
  return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length)
}
