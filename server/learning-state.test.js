import assert from 'node:assert/strict'
import test from 'node:test'
import { isLanguageProfile, isLearningState, isRewardsState } from './learning-state.js'

function profile() {
  return {
    tasks: [{ id: 'ja-kana', title: '假名入门', description: '练习清音', duration: 10, kind: 'kana', completed: false }],
    taskDate: '2026-10-20',
    studyLog: { '2026-10-19': 20 },
    quizStats: { kana: { correct: 8, total: 10 } },
    cardProgress: { 'ja-kana-a': { ease: 2.5, intervalDays: 2, dueISO: '2026-10-21', reps: 2, lapses: 0 } },
    lessonsCompleted: 3,
    dailyGoal: 30,
    reminderEnabled: true,
    soundEnabled: true,
    strictMode: false,
    reminderTime: '20:00',
  }
}

function versionThreeState() {
  return {
    version: 3,
    activeLanguage: 'ja',
    profiles: { ja: profile(), en: profile(), es: profile() },
    rewards: {
      points: 90,
      checkInDates: ['2026-10-19'],
      unlockedThemes: ['classic', 'sakura'],
      activeTheme: 'sakura',
    },
  }
}

test('accepts the current version 3 envelope', () => {
  assert.equal(isLearningState(versionThreeState()), true)
})

test('keeps version 2 and legacy profile compatibility', () => {
  const state = versionThreeState()
  assert.equal(isLearningState({ ...state, version: 2, rewards: undefined }), true)
  assert.equal(isLearningState(profile()), true)
})

test('rejects malformed profile settings and statistics', () => {
  assert.equal(isLanguageProfile({ ...profile(), reminderTime: '25:90' }), false)
  assert.equal(isLanguageProfile({ ...profile(), quizStats: { kana: { correct: 11, total: 10 } } }), false)
  assert.equal(isLanguageProfile({ ...profile(), dailyGoal: 0 }), false)
})

test('rejects invalid rewards and locked active themes', () => {
  const rewards = versionThreeState().rewards
  assert.equal(isRewardsState(rewards), true)
  assert.equal(isRewardsState({ ...rewards, points: -1 }), false)
  assert.equal(isRewardsState({ ...rewards, checkInDates: ['2026-10-19', '2026-10-19'] }), false)
  assert.equal(isRewardsState({ ...rewards, unlockedThemes: ['classic'], activeTheme: 'sakura' }), false)
})

test('rejects unsupported envelope versions instead of treating them as profiles', () => {
  assert.equal(isLearningState({ ...versionThreeState(), version: 4 }), false)
})
