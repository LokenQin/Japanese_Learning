const LANGUAGES = ['ja', 'en', 'es']
const TASK_KINDS = new Set(['kana', 'vocabulary', 'listening', 'review'])
const THEME_IDS = new Set(['classic', 'sakura', 'forest', 'midnight'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function isLearningState(value) {
  if (!isRecord(value)) return false

  if (value.version === 2 || value.version === 3) {
    return Boolean(
      LANGUAGES.includes(value.activeLanguage) &&
      isRecord(value.profiles) &&
      LANGUAGES.every((language) => isLanguageProfile(value.profiles[language])) &&
      (value.version === 2 || isRewardsState(value.rewards)),
    )
  }

  // Accounts created before multi-language support stored one profile directly.
  return isLanguageProfile(value)
}

export function isLanguageProfile(value) {
  return Boolean(
    isRecord(value) &&
    Array.isArray(value.tasks) &&
    value.tasks.length <= 100 &&
    value.tasks.every(isDailyTask) &&
    typeof value.taskDate === 'string' &&
    ISO_DATE.test(value.taskDate) &&
    isStudyLog(value.studyLog) &&
    isCardProgressMap(value.cardProgress) &&
    isQuizStats(value.quizStats) &&
    isIntegerInRange(value.lessonsCompleted, 0, 10000) &&
    isIntegerInRange(value.dailyGoal, 5, 240) &&
    typeof value.reminderEnabled === 'boolean' &&
    typeof value.soundEnabled === 'boolean' &&
    typeof value.strictMode === 'boolean' &&
    typeof value.reminderTime === 'string' &&
    CLOCK_TIME.test(value.reminderTime)
  )
}

export function isRewardsState(value) {
  if (!isRecord(value)) return false
  if (!isIntegerInRange(value.points, 0, 10_000_000)) return false
  if (!Array.isArray(value.checkInDates) || value.checkInDates.length > 2000) return false
  if (!value.checkInDates.every((date) => typeof date === 'string' && ISO_DATE.test(date))) return false
  if (new Set(value.checkInDates).size !== value.checkInDates.length) return false
  if (!Array.isArray(value.unlockedThemes) || value.unlockedThemes.length > THEME_IDS.size) return false
  if (!value.unlockedThemes.every((theme) => THEME_IDS.has(theme))) return false
  if (new Set(value.unlockedThemes).size !== value.unlockedThemes.length) return false
  if (!value.unlockedThemes.includes('classic')) return false
  return THEME_IDS.has(value.activeTheme) && value.unlockedThemes.includes(value.activeTheme)
}

function isDailyTask(task) {
  return Boolean(
    isRecord(task) &&
    isShortText(task.id, 80) &&
    isShortText(task.title, 120) &&
    isShortText(task.description, 500) &&
    isIntegerInRange(task.duration, 1, 240) &&
    TASK_KINDS.has(task.kind) &&
    typeof task.completed === 'boolean',
  )
}

function isStudyLog(value) {
  return Boolean(
    isRecord(value) &&
    Object.keys(value).length <= 400 &&
    Object.entries(value).every(([date, minutes]) =>
      ISO_DATE.test(date) && isIntegerInRange(minutes, 0, 1440),
    ),
  )
}

function isCardProgressMap(value) {
  return Boolean(
    isRecord(value) &&
    Object.keys(value).length <= 500 &&
    Object.values(value).every((progress) =>
      isRecord(progress) &&
      Number.isFinite(progress.ease) && progress.ease >= 1 && progress.ease <= 3 &&
      isIntegerInRange(progress.intervalDays, 0, 3650) &&
      isIntegerInRange(progress.reps, 0, 100000) &&
      isIntegerInRange(progress.lapses, 0, 100000) &&
      typeof progress.dueISO === 'string' && ISO_DATE.test(progress.dueISO),
    ),
  )
}

function isQuizStats(value) {
  return Boolean(
    isRecord(value) &&
    Object.keys(value).length <= TASK_KINDS.size &&
    Object.entries(value).every(([kind, stat]) =>
      TASK_KINDS.has(kind) &&
      isRecord(stat) &&
      isIntegerInRange(stat.correct, 0, 1_000_000) &&
      isIntegerInRange(stat.total, 0, 1_000_000) &&
      stat.correct <= stat.total,
    ),
  )
}

function isShortText(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
