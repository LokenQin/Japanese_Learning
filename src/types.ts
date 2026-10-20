export type Page = 'today' | 'learn' | 'review' | 'insights' | 'settings'

export type LanguageCode = 'ja' | 'en' | 'es'

export type TaskKind = 'kana' | 'vocabulary' | 'listening' | 'review'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export type CardGroup = 'kana' | 'vocab'

export type ThemeId = 'classic' | 'sakura' | 'forest' | 'midnight'

export interface DailyTask {
  id: string
  title: string
  description: string
  duration: number
  kind: TaskKind
  completed: boolean
}

export interface ReviewCard {
  id: string
  prompt: string
  reading: string
  answer: string
  hint: string
  group: CardGroup
  speakText: string
  pairedPrompt?: string
  scriptLabel?: string
  example?: string
  exampleMeaning?: string
}

export interface CardProgress {
  ease: number
  intervalDays: number
  dueISO: string
  reps: number
  lapses: number
}

export interface QuizStat {
  correct: number
  total: number
}

export interface AppState {
  tasks: DailyTask[]
  taskDate: string
  studyLog: Record<string, number>
  quizStats: Partial<Record<TaskKind, QuizStat>>
  cardProgress: Record<string, CardProgress>
  lessonsCompleted: number
  dailyGoal: number
  reminderEnabled: boolean
  soundEnabled: boolean
  strictMode: boolean
  reminderTime: string
}

export interface RewardsState {
  points: number
  checkInDates: string[]
  unlockedThemes: ThemeId[]
  activeTheme: ThemeId
}

export interface LearningStateEnvelope {
  version: 3
  activeLanguage: LanguageCode
  profiles: Record<LanguageCode, AppState>
  rewards: RewardsState
}
