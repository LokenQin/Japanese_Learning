import { useCallback, useEffect, useRef, useState } from 'react'
import { loadLearningState, saveLearningState } from './api'
import { createInitialState, getLanguagePack } from './data'
import { scheduleCard, todayISO } from './srs'
import { DAILY_REWARD_POINTS, isThemeId, normalizeRewards, themeById } from './themes'
import type { AppState, LanguageCode, LearningStateEnvelope, QuizStat, Rating, TaskKind, ThemeId } from './types'

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
  const isEnvelope = value?.profiles && typeof value.profiles === 'object'
  const activeLanguage: LanguageCode = isEnvelope && ['ja', 'en', 'es'].includes(value.activeLanguage ?? '') ? value.activeLanguage as LanguageCode : 'ja'
  return {
    version: 3,
    activeLanguage,
    profiles: {
      ja: migrateProfile(isEnvelope ? value.profiles?.ja ?? null : value, 'ja', today),
      en: migrateProfile(isEnvelope ? value.profiles?.en ?? null : null, 'en', today),
      es: migrateProfile(isEnvelope ? value.profiles?.es ?? null : null, 'es', today),
    },
    rewards: normalizeRewards(isEnvelope ? value.rewards : null),
  }
}

function createEmptyEnvelope() {
  const empty = migrateEnvelope(null)
  const storedTheme = localStorage.getItem('kotoba-theme-v1')
  if (isThemeId(storedTheme)) empty.rewards.activeTheme = storedTheme
  return empty
}

export function useLearningState() {
  const [envelope, setEnvelope] = useState<LearningStateEnvelope>(createEmptyEnvelope)
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [syncError, setSyncError] = useState('')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const revisionRef = useRef(0)
  const mountedRef = useRef(true)
  const state = envelope.profiles[envelope.activeLanguage]

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

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
    const revision = ++revisionRef.current
    const snapshot = envelope
    const timeout = window.setTimeout(() => {
      saveChainRef.current = saveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          if (!mountedRef.current) return
          setSyncStatus('saving')
          try {
            await saveLearningState(snapshot)
            if (!mountedRef.current || revision !== revisionRef.current) return
            localStorage.removeItem(LEGACY_STORAGE_KEY)
            setSyncError('')
            setSyncStatus('synced')
          } catch (error) {
            if (!mountedRef.current || revision !== revisionRef.current) return
            setSyncError(error instanceof Error ? error.message : '学习数据同步失败')
            setSyncStatus('error')
          }
        })
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [loaded, envelope, saveAttempt])

  const refreshForToday = useCallback(() => {
    const today = todayISO()
    setEnvelope((current) => {
      if (Object.values(current.profiles).every((profile) => profile.taskDate === today)) return current
      return {
        ...current,
        profiles: {
          ja: current.profiles.ja.taskDate === today ? current.profiles.ja : migrateProfile(current.profiles.ja, 'ja', today),
          en: current.profiles.en.taskDate === today ? current.profiles.en : migrateProfile(current.profiles.en, 'en', today),
          es: current.profiles.es.taskDate === today ? current.profiles.es : migrateProfile(current.profiles.es, 'es', today),
        },
      }
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshForToday() }
    const interval = window.setInterval(refreshForToday, 60_000)
    window.addEventListener('focus', refreshForToday)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshForToday)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loaded, refreshForToday])

  useEffect(() => {
    document.documentElement.dataset.theme = envelope.rewards.activeTheme
    localStorage.setItem('kotoba-theme-v1', envelope.rewards.activeTheme)
  }, [envelope.rewards.activeTheme])

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

  const claimCheckIn = () => setEnvelope((current) => {
    const today = todayISO()
    const profile = current.profiles[current.activeLanguage]
    if (profile.taskDate !== today || !profile.tasks.length || profile.tasks.some((task) => !task.completed) || current.rewards.checkInDates.includes(today)) return current
    return {
      ...current,
      rewards: {
        ...current.rewards,
        points: current.rewards.points + DAILY_REWARD_POINTS,
        checkInDates: [...current.rewards.checkInDates, today],
      },
    }
  })

  const selectTheme = (themeId: ThemeId) => setEnvelope((current) => {
    const theme = themeById(themeId)
    const unlocked = current.rewards.unlockedThemes.includes(themeId)
    if (!unlocked && current.rewards.points < theme.cost) return current
    return {
      ...current,
      rewards: {
        ...current.rewards,
        points: unlocked ? current.rewards.points : current.rewards.points - theme.cost,
        unlockedThemes: unlocked ? current.rewards.unlockedThemes : [...current.rewards.unlockedThemes, themeId],
        activeTheme: themeId,
      },
    }
  })

  const retrySync = () => setSaveAttempt((attempt) => attempt + 1)

  return { state, rewards: envelope.rewards, activeLanguage: envelope.activeLanguage, loaded, syncStatus, syncError, switchLanguage, toggleTask, rateCard, recordQuiz, completeLesson, updateSetting, claimCheckIn, selectTheme, retrySync }
}
