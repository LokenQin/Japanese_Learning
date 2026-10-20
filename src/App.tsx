import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Cloud,
  CloudOff,
  CircleCheck,
  Coins,
  Flame,
  Gift,
  Headphones,
  Home,
  Languages,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  LoaderCircle,
  Menu,
  Palette,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  Volume2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { resetPassword, updateRecoveryKeyword } from './api'
import { courseProgress, getLanguagePack, languageOptions, totalLessons } from './data'
import type { KanaPair, LanguagePack } from './data'
import {
  groupMastery,
  intervalLabel,
  masteryOf,
  masteredCount,
  nextDueDate,
  overallMastery,
  quizAccuracy,
  reviewQueueToday,
  streakOf,
  todayISO,
  weekMinutes,
  weekRangeLabel,
  weekTotalMinutes,
} from './srs'
import { DAILY_REWARD_POINTS, themeCatalog } from './themes'
import type { AppState, DailyTask, LanguageCode, Page, QuizStat, Rating, ReviewCard, RewardsState, TaskKind, ThemeId } from './types'
import { useAuth } from './useAuth'
import { useLearningState } from './useLearningState'
import type { SyncStatus } from './useLearningState'

const navItems: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: '今日', icon: Home },
  { id: 'learn', label: '学习', icon: BookOpen },
  { id: 'review', label: '复习', icon: RotateCcw },
  { id: 'insights', label: '数据', icon: BarChart3 },
  { id: 'settings', label: '设置', icon: Settings },
]

const taskIcons: Record<TaskKind, LucideIcon> = {
  kana: Languages,
  vocabulary: BookOpen,
  listening: Headphones,
  review: RotateCcw,
}

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

const studyImage = window.location.protocol === 'file:'
  ? './public/images/japanese-study-desk.jpg'
  : '/images/japanese-study-desk.jpg'

function formatToday(): string {
  const now = new Date()
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${weekdayLabels[now.getDay()]}`
}

function formatISODate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function playSpeech(text: string, locale: string) {
  if (!text || !('speechSynthesis' in window)) return
  const synthesis = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(text)
  const language = locale.toLowerCase()
  const voices = synthesis.getVoices()
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === language)
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.split('-')[0]))
    ?? null
  utterance.lang = locale
  utterance.rate = 0.78
  synthesis.cancel()
  synthesis.speak(utterance)
}

function AudioButton({ text, locale, label = '播放发音', className = '' }: { text: string; locale: string; label?: string; className?: string }) {
  const supported = 'speechSynthesis' in window
  return (
    <button
      type="button"
      className={`audio-button ${className}`}
      onClick={(event) => { event.stopPropagation(); playSpeech(text, locale) }}
      aria-label={`${label}：${text}`}
      title={supported ? label : '当前浏览器不支持语音播放'}
      disabled={!supported}
    >
      <Volume2 size={17} />
      <span>{label}</span>
    </button>
  )
}

function App() {
  const auth = useAuth()

  if (auth.status === 'loading') return <AppLoading label="正在连接云端账户" />
  if (auth.status === 'unauthenticated') return <LoginPage onLogin={auth.login} onRegister={auth.register} />
  if (auth.status === 'unavailable') {
    return <ConnectionError message={auth.error} onRetry={auth.retry} />
  }

  return (
    <AuthenticatedApp
      displayName={auth.user?.displayName || '学习者'}
      onLogout={auth.logout}
    />
  )
}

function AuthenticatedApp({ displayName, onLogout }: { displayName: string; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('today')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [lessonTask, setLessonTask] = useState<DailyTask | null>(null)
  const { state, rewards, activeLanguage, loaded, syncStatus, syncError, switchLanguage, toggleTask, rateCard, recordQuiz, completeLesson, updateSetting, claimCheckIn, selectTheme, retrySync } = useLearningState()
  const pack = getLanguagePack(activeLanguage)

  if (!loaded && syncStatus !== 'error') return <AppLoading label="正在同步学习数据" />
  if (!loaded && syncStatus === 'error') {
    return <ConnectionError message={syncError} onRetry={() => window.location.reload()} />
  }

  const streak = streakOf(state.studyLog)
  const reviewQueue = reviewQueueToday(pack.reviewCards, state.cardProgress)
  const pendingTaskCount = state.tasks.filter((task) => !task.completed).length
  const checkedInToday = rewards.checkInDates.includes(todayISO())

  const navigate = (target: Page) => {
    setPage(target)
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startTask = (task: DailyTask) => {
    if (task.kind === 'review') navigate('review')
    else setLessonTask(task)
  }

  const startNextTask = () => {
    const next = state.tasks.find((task) => !task.completed && task.kind !== 'review') ??
      state.tasks.find((task) => !task.completed)
    if (!next) return
    startTask(next)
  }

  const completeReviewQueue = () => {
    const reviewTask = state.tasks.find((task) => task.kind === 'review')
    if (reviewTask && !reviewTask.completed) toggleTask(reviewTask.id)
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        open={mobileNavOpen}
        displayName={displayName}
        lessonsCompleted={state.lessonsCompleted}
        reviewCount={reviewQueue.length}
        pack={pack}
        activeLanguage={activeLanguage}
        onLanguageChange={switchLanguage}
        onNavigate={navigate}
        onClose={() => setMobileNavOpen(false)}
        onLogout={onLogout}
      />
      <main className="main-area">
        <Topbar
          page={page}
          streak={streak}
          points={rewards.points}
          pendingTaskCount={pendingTaskCount}
          reviewCount={reviewQueue.length}
          checkedInToday={checkedInToday}
          notificationsOpen={notificationsOpen}
          syncStatus={syncStatus}
          syncError={syncError}
          onMenu={() => setMobileNavOpen(true)}
          onToggleNotifications={() => setNotificationsOpen((open) => !open)}
          onNavigate={navigate}
          onRetrySync={retrySync}
        />
        <div className="page-container">
          {page === 'today' && (
            <TodayPage
              state={state}
              streak={streak}
              reviewQueueLength={reviewQueue.length}
              onToggleTask={toggleTask}
              onStartTask={startTask}
              onNavigate={navigate}
              displayName={displayName}
              pack={pack}
              rewards={rewards}
              onClaimCheckIn={claimCheckIn}
            />
          )}
          {page === 'learn' && <LearnPage pack={pack} lessonsCompleted={state.lessonsCompleted} onStart={startNextTask} />}
          {page === 'review' && (
            <ReviewPage key={activeLanguage} pack={pack} cardProgress={state.cardProgress} onRate={rateCard} onQueueCleared={completeReviewQueue} />
          )}
          {page === 'insights' && <InsightsPage pack={pack} state={state} />}
          {page === 'settings' && <SettingsPage pack={pack} activeLanguage={activeLanguage} onLanguageChange={switchLanguage} state={state} rewards={rewards} updateSetting={updateSetting} onSelectTheme={selectTheme} />}
        </div>
      </main>
      <MobileNav page={page} onNavigate={navigate} />
      {lessonTask && (
        <LessonModal
          task={lessonTask}
          cardProgress={state.cardProgress}
          lessonSequence={state.lessonsCompleted}
          soundEnabled={state.soundEnabled}
          strictMode={state.strictMode}
          pack={pack}
          onClose={() => setLessonTask(null)}
          onComplete={(correct, total) => {
            recordQuiz(lessonTask.kind, correct, total)
            completeLesson()
            if (!lessonTask.completed) toggleTask(lessonTask.id)
            setLessonTask(null)
          }}
        />
      )}
    </div>
  )
}

function Sidebar({
  page,
  open,
  displayName,
  lessonsCompleted,
  reviewCount,
  pack,
  activeLanguage,
  onLanguageChange,
  onNavigate,
  onClose,
  onLogout,
}: {
  page: Page
  open: boolean
  displayName: string
  lessonsCompleted: number
  reviewCount: number
  pack: LanguagePack
  activeLanguage: LanguageCode
  onLanguageChange: (language: LanguageCode) => void
  onNavigate: (page: Page) => void
  onClose: () => void
  onLogout: () => Promise<void>
}) {
  const lessonTotal = totalLessons(pack)
  const overallPercent = Math.min(100, Math.round((lessonsCompleted / lessonTotal) * 100))
  const activeCourse = courseProgress(pack, lessonsCompleted).find((row) => row.active)?.course ?? pack.courses[0]
  return (
    <>
      {open && <button className="nav-backdrop" onClick={onClose} aria-label="关闭导航" />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">{pack.brandMark}</div>
          <div>
            <strong>ことば</strong>
            <span>Kotoba</span>
          </div>
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="关闭导航">
            <X size={19} />
          </button>
        </div>
        <nav className="side-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={page === item.id ? 'active' : ''}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === 'review' && reviewCount > 0 && <span className="nav-count">{reviewCount}</span>}
              </button>
            )
          })}
        </nav>
        <label className="language-switcher">
          <span><Languages size={15} /> 学习语言</span>
          <select value={activeLanguage} onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}>
            {languageOptions.map((language) => <option key={language.code} value={language.code}>{language.name} · {language.nativeName}</option>)}
          </select>
        </label>
        <div className="goal-panel">
          <div className="goal-heading">
            <Target size={17} />
            <span>当前目标</span>
          </div>
          <strong>{activeCourse.title}</strong>
          <div className="mini-progress"><i style={{ width: `${overallPercent}%` }} /></div>
          <div className="goal-meta"><span>已完成 {overallPercent}%</span><span>剩余 {Math.max(0, lessonTotal - lessonsCompleted)} 课</span></div>
        </div>
        <div className="profile-row">
          <div className="avatar">{displayName.slice(0, 1)}</div>
          <div><strong>{displayName}</strong><span>云端账户</span></div>
          <button className="icon-button profile-logout" onClick={onLogout} aria-label="退出登录" title="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  )
}

function Topbar({
  page,
  streak,
  points,
  pendingTaskCount,
  reviewCount,
  checkedInToday,
  notificationsOpen,
  syncStatus,
  syncError,
  onMenu,
  onToggleNotifications,
  onNavigate,
  onRetrySync,
}: {
  page: Page
  streak: number
  points: number
  pendingTaskCount: number
  reviewCount: number
  checkedInToday: boolean
  notificationsOpen: boolean
  syncStatus: SyncStatus
  syncError: string
  onMenu: () => void
  onToggleNotifications: () => void
  onNavigate: (page: Page) => void
  onRetrySync: () => void
}) {
  const title = navItems.find((item) => item.id === page)?.label ?? ''
  const syncing = syncStatus === 'loading' || syncStatus === 'saving'
  const notificationAreaRef = useRef<HTMLDivElement>(null)
  const checkInReady = pendingTaskCount === 0 && !checkedInToday
  const hasPendingNotice = pendingTaskCount > 0 || reviewCount > 0 || checkInReady

  useEffect(() => {
    if (!notificationsOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!notificationAreaRef.current?.contains(event.target as Node)) onToggleNotifications()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggleNotifications()
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationsOpen, onToggleNotifications])

  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenu} aria-label="打开导航">
        <Menu size={21} />
      </button>
      <span className="mobile-page-title">{title}</span>
      <div className="topbar-spacer" />
      {syncStatus === 'error' ? (
        <button className="cloud-status cloud-error" type="button" title={`${syncError || '同步失败'}，点击重试`} onClick={onRetrySync}>
          <CloudOff size={16} /><span>重试同步</span>
        </button>
      ) : (
        <div className="cloud-status" title={syncing ? '正在同步云端数据' : '数据已同步至云端'}>
          {syncing ? <LoaderCircle className="spin" size={16} /> : <Cloud size={16} />}
          <span>{syncing ? '同步中' : '已同步'}</span>
        </div>
      )}
      <div className="points-chip" title="可用于兑换主题的积分"><Coins size={16} /><strong>{points}</strong></div>
      <div className="status-chip"><Flame size={17} fill="currentColor" /> {streak} 天</div>
      <div className="notification-area" ref={notificationAreaRef}>
        <button className="icon-button notification-button" type="button" aria-label="学习提醒" aria-expanded={notificationsOpen} aria-controls="learning-notifications" onClick={onToggleNotifications}>
          <Bell size={20} />
          {hasPendingNotice && <i />}
        </button>
        {notificationsOpen && (
          <div className="notification-panel" id="learning-notifications" role="dialog" aria-label="学习提醒">
            <div className="notification-heading"><strong>学习提醒</strong><span>{hasPendingNotice ? '还有进度待完成' : '今日已完成'}</span></div>
            {pendingTaskCount > 0 && (
              <button type="button" onClick={() => onNavigate('today')}>
                <Target size={17} /><span><strong>今日任务</strong><small>还有 {pendingTaskCount} 项未完成</small></span><ChevronRight size={16} />
              </button>
            )}
            {reviewCount > 0 && (
              <button type="button" onClick={() => onNavigate('review')}>
                <RotateCcw size={17} /><span><strong>到期复习</strong><small>{reviewCount} 张记忆卡待复习</small></span><ChevronRight size={16} />
              </button>
            )}
            {checkInReady && (
              <button type="button" onClick={() => onNavigate('today')}>
                <Gift size={17} /><span><strong>可以打卡</strong><small>领取 {DAILY_REWARD_POINTS} 积分</small></span><ChevronRight size={16} />
              </button>
            )}
            {!hasPendingNotice && <p><CircleCheck size={18} /> 今天的学习安排已全部处理。</p>}
          </div>
        )}
      </div>
    </header>
  )
}

function AppLoading({ label }: { label: string }) {
  return (
    <div className="app-gate">
      <div className="gate-brand"><span>こ</span><strong>ことば</strong></div>
      <LoaderCircle className="spin" size={24} />
      <p>{label}</p>
    </div>
  )
}

function ConnectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="app-gate">
      <div className="gate-icon error"><CloudOff size={24} /></div>
      <h1>无法连接学习服务</h1>
      <p>{message || '请确认 API 服务和云端 MySQL 已启动。'}</p>
      <button className="primary-button" onClick={onRetry}>重新连接</button>
    </div>
  )
}

function LoginPage({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (displayName: string, email: string, password: string, recoveryKeyword: string) => Promise<void>
}) {
  type AuthMode = 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState<AuthMode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [recoveryKeyword, setRecoveryKeyword] = useState('')
  const [confirmRecoveryKeyword, setConfirmRecoveryKeyword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')
    setPassword('')
    setConfirmPassword('')
    setRecoveryKeyword('')
    setConfirmRecoveryKeyword('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致')
          return
        }
        if (recoveryKeyword !== confirmRecoveryKeyword) {
          setError('两次输入的找回关键字不一致')
          return
        }
        await onRegister(displayName, email, password, recoveryKeyword)
      } else if (mode === 'login') {
        await onLogin(email, password)
      } else {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致')
          return
        }
        const result = await resetPassword(email, recoveryKeyword, password)
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setRecoveryKeyword('')
        setConfirmRecoveryKeyword('')
        setMessage(result.message)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  const content = {
    login: {
      eyebrow: 'WELCOME BACK',
      title: '继续今天的学习',
      intro: '登录后，学习记录会在云端安全保存并跨设备同步。',
      action: '登录',
      busy: '正在登录',
      help: '使用已注册邮箱继续学习。',
    },
    register: {
      eyebrow: 'CREATE ACCOUNT',
      title: '开始你的语言学习',
      intro: '使用邮箱创建账户，学习记录会独立保存在云端。',
      action: '创建账户',
      busy: '正在创建账户',
      help: '密码和找回关键字仅保存为不可逆哈希，请妥善记住关键字。',
    },
    forgot: {
      eyebrow: 'PASSWORD RECOVERY',
      title: '找回登录密码',
      intro: '验证注册时预留的关键字后设置新密码，旧登录状态将自动失效。',
      action: '重置密码',
      busy: '正在更新',
      help: '原密码和找回关键字都不会被展示；连续失败会触发访问限制。',
    },
  }[mode]

  const ActionIcon = mode === 'forgot' ? KeyRound : LogIn

  return (
    <main className="login-page">
      <section className="login-visual">
        <img src={studyImage} alt="语言学习笔记与记忆卡片" />
        <div className="login-visual-copy">
          <span>今日一句</span>
          <strong>Learn one step at a time.</strong>
          <p>日语、英语和西班牙语，按自己的节奏学习。</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="gate-brand"><span>こ</span><strong>ことば</strong></div>
          {mode === 'login' || mode === 'register' ? (
            <div className="auth-tabs" role="tablist" aria-label="账户操作">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>登录</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>注册</button>
            </div>
          ) : (
            <button type="button" className="auth-back-button" onClick={() => changeMode('login')}>
              <ArrowLeft size={16} />返回登录
            </button>
          )}
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p className="login-intro">{content.intro}</p>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>
                <span>昵称</span>
                <input type="text" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="怎么称呼你" minLength={1} maxLength={40} required />
              </label>
            )}
            <label>
              <span>邮箱</span>
              <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            </label>
            {mode === 'forgot' && (
              <label>
                <span>预留关键字</span>
                <input type="password" autoComplete="off" value={recoveryKeyword} onChange={(event) => setRecoveryKeyword(event.target.value)} placeholder="输入注册时设置的关键字" minLength={6} maxLength={64} required />
              </label>
            )}
            <label>
              <span>{mode === 'forgot' ? '新密码' : '密码'}</span>
              <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' ? '输入登录密码' : '至少 10 位字符'} minLength={mode === 'login' ? undefined : 10} maxLength={128} required />
            </label>
            {(mode === 'register' || mode === 'forgot') && (
              <label>
                <span>确认密码</span>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" minLength={10} maxLength={128} required />
              </label>
            )}
            {mode === 'register' && (
              <>
                <label>
                  <span>找回关键字</span>
                  <input type="password" autoComplete="off" value={recoveryKeyword} onChange={(event) => setRecoveryKeyword(event.target.value)} placeholder="6 至 64 位私密短语" minLength={6} maxLength={64} required />
                </label>
                <label>
                  <span>确认找回关键字</span>
                  <input type="password" autoComplete="off" value={confirmRecoveryKeyword} onChange={(event) => setConfirmRecoveryKeyword(event.target.value)} placeholder="再次输入找回关键字" minLength={6} maxLength={64} required />
                </label>
              </>
            )}
            {mode === 'login' && (
              <button type="button" className="forgot-password-button" onClick={() => changeMode('forgot')}>忘记密码？</button>
            )}
            {error && <div className="login-error" role="alert">{error}</div>}
            {message && <div className="login-success" role="status"><CircleCheck size={16} />{message}</div>}
            <button className="primary-button login-button" type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" size={18} /> : <ActionIcon size={18} />}
              {submitting ? content.busy : content.action}
            </button>
          </form>
          <p className="login-help">{content.help}</p>
        </div>
      </section>
    </main>
  )
}

function TodayPage({
  state,
  streak,
  reviewQueueLength,
  onToggleTask,
  onStartTask,
  onNavigate,
  displayName,
  pack,
  rewards,
  onClaimCheckIn,
}: {
  state: AppState
  streak: number
  reviewQueueLength: number
  onToggleTask: (id: string) => void
  onStartTask: (task: DailyTask) => void
  onNavigate: (page: Page) => void
  displayName: string
  pack: LanguagePack
  rewards: RewardsState
  onClaimCheckIn: () => void
}) {
  const completed = state.tasks.filter((task) => task.completed).length
  const progress = Math.round((completed / state.tasks.length) * 100)
  const remainingMinutes = state.tasks
    .filter((task) => !task.completed)
    .reduce((sum, task) => sum + task.duration, 0)
  const nextTask = state.tasks.find((task) => !task.completed) ?? state.tasks[0]
  const weekHours = (weekTotalMinutes(state.studyLog) / 60).toFixed(1)
  const reviewMinutes = Math.max(1, Math.round(reviewQueueLength * 0.75))
  const reviewKanaCount = reviewQueueToday(pack.reviewCards, state.cardProgress)
    .filter((entry) => entry.card.group === 'kana').length
  const reviewVocabCount = reviewQueueLength - reviewKanaCount
  const today = todayISO()
  const tasksAreCurrent = state.taskDate === today
  const allTasksCompleted = tasksAreCurrent && completed === state.tasks.length
  const checkedInToday = rewards.checkInDates.includes(today)

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{formatToday()}</p>
          <h1>{pack.greeting}，{displayName}。</h1>
          <p>把今天的小目标完成，就很好。</p>
        </div>
        <div className="welcome-stats">
          <div><span>今日目标</span><strong>{state.dailyGoal}<small> 分钟</small></strong></div>
          <div><span>本周学习</span><strong>{weekHours}<small> 小时</small></strong></div>
          <div><span>连续学习</span><strong>{streak}<small> 天</small></strong></div>
        </div>
      </section>

      <section className="today-grid">
        <div className="task-board">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DAILY PLAN</p>
              <h2>今天的学习</h2>
            </div>
            <div className="progress-summary">
              <strong>{progress}%</strong>
              <span>{completed}/{state.tasks.length} 项完成</span>
            </div>
          </div>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="task-list">
            {state.tasks.map((task, index) => {
              const Icon = taskIcons[task.kind]
              return (
                <div className={`task-row ${task.completed ? 'task-completed' : ''}`} key={task.id}>
                  <button
                    className="task-check"
                    onClick={() => onToggleTask(task.id)}
                    aria-label={task.completed ? `标记 ${task.title} 未完成` : `标记 ${task.title} 完成`}
                  >
                    {task.completed ? <Check size={16} /> : <span>{index + 1}</span>}
                  </button>
                  <div className="task-icon"><Icon size={19} /></div>
                  <button className="task-copy" onClick={() => onStartTask(task)}>
                    <strong>{task.title}</strong>
                    <span>{task.description}</span>
                  </button>
                  <span className="task-time"><Clock3 size={14} /> {task.duration} 分钟</span>
                  <button className="task-open" onClick={() => onStartTask(task)} aria-label={`开始 ${task.title}`}>
                    <ChevronRight size={19} />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="task-footer">
            <span>剩余约 {remainingMinutes} 分钟</span>
            <button className="primary-button" onClick={() => onStartTask(nextTask)}>
              <CirclePlay size={18} fill="currentColor" /> {completed === state.tasks.length ? '再练一次' : '继续学习'}
            </button>
          </div>
        </div>

        <aside className="daily-visual">
          <img src={studyImage} alt="桌上的语言学习笔记与卡片" />
          <div className="visual-copy">
            <p>今日一句</p>
            <strong>{pack.quote.native}</strong>
            <span>{pack.quote.translation}</span>
          </div>
        </aside>
      </section>

      <section className={`checkin-band ${checkedInToday ? 'checkin-complete' : ''}`}>
        <div className="checkin-symbol">{checkedInToday ? <Check size={24} /> : <Gift size={24} />}</div>
        <div className="checkin-copy">
          <p className="eyebrow">DAILY CHECK-IN</p>
          <h3>{checkedInToday ? '今日打卡完成' : `完成计划，领取 ${DAILY_REWARD_POINTS} 积分`}</h3>
          <p>{checkedInToday ? `累计打卡 ${rewards.checkInDates.length} 天，积分已存入账户。` : !tasksAreCurrent ? '日期已变化，刷新页面后开始今天的计划。' : allTasksCompleted ? '今天的任务已全部完成，现在可以领取奖励。' : `还需完成 ${state.tasks.length - completed} 项任务，积分可用于兑换主题。`}</p>
        </div>
        <div className="checkin-balance"><Coins size={16} /><span>积分余额</span><strong>{rewards.points}</strong></div>
        <button className="primary-button" onClick={onClaimCheckIn} disabled={!allTasksCompleted || checkedInToday}>
          {checkedInToday ? '今日已领取' : `领取 +${DAILY_REWARD_POINTS}`}
        </button>
      </section>

      <section className="review-band">
        <div className="review-symbol">復</div>
        <div className="review-copy">
          <p className="eyebrow">SPACED REVIEW</p>
          {reviewQueueLength > 0 ? (
            <>
              <h3>有 {reviewQueueLength} 个内容等待复习</h3>
              <p>现在复习约需 {reviewMinutes} 分钟，趁记忆还清晰。</p>
            </>
          ) : (
            <>
              <h3>今日复习已完成</h3>
              <p>没有到期的卡片，保持这个节奏。</p>
            </>
          )}
        </div>
        <div className="review-tags">
          {reviewQueueLength > 0 ? (
            <>
              <span>{pack.foundationLabel} {reviewKanaCount}</span>
              {reviewVocabCount > 0 && <span>单词 {reviewVocabCount}</span>}
            </>
          ) : (
            <span>按记忆曲线安排</span>
          )}
        </div>
        <button className="secondary-button" onClick={() => onNavigate('review')}>
          {reviewQueueLength > 0 ? '开始复习' : '查看队列'} <ChevronRight size={17} />
        </button>
      </section>
    </div>
  )
}

function LearnPage({ pack, lessonsCompleted, onStart }: { pack: LanguagePack; lessonsCompleted: number; onStart: () => void }) {
  const rows = courseProgress(pack, lessonsCompleted)
  const lessonTotal = totalLessons(pack)
  const activeRow = rows.find((row) => row.active) ?? rows[rows.length - 1]

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">LEARNING PATH</p>
          <h1>你的学习路径</h1>
          <p>{pack.pathDescription}</p>
        </div>
        <div className="level-indicator">
          <span>当前阶段</span><strong>入门 · {activeRow.course.index}</strong>
        </div>
      </section>

      <section className="active-course-band">
        <div className="course-number">{activeRow.course.index}</div>
        <div className="active-course-copy">
          <span className="course-kicker">正在学习</span>
          <h2>{activeRow.course.title}</h2>
          <p>{activeRow.course.description}</p>
          <div className="course-meta">
            <span>{activeRow.completedLessons} / {activeRow.course.lessons} 课</span>
            <span>{activeRow.percent}% 完成</span>
            <span>预计 {activeRow.course.duration}</span>
          </div>
        </div>
        <div className="kana-preview" aria-label={`${pack.foundationLabel}预览`}>
          {pack.preview.map(([symbol, reading]) => <div key={symbol}><strong className={symbol.includes('·') ? 'kana-preview-pair' : ''}>{symbol}</strong><span>{reading}</span></div>)}
        </div>
        <button className="primary-button" onClick={onStart}><CirclePlay size={18} fill="currentColor" />继续课程</button>
      </section>

      {pack.kanaPairs && <KanaComparison pairs={pack.kanaPairs} onPractice={onStart} />}

      <div className="section-heading learning-heading">
        <div><p className="eyebrow">ALL COURSES</p><h2>全部阶段</h2></div>
        <span className="muted-copy">共 {lessonTotal} 节基础课程</span>
      </div>
      <section className="course-list">
        {rows.map((row) => (
          <article className={`course-row ${!row.unlocked ? 'course-locked' : ''}`} key={row.course.id}>
            <span className="course-index">{row.course.index}</span>
            <div className="course-main">
              <div><h3>{row.course.title}</h3><span>{row.course.subtitle}</span></div>
              <p>{row.course.description}</p>
            </div>
            <div className="course-stat"><strong>{row.completedLessons}/{row.course.lessons}</strong><span>课程</span></div>
            <div className="course-stat"><strong>{row.percent}%</strong><span>已完成</span></div>
            {row.active ? (
              <button className="icon-button outlined" onClick={onStart} aria-label={`继续${row.course.title}`}><ChevronRight size={19} /></button>
            ) : row.unlocked ? (
              <span className="course-done-icon"><Check size={17} /></span>
            ) : (
              <span className="lock-icon"><LockKeyhole size={17} /></span>
            )}
          </article>
        ))}
      </section>
    </div>
  )
}

function KanaComparison({ pairs, onPractice }: { pairs: KanaPair[]; onPractice: () => void }) {
  const rows = [...new Set(pairs.map((pair) => pair.row))]
  return (
    <section className="kana-comparison">
      <div className="section-heading">
        <div><p className="eyebrow">KANA COMPARISON</p><h2>平假名 · 片假名对照</h2></div>
        <div className="kana-legend"><span>平</span><ArrowLeftRight size={14} /><span>片</span></div>
      </div>
      <p className="kana-comparison-note">两种写法共用同一套读音。平假名常用于日语词和语法，片假名常用于外来语。</p>
      <div className="kana-chart" role="table" aria-label="平假名与片假名五十音对照表">
        {rows.map((row) => (
          <div className="kana-chart-row" role="row" key={row}>
            <strong className="kana-row-label" role="rowheader">{row}</strong>
            <div className="kana-pair-list">
              {pairs.filter((pair) => pair.row === row).map((pair) => (
                <div className="kana-pair-cell" role="cell" key={pair.reading}>
                  <b>{pair.hiragana}</b><b>{pair.katakana}</b><span>{pair.reading}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="secondary-button kana-practice-button" onClick={onPractice}><CirclePlay size={17} />开始对比练习</button>
    </section>
  )
}

function ReviewPage({
  pack,
  cardProgress,
  onRate,
  onQueueCleared,
}: {
  pack: LanguagePack
  cardProgress: AppState['cardProgress']
  onRate: (cardId: string, rating: Rating) => void
  onQueueCleared: () => void
}) {
  const [queue, setQueue] = useState<ReviewCard[]>(() => reviewQueueToday(pack.reviewCards, cardProgress).map((entry) => entry.card))
  const [cardIndex, setCardIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const current = queue[cardIndex]
  const currentProgress = current ? cardProgress[current.id] : undefined
  const nextDue = nextDueDate(cardProgress)

  useEffect(() => {
    if (queue.length === 0 && reviewed > 0) onQueueCleared()
  }, [queue.length, reviewed, onQueueCleared])

  const rate = (rating: Rating) => {
    if (!current) return
    onRate(current.id, rating)
    setReviewed((value) => value + 1)
    setRevealed(false)
    if (rating === 'again') {
      setQueue((currentQueue) => {
        const rest = currentQueue.filter((card) => card.id !== current.id)
        return [...rest, current]
      })
      setCardIndex(0)
    } else {
      setQueue((currentQueue) => {
        const rest = currentQueue.filter((card) => card.id !== current.id)
        return rest
      })
      setCardIndex((index) => Math.min(index, Math.max(queue.length - 2, 0)))
    }
  }

  if (!current) {
    return (
      <div className="page-stack">
        <section className="page-intro">
          <div><p className="eyebrow">MEMORY REVIEW</p><h1>记忆复习</h1><p>根据遗忘规律安排，每次只专注一张卡片。</p></div>
          <div className="review-progress"><strong>{reviewed}</strong><span>张已复习</span></div>
        </section>
        <section className="review-done">
          <div className="review-done-icon"><Check size={30} strokeWidth={2.4} /></div>
          <h2>今日复习完成</h2>
          <p>
            {reviewed > 0
              ? `本轮共复习 ${reviewed} 张卡片。`
              : '当前没有到期的复习卡片。'}
            {nextDue ? `下一批卡片将在 ${formatISODate(nextDue)} 到期。` : '完成课程后，新卡片会自动加入队列。'}
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><p className="eyebrow">MEMORY REVIEW</p><h1>记忆复习</h1><p>根据遗忘规律安排，每次只专注一张卡片。</p></div>
        <div className="review-progress"><strong>{reviewed}</strong><span>/ {reviewed + queue.length} 已复习</span></div>
      </section>
      <section className="review-workspace">
        <div className="review-queue">
          <div className="queue-title"><span>今日队列</span><strong>{queue.length}</strong></div>
          {queue.map((card, index) => (
            <button
              key={card.id}
              className={index === cardIndex ? 'active' : ''}
              onClick={() => { setCardIndex(index); setRevealed(false) }}
            >
              <span>{index + 1}</span><strong>{card.prompt}</strong><i style={{ width: `${masteryOf(cardProgress[card.id])}%` }} />
            </button>
          ))}
        </div>
        <div className="flashcard-area">
          <p className="eyebrow">
            {current.group === 'kana' ? pack.foundationPrompt : pack.vocabularyPrompt}
            {!currentProgress && <span className="new-card-chip">新卡片</span>}
          </p>
          <div className="flashcard">
            <span className={`flashcard-symbol ${current.prompt.length > 2 ? 'flashcard-symbol-text' : ''}`}>{current.prompt}</span>
            {current.pairedPrompt && (
              <span className="flashcard-counterpart">
                <small>{current.scriptLabel}</small><ArrowLeftRight size={15} /><strong>{current.pairedPrompt}</strong><small>{current.scriptLabel === '平假名' ? '片假名' : '平假名'}</small>
              </span>
            )}
            <AudioButton text={current.speakText} locale={pack.locale} label={current.group === 'kana' ? '播放读音' : '播放单词'} className="flashcard-audio" />
            {revealed ? (
              <span className="flashcard-answer">
                <strong>{current.reading}</strong><span>{current.answer}</span><small>{current.hint}</small>
                {current.example && (
                  <span className="example-line">
                    <span><b>{current.example}</b><small>{current.exampleMeaning}</small></span>
                    <AudioButton text={current.example} locale={pack.locale} label="播放例句" />
                  </span>
                )}
              </span>
            ) : (
              <span className="reveal-hint">点击查看答案</span>
            )}
          </div>
          {revealed ? (
            <div className="rating-row">
              {(['again', 'hard', 'good', 'easy'] as Rating[]).map((rating) => (
                <button key={rating} onClick={() => rate(rating)}>
                  <span>{rating === 'again' ? '忘记了' : rating === 'hard' ? '有点难' : rating === 'good' ? '记得' : '很熟练'}</span>
                  <small>{intervalLabel(currentProgress, rating)}</small>
                </button>
              ))}
            </div>
          ) : (
            <button className="primary-button reveal-button" onClick={() => setRevealed(true)}>显示答案</button>
          )}
        </div>
      </section>
    </div>
  )
}

function InsightsPage({ pack, state }: { pack: LanguagePack; state: AppState }) {
  const days = ['一', '二', '三', '四', '五', '六', '日']
  const minutes = weekMinutes(state.studyLog)
  const max = Math.max(...minutes, 1)
  const weekTotal = weekTotalMinutes(state.studyLog)
  const completedToday = state.tasks.filter((task) => task.completed).length
  const completionRate = Math.round((completedToday / state.tasks.length) * 100)
  const accuracy = quizAccuracy(state.quizStats)
  const mastered = masteredCount(state.cardProgress)
  const kanaMastery = groupMastery(pack.reviewCards, state.cardProgress, 'kana')
  const vocabMastery = groupMastery(pack.reviewCards, state.cardProgress, 'vocab')
  const listeningStat: QuizStat | undefined = state.quizStats.listening
  const listeningAccuracy = listeningStat && listeningStat.total > 0
    ? Math.round((listeningStat.correct / listeningStat.total) * 100)
    : null
  const overall = overallMastery(state, pack.reviewCards)

  const focusAreas: { label: string; value: number | null }[] = [
    { label: pack.foundationLabel, value: kanaMastery.mastery },
    { label: pack.vocabularyLabel, value: vocabMastery.mastery },
    { label: '听音辨认', value: listeningAccuracy },
  ]
  const weakest = focusAreas
    .filter((area) => area.value !== null)
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]
  const suggestion = weakest
    ? `你的「${weakest.label}」掌握度最低（${weakest.value}%）。明天的计划里多安排一组对应练习，每组约 3 分钟。`
    : '完成今天的课程后，这里会出现针对你的学习建议。'

  const masteryRows: [string, number, string][] = [
    [pack.foundationLabel, kanaMastery.mastery, kanaMastery.learned ? `${kanaMastery.learned} / ${kanaMastery.total} 已学` : '尚未开始'],
    [pack.vocabularyLabel, vocabMastery.mastery, vocabMastery.learned ? `${vocabMastery.learned} / ${vocabMastery.total} 已学` : '尚未开始'],
    ['听音辨认', listeningAccuracy ?? 0, listeningAccuracy === null ? '尚未开始' : listeningAccuracy < 50 ? '需加强' : '表现良好'],
    ['综合掌握', overall, overall >= 70 ? '表现良好' : '持续积累中'],
  ]

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><p className="eyebrow">LEARNING INSIGHTS</p><h1>学习数据</h1><p>关注节奏与掌握程度，而不只是连续天数。</p></div>
        <div className="date-range">{weekRangeLabel()}</div>
      </section>
      <section className="metric-strip">
        <div><span>本周学习</span><strong>{(weekTotal / 60).toFixed(1)}<small> 小时</small></strong><em>共 {weekTotal} 分钟</em></div>
        <div><span>任务完成率</span><strong>{completionRate}<small>%</small></strong><em>目标 80%</em></div>
        <div><span>平均正确率</span><strong>{accuracy === null ? '--' : accuracy}{accuracy !== null && <small>%</small>}</strong><em>{accuracy === null ? '完成课程后统计' : '全部测验综合'}</em></div>
        <div><span>已掌握内容</span><strong>{mastered}<small> 个</small></strong><em>全部 {pack.reviewCards.length} 张卡片</em></div>
      </section>
      <section className="insight-grid">
        <div className="chart-panel">
          <div className="section-heading"><div><p className="eyebrow">STUDY TIME</p><h2>每日学习时长</h2></div><span className="chart-total">{weekTotal} 分钟</span></div>
          <div className="bar-chart">
            {minutes.map((minute, index) => (
              <div className="bar-column" key={days[index]}>
                <span>{minute}</span>
                <div><i style={{ height: `${Math.max((minute / max) * 100, minute > 0 ? 10 : 2)}%` }} /></div>
                <small>周{days[index]}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="mastery-panel">
          <div className="section-heading"><div><p className="eyebrow">MASTERY</p><h2>知识掌握度</h2></div></div>
          {masteryRows.map(([label, value, note]) => (
            <div className="mastery-row" key={label}>
              <div><strong>{label}</strong><span>{note}</span></div><b>{value}%</b>
              <div className="mastery-track"><i style={{ width: `${value}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="focus-note">
        <Sparkles size={20} />
        <div><strong>本周建议</strong><p>{suggestion}</p></div>
      </section>
    </div>
  )
}

function SettingsPage({
  pack,
  activeLanguage,
  onLanguageChange,
  state,
  rewards,
  updateSetting,
  onSelectTheme,
}: {
  pack: LanguagePack
  activeLanguage: LanguageCode
  onLanguageChange: (language: LanguageCode) => void
  state: AppState
  rewards: RewardsState
  updateSetting: <K extends keyof AppState>(key: K, value: AppState[K]) => void
  onSelectTheme: (themeId: ThemeId) => void
}) {
  return (
    <div className="page-stack settings-page">
      <section className="page-intro"><div><p className="eyebrow">PREFERENCES</p><h1>学习设置</h1><p>让计划符合你的时间和学习节奏。</p></div></section>
      <section className="settings-section">
        <div className="settings-heading"><span>01</span><div><h2>主题与积分</h2><p>每日完成计划获得积分，兑换后可永久使用主题。</p></div></div>
        <ThemeStore rewards={rewards} onSelect={onSelectTheme} />
      </section>
      <section className="settings-section">
        <div className="settings-heading"><span>02</span><div><h2>学习语言</h2><p>每种语言的课程、复习和统计独立保存。</p></div></div>
        <div className="segmented-control language-segments" role="group" aria-label="选择学习语言">
          {languageOptions.map((language) => (
            <button key={language.code} className={activeLanguage === language.code ? 'active' : ''} onClick={() => onLanguageChange(language.code)}>
              <strong>{language.brandMark}</strong><span>{language.name} · {language.nativeName}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading"><span>03</span><div><h2>每日目标</h2><p>当前为{pack.name}设置，系统会据此衡量每日进度。</p></div></div>
        <div className="segmented-control" role="group" aria-label="每日学习时长">
          {[15, 30, 45, 60].map((minutes) => (
            <button key={minutes} className={state.dailyGoal === minutes ? 'active' : ''} onClick={() => updateSetting('dailyGoal', minutes)}>
              <strong>{minutes}</strong><span>分钟</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading"><span>04</span><div><h2>提醒与声音</h2><p>在你设定的时间提示当天未完成的任务。</p></div></div>
        <div className="setting-list">
          <SettingToggle label="每日学习提醒" description="未完成计划时发送一次提醒" checked={state.reminderEnabled} onChange={(value) => updateSetting('reminderEnabled', value)} />
          <div className="setting-row">
            <div><strong>提醒时间</strong><span>建议设置在通常有空的时段</span></div>
            <input type="time" value={state.reminderTime} onChange={(event) => updateSetting('reminderTime', event.target.value)} aria-label="提醒时间" />
          </div>
          <SettingToggle label="练习发音" description={`学习${pack.foundationLabel}和单词时自动播放读音`} checked={state.soundEnabled} onChange={(value) => updateSetting('soundEnabled', value)} />
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading"><span>05</span><div><h2>监督方式</h2><p>严格模式会要求通过测验后才能完成学习任务。</p></div></div>
        <div className="setting-list">
          <SettingToggle label="严格验收模式" description="正确率达到 80% 才将任务标记为完成" checked={state.strictMode} onChange={(value) => updateSetting('strictMode', value)} />
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading"><span>06</span><div><h2>账号找回</h2><p>设置或更换找回关键字，需要验证当前登录密码。</p></div></div>
        <RecoveryKeywordForm />
      </section>
    </div>
  )
}

function ThemeStore({ rewards, onSelect }: { rewards: RewardsState; onSelect: (themeId: ThemeId) => void }) {
  return (
    <div className="theme-store">
      <div className="theme-balance"><Coins size={18} /><span>可用积分</span><strong>{rewards.points}</strong><small>累计打卡 {rewards.checkInDates.length} 天</small></div>
      <div className="theme-grid">
        {themeCatalog.map((theme) => {
          const unlocked = rewards.unlockedThemes.includes(theme.id)
          const active = rewards.activeTheme === theme.id
          const affordable = rewards.points >= theme.cost
          return (
            <article className={`theme-card ${active ? 'active' : ''}`} key={theme.id}>
              <div className="theme-preview" aria-hidden="true">
                {theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}
              </div>
              <div className="theme-card-copy"><h3>{theme.name}</h3><p>{theme.description}</p></div>
              <button
                className={active ? 'theme-action active' : 'theme-action'}
                onClick={() => onSelect(theme.id)}
                disabled={active || (!unlocked && !affordable)}
                title={!unlocked && !affordable ? `还差 ${theme.cost - rewards.points} 积分` : undefined}
              >
                {active ? <><Check size={15} />使用中</> : unlocked ? <><Palette size={15} />启用</> : <><LockKeyhole size={14} />兑换 {theme.cost}</>}
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function RecoveryKeywordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [keyword, setKeyword] = useState('')
  const [confirmKeyword, setConfirmKeyword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (keyword !== confirmKeyword) {
      setError('两次输入的找回关键字不一致')
      return
    }
    setSubmitting(true)
    try {
      const result = await updateRecoveryKeyword(currentPassword, keyword)
      setCurrentPassword('')
      setKeyword('')
      setConfirmKeyword('')
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '更新失败，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="security-form" onSubmit={submit}>
      <label><span>当前密码</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
      <label><span>新找回关键字</span><input type="password" autoComplete="off" value={keyword} onChange={(event) => setKeyword(event.target.value)} minLength={6} maxLength={64} placeholder="6 至 64 位私密短语" required /></label>
      <label><span>确认关键字</span><input type="password" autoComplete="off" value={confirmKeyword} onChange={(event) => setConfirmKeyword(event.target.value)} minLength={6} maxLength={64} required /></label>
      {error && <div className="login-error" role="alert">{error}</div>}
      {message && <div className="login-success" role="status"><CircleCheck size={16} />{message}</div>}
      <button type="submit" className="primary-button" disabled={submitting}>
        {submitting ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
        {submitting ? '正在保存' : '保存找回关键字'}
      </button>
    </form>
  )
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="setting-row">
      <div><strong>{label}</strong><span>{description}</span></div>
      <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><i /></button>
    </div>
  )
}

interface LessonQuestion {
  prompt: string
  speakText: string
  options: string[]
  answer: string
  example?: string
  exampleMeaning?: string
  pairedPrompt?: string
  scriptLabel?: string
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickDistractors(pool: string[], answer: string, count: number): string[] {
  return shuffle(pool.filter((item) => item !== answer)).slice(0, count)
}

/** 出题：优先选择还没学过的内容，其次按到期顺序 */
function buildQuestions(pack: LanguagePack, kind: TaskKind, cardProgress: AppState['cardProgress'], lessonSequence = 0): LessonQuestion[] {
  if (kind === 'vocabulary') {
    const sortedVocab = [...pack.vocabEntries].sort((a, b) => {
      const aReps = cardProgress[`${pack.code}-vocab-${a.word}`]?.reps ?? -1
      const bReps = cardProgress[`${pack.code}-vocab-${b.word}`]?.reps ?? -1
      return aReps - bReps
    })
    const meanings = pack.vocabEntries.map((entry) => entry.meaning)
    return sortedVocab.slice(0, 5).map((entry) => ({
      prompt: entry.word,
      speakText: entry.word,
      options: shuffle([entry.meaning, ...pickDistractors(meanings, entry.meaning, 2)]),
      answer: entry.meaning,
      example: entry.example,
      exampleMeaning: entry.exampleMeaning,
    }))
  }

  const sortedKana = [...pack.foundationEntries].sort((a, b) => {
    const aReps = cardProgress[`${pack.code}-kana-${a.symbol}`]?.reps ?? -1
    const bReps = cardProgress[`${pack.code}-kana-${b.symbol}`]?.reps ?? -1
    return aReps - bReps
  })
  let selected: typeof sortedKana = []
  if (pack.kanaPairs) {
    const groupStart = (Math.floor(lessonSequence / 2) * 5) % pack.kanaPairs.length
    const activePairs = Array.from({ length: Math.min(5, pack.kanaPairs.length) }, (_, index) => pack.kanaPairs![(groupStart + index) % pack.kanaPairs!.length])
    selected = activePairs.map((pair, index) => {
      const useKatakana = (lessonSequence + index) % 2 === 1
      const symbol = useKatakana ? pair.katakana : pair.hiragana
      return pack.foundationEntries.find((entry) => entry.symbol === symbol)!
    })
  } else {
    const selectedReadings = new Set<string>()
    for (const entry of sortedKana) {
      if (selectedReadings.has(entry.reading)) continue
      selected.push(entry)
      selectedReadings.add(entry.reading)
      if (selected.length === 5) break
    }
  }

  if (kind === 'listening') {
    const canSpeak = 'speechSynthesis' in window
    if (pack.kanaPairs) {
      const pairOptions = pack.kanaPairs.map((pair) => `${pair.hiragana} / ${pair.katakana}`)
      return selected.map((entry) => {
        const answer = entry.scriptLabel === '片假名'
          ? `${entry.pairedSymbol} / ${entry.symbol}`
          : `${entry.symbol} / ${entry.pairedSymbol}`
        return {
          prompt: canSpeak ? '' : entry.reading,
          speakText: entry.symbol,
          options: shuffle([answer, ...pickDistractors(pairOptions, answer, 2)]),
          answer,
        }
      })
    }
    return selected.map((entry) => ({
      prompt: canSpeak ? '' : entry.reading,
      speakText: entry.symbol,
      options: shuffle([entry.symbol, ...pickDistractors(pack.foundationEntries.map((item) => item.symbol), entry.symbol, 2)]),
      answer: entry.symbol,
    }))
  }

  const readings = [...new Set(pack.foundationEntries.map((entry) => entry.reading))]
  return selected.map((entry) => ({
    prompt: entry.symbol,
    speakText: entry.symbol,
    options: shuffle([entry.reading, ...pickDistractors(readings, entry.reading, 2)]),
    answer: entry.reading,
    pairedPrompt: entry.pairedSymbol,
    scriptLabel: entry.scriptLabel,
  }))
}

function LessonModal({
  pack,
  task,
  cardProgress,
  lessonSequence,
  soundEnabled,
  strictMode,
  onClose,
  onComplete,
}: {
  pack: LanguagePack
  task: DailyTask
  cardProgress: AppState['cardProgress']
  lessonSequence: number
  soundEnabled: boolean
  strictMode: boolean
  onClose: () => void
  onComplete: (correct: number, total: number) => void
}) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)
  const [questions, setQuestions] = useState<LessonQuestion[]>(() => buildQuestions(pack, task.kind, cardProgress, lessonSequence))
  const question = questions[step]
  const isCorrect = selected === question?.answer
  const accuracy = Math.round((correctCount / questions.length) * 100)
  const strictPassed = !strictMode || accuracy >= 80

  const speak = useCallback((text: string) => {
    playSpeech(text, pack.locale)
  }, [pack.locale])

  useEffect(() => {
    if (soundEnabled && question) speak(question.speakText)
    return () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }
  }, [soundEnabled, question, speak])

  const next = () => {
    if (!checked) { setChecked(true); if (isCorrect) setCorrectCount((value) => value + 1); return }
    if (!isCorrect) { setChecked(false); setSelected(null); return }
    if (step === questions.length - 1) { setFinished(true); return }
    setStep((value) => value + 1)
    setSelected(null)
    setChecked(false)
  }

  const retry = () => {
    setQuestions(buildQuestions(pack, task.kind, cardProgress, lessonSequence))
    setStep(0)
    setSelected(null)
    setChecked(false)
    setCorrectCount(0)
    setFinished(false)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="lesson-modal" role="dialog" aria-modal="true" aria-label={task.title}>
        <header>
          <div><span>{task.kind === 'kana' ? `${pack.foundationLabel} · 认读` : task.kind === 'vocabulary' ? '词汇 · 释义' : task.kind === 'listening' ? '听力 · 辨认' : '复习 · 巩固'}</span><strong>{finished ? questions.length : step + 1} / {questions.length}</strong></div>
          <div className="lesson-progress"><i style={{ width: `${((finished ? questions.length : step + 1) / questions.length) * 100}%` }} /></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭课程"><X size={20} /></button>
        </header>
        {finished ? (
          <div className="lesson-body lesson-result">
            <div className={`result-badge ${strictPassed ? 'success' : 'retry'}`}>
              {strictPassed ? <Check size={30} strokeWidth={2.4} /> : <RotateCcw size={28} strokeWidth={2.2} />}
            </div>
            <h2>{strictPassed ? '课程完成' : '再练一次会更好'}</h2>
            <p className="result-accuracy">正确率 <strong>{accuracy}%</strong>（{correctCount} / {questions.length} 题）</p>
            {strictPassed ? (
              <p className="result-note">这些内容已按记忆曲线安排进复习队列。</p>
            ) : (
              <p className="result-note">严格模式要求正确率达到 80% 才能完成课程。</p>
            )}
          </div>
        ) : (
          <div className="lesson-body">
            <p className="eyebrow">{task.kind === 'listening' ? 'LISTEN AND CHOOSE' : 'SELECT THE READING'}</p>
            <h2>{task.kind === 'listening' ? '听到的是哪个内容？' : task.kind === 'vocabulary' ? '这个词是什么意思？' : `${pack.foundationLabel}怎么读？`}</h2>
            {question.prompt && (
              <div className={`quiz-symbol ${question.prompt.length > 2 ? 'quiz-symbol-text' : ''}`}>{question.prompt}</div>
            )}
            {question.pairedPrompt && (
              <div className="quiz-kana-pair">
                <span>{question.scriptLabel} {question.prompt}</span><ArrowLeftRight size={15} /><span>{question.scriptLabel === '平假名' ? '片假名' : '平假名'} {question.pairedPrompt}</span>
              </div>
            )}
            {task.kind === 'listening' && !question.prompt ? (
              <button className="listen-button listen-large" onClick={() => speak(question.speakText)}><Volume2 size={20} />播放读音</button>
            ) : (
              <button className="listen-button" onClick={() => speak(question.speakText)}><Volume2 size={18} />播放读音</button>
            )}
            <div className="quiz-options">
              {question.options.map((option) => (
                <button
                  key={option}
                  className={`${selected === option ? 'selected' : ''} ${checked && option === question.answer ? 'correct' : ''} ${checked && selected === option && !isCorrect ? 'wrong' : ''}`}
                  onClick={() => { if (!checked) setSelected(option) }}
                >
                  <span>{option}</span>
                  {checked && option === question.answer && <Check size={18} />}
                </button>
              ))}
            </div>
            {checked && (
              <div className={`quiz-feedback ${isCorrect ? 'success' : 'error'}`}>
                <strong>{isCorrect ? '回答正确' : '再想一想'}</strong>
                <span>{isCorrect ? `「${question.prompt || question.speakText}」→ ${question.answer}` : '可以先听一遍读音，然后重新选择。'}</span>
                {isCorrect && question.example && (
                  <div className="quiz-example">
                    <span><b>{question.example}</b><small>{question.exampleMeaning}</small></span>
                    <AudioButton text={question.example} locale={pack.locale} label="播放例句" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <footer>
          <span>{finished ? (strictPassed ? '很好，继续保持这个节奏。' : '别灰心，多练几遍就熟了。') : checked ? (isCorrect ? '回答正确！' : '选择一个答案后继续') : '选择一个答案后继续'}</span>
          {finished ? (
            strictPassed ? (
              <button className="primary-button" onClick={() => onComplete(correctCount, questions.length)}>
                完成课程<ChevronRight size={17} />
              </button>
            ) : (
              <button className="primary-button" onClick={retry}>
                <RotateCcw size={17} />再练一次
              </button>
            )
          ) : (
            <button className="primary-button" disabled={!selected} onClick={next}>
              {checked ? (isCorrect ? (step === questions.length - 1 ? '查看结果' : '下一题') : '重新作答') : '检查答案'}
              <ChevronRight size={17} />
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function MobileNav({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return (
    <nav className="mobile-nav" aria-label="移动端主导航">
      {navItems.map((item) => {
        const Icon = item.icon
        return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}><Icon size={20} /><span>{item.label}</span></button>
      })}
    </nav>
  )
}

export default App
