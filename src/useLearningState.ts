import { useEffect, useState } from 'react'
import { loadLearningState, saveLearningState } from './api'
import { createInitialState, getLanguagePack } from './data'
import { scheduleCard, todayISO } from './srs'
import type { AppState, LanguageCode, LearningStateEnvelope, QuizStat, Rating, TaskKind } from './types'

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'synced' | 'error'
const LEGACY_STORAGE_KEY = 'kotoba-learning-state-v1'

function readLegacyState(): unknown {
  try { const stored = localStorage.getItem(LEGACY_STORAGE_KEY); return stored ? JSON.parse(stored) : null } catch { return null }
}

function migrateProfile(raw: Partial<AppState> | null, language: LanguageCode, today: string): AppState {
  const initial = createInitialState(language)
  const merged: AppState = { ...initial, ...(raw ?? {}) }
  merged.studyLog = merged.studyLog && typeof merged.studyLog === 'object' ? merged.studyLog : {}
  merged.quizStats = merged.quizStats && typeof merged.quizStats === 'object' ? merged.quizStats : {}
  merged.cardProgress = merged.cardProgress && typeof merged.cardProgress === 'object' ? merged.cardProgress : {}
  if (language === 'ja') {
    for (const [id, progress] of Object.entries(merged.cardProgress)) {
      if ((id.startsWith('kana-') || id.startsWith('vocab-')) && !merged.cardProgress[`ja-${id}`]) {
        merged.cardProgress[`ja-${id}`] = progress
        delete merged.cardProgress[id]
      }
    }
  }
  merged.lessonsCompleted = Number.isFinite(merged.lessonsCompleted) && merged.lessonsCompleted >= 0 ? merged.lessonsCompleted : 0

  const oldTasks = Array.isArray(raw?.tasks) ? raw.tasks : []
  merged.tasks = getLanguagePack(language).dailyTasks.map((task) => {
    const old = oldTasks.find((item) => item.id === task.id || (language === 'ja' && item.kind === task.kind))
    return { ...task, completed: Boolean(old?.completed) }
  })
  if (!merged.taskDate || merged.taskDate !== today) {
    if (raw && !raw.taskDate) {
      const minutes = merged.tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.duration, 0)
      if (minutes) merged.studyLog = { ...merged.studyLog, [today]: (merged.studyLog[today] ?? 0) + minutes }
    }
    merged.taskDate = today
    merged.tasks = merged.tasks.map((task) => ({ ...task, completed: false }))
  }
  return merged
}

function migrateEnvelope(raw: unknown): LearningStateEnvelope {
  const today = todayISO()
  const value = raw && typeof raw === 'object' ? raw as Partial<LearningStateEnvelope> & Partial<AppState> : null
  const isEnvelope = value?.version === 2 && value.profiles && typeof value.profiles === 'object'
  const activeLanguage: LanguageCode = isEnvelope && ['ja', 'en', 'es'].includes(value.activeLanguage ?? '') ? value.activeLanguage as LanguageCode : 'ja'
  return {
    version: 2,
    activeLanguage,
    profiles: {
      ja: migrateProfile(isEnvelope ? value.profiles?.ja ?? null : value, 'ja', today),
      en: migrateProfile(isEnvelope ? value.profiles?.en ?? null : null, 'en', today),
      es: migrateProfile(isEnvelope ? value.profiles?.es ?? null : null, 'es', today),
    },
  }
}

const emptyEnvelope = migrateEnvelope(null)

export function useLearningState() {
  const [envelope, setEnvelope] = useState<LearningStateEnvelope>(emptyEnvelope)
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [syncError, setSyncError] = useState('')
  const state = envelope.profiles[envelope.activeLanguage]

  useEffect(() => {
    let cancelled = false
    loadLearningState().then(({ state: remoteState }) => {
      if (cancelled) return
      setEnvelope(migrateEnvelope(remoteState ?? readLegacyState()))
      setLoaded(true); setSyncStatus('synced')
    }).catch((error: Error) => {
      if (cancelled) return
      setSyncError(error.message); setSyncStatus('error')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const timeout = window.setTimeout(() => {
      setSyncStatus('saving')
      saveLearningState(envelope).then(() => {
        localStorage.removeItem(LEGACY_STORAGE_KEY); setSyncError(''); setSyncStatus('synced')
      }).catch((error: Error) => { setSyncError(error.message); setSyncStatus('error') })
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [loaded, envelope])

  const updateProfile = (updater: (current: AppState) => AppState) => {
    setEnvelope((current) => ({ ...current, profiles: { ...current.profiles, [current.activeLanguage]: updater(current.profiles[current.activeLanguage]) } }))
  }
  const switchLanguage = (language: LanguageCode) => setEnvelope((current) => ({ ...current, activeLanguage: language }))
  const toggleTask = (id: string) => updateProfile((current) => {
    const task = current.tasks.find((item) => item.id === id)
    if (!task) return current
    const today = todayISO(); const delta = task.completed ? -task.duration : task.duration
    return { ...current, tasks: current.tasks.map((item) => item.id === id ? { ...item, completed: !item.completed } : item), studyLog: { ...current.studyLog, [today]: Math.max(0, (current.studyLog[today] ?? 0) + delta) } }
  })
  const rateCard = (cardId: string, rating: Rating) => updateProfile((current) => ({ ...current, cardProgress: { ...current.cardProgress, [cardId]: scheduleCard(current.cardProgress[cardId], rating) } }))
  const recordQuiz = (kind: TaskKind, correct: number, total: number) => {
    if (total <= 0) return
    updateProfile((current) => {
      const existing: QuizStat = current.quizStats[kind] ?? { correct: 0, total: 0 }
      return { ...current, quizStats: { ...current.quizStats, [kind]: { correct: existing.correct + correct, total: existing.total + total } } }
    })
  }
  const completeLesson = () => updateProfile((current) => ({ ...current, lessonsCompleted: current.lessonsCompleted + 1 }))
  const updateSetting = <K extends keyof AppState>(key: K, value: AppState[K]) => updateProfile((current) => ({ ...current, [key]: value }))

  return { state, activeLanguage: envelope.activeLanguage, loaded, syncStatus, syncError, switchLanguage, toggleTask, rateCard, recordQuiz, completeLesson, updateSetting }
}
