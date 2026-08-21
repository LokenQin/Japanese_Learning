export type Page = 'today' | 'learn' | 'review' | 'insights' | 'settings'

export type LanguageCode = 'ja' | 'en' | 'es'

export type TaskKind = 'kana' | 'vocabulary' | 'listening' | 'review'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export type CardGroup = 'kana' | 'vocab'

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

export interface LearningStateEnvelope {
  version: 2
  activeLanguage: LanguageCode
  profiles: Record<LanguageCode, AppState>
}
