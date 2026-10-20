import type { AppState, CardGroup, LanguageCode, ReviewCard } from './types'

export interface FoundationEntry { symbol: string; reading: string; row: string; hint: string; pairedSymbol?: string; scriptLabel?: string }
export interface KanaPair { hiragana: string; katakana: string; reading: string; row: string }
export interface VocabEntry { word: string; reading: string; meaning: string; hint: string; example: string; exampleMeaning: string }
export interface Course { id: string; index: string; title: string; subtitle: string; description: string; lessons: number; duration: string }
export interface LanguagePack {
  code: LanguageCode; name: string; nativeName: string; locale: string; brandMark: string; greeting: string
  pathDescription: string; quote: { native: string; translation: string }
  foundationLabel: string; foundationPrompt: string; vocabularyLabel: string; vocabularyPrompt: string
  foundationEntries: FoundationEntry[]; vocabEntries: VocabEntry[]; reviewCards: ReviewCard[]
  dailyTasks: AppState['tasks']; courses: Course[]; preview: readonly (readonly [string, string])[]
  kanaPairs?: KanaPair[]
}

export const japaneseKanaPairs: KanaPair[] = [
  ['あ', 'ア', 'a', 'あ行'], ['い', 'イ', 'i', 'あ行'], ['う', 'ウ', 'u', 'あ行'], ['え', 'エ', 'e', 'あ行'], ['お', 'オ', 'o', 'あ行'],
  ['か', 'カ', 'ka', 'か行'], ['き', 'キ', 'ki', 'か行'], ['く', 'ク', 'ku', 'か行'], ['け', 'ケ', 'ke', 'か行'], ['こ', 'コ', 'ko', 'か行'],
  ['さ', 'サ', 'sa', 'さ行'], ['し', 'シ', 'shi', 'さ行'], ['す', 'ス', 'su', 'さ行'], ['せ', 'セ', 'se', 'さ行'], ['そ', 'ソ', 'so', 'さ行'],
  ['た', 'タ', 'ta', 'た行'], ['ち', 'チ', 'chi', 'た行'], ['つ', 'ツ', 'tsu', 'た行'], ['て', 'テ', 'te', 'た行'], ['と', 'ト', 'to', 'た行'],
  ['な', 'ナ', 'na', 'な行'], ['に', 'ニ', 'ni', 'な行'], ['ぬ', 'ヌ', 'nu', 'な行'], ['ね', 'ネ', 'ne', 'な行'], ['の', 'ノ', 'no', 'な行'],
  ['は', 'ハ', 'ha', 'は行'], ['ひ', 'ヒ', 'hi', 'は行'], ['ふ', 'フ', 'fu', 'は行'], ['へ', 'ヘ', 'he', 'は行'], ['ほ', 'ホ', 'ho', 'は行'],
  ['ま', 'マ', 'ma', 'ま行'], ['み', 'ミ', 'mi', 'ま行'], ['む', 'ム', 'mu', 'ま行'], ['め', 'メ', 'me', 'ま行'], ['も', 'モ', 'mo', 'ま行'],
  ['や', 'ヤ', 'ya', 'や行'], ['ゆ', 'ユ', 'yu', 'や行'], ['よ', 'ヨ', 'yo', 'や行'],
  ['ら', 'ラ', 'ra', 'ら行'], ['り', 'リ', 'ri', 'ら行'], ['る', 'ル', 'ru', 'ら行'], ['れ', 'レ', 're', 'ら行'], ['ろ', 'ロ', 'ro', 'ら行'],
  ['わ', 'ワ', 'wa', 'わ行・ん'], ['を', 'ヲ', 'wo', 'わ行・ん'], ['ん', 'ン', 'n', 'わ行・ん'],
].map(([hiragana, katakana, reading, row]) => ({ hiragana, katakana, reading, row }))

const japaneseFoundation: FoundationEntry[] = japaneseKanaPairs.flatMap((pair) => [
  { symbol: pair.hiragana, pairedSymbol: pair.katakana, reading: pair.reading, row: pair.row, scriptLabel: '平假名', hint: `${pair.row}：平假名 ${pair.hiragana}，对应片假名 ${pair.katakana}，读作 ${pair.reading}` },
  { symbol: pair.katakana, pairedSymbol: pair.hiragana, reading: pair.reading, row: pair.row, scriptLabel: '片假名', hint: `${pair.row}：片假名 ${pair.katakana}，对应平假名 ${pair.hiragana}，读作 ${pair.reading}` },
])

const japaneseVocab: VocabEntry[] = [
  ['おはよう', 'ohayou', '早上好', '早晨见面时使用', 'おはようございます。', '早上好。'],
  ['こんにちは', 'konnichiwa', '你好', '白天见面时使用', 'こんにちは、田中さん。', '你好，田中先生。'],
  ['こんばんは', 'konbanwa', '晚上好', '傍晚见面时使用', 'こんばんは、元気ですか。', '晚上好，你好吗？'],
  ['ありがとう', 'arigatou', '谢谢', '表达感谢', 'ありがとうございます。', '非常感谢。'],
  ['すみません', 'sumimasen', '不好意思 / 劳驾', '道歉或搭话前使用', 'すみません、駅はどこですか。', '劳驾，请问车站在哪里？'],
  ['さようなら', 'sayounara', '再见', '较长时间的道别', 'さようなら、また会いましょう。', '再见，下次再会。'],
  ['はじめまして', 'hajimemashite', '初次见面', '第一次见面时使用', 'はじめまして、李です。', '初次见面，我姓李。'],
  ['おやすみ', 'oyasumi', '晚安', '睡前道别', 'おやすみなさい。', '晚安。'],
  ['はい', 'hai', '是 / 好的', '肯定回答', 'はい、わかりました。', '好的，我明白了。'],
  ['いいえ', 'iie', '不 / 不是', '否定回答', 'いいえ、違います。', '不，不是这样。'],
].map(([word, reading, meaning, hint, example, exampleMeaning]) => ({ word, reading, meaning, hint, example, exampleMeaning }))

const englishFoundation: FoundationEntry[] = [
  ['A', 'eɪ', '元音'], ['E', 'iː', '元音'], ['I', 'aɪ', '元音'], ['O', 'oʊ', '元音'], ['U', 'juː', '元音'],
  ['TH', 'θ / ð', '辅音组合'], ['SH', 'ʃ', '辅音组合'], ['CH', 'tʃ', '辅音组合'], ['R', 'r', '易错辅音'], ['L', 'l', '易错辅音'],
].map(([symbol, reading, row]) => ({ symbol, reading, row, hint: `${row}发音，留意口型与舌位` }))

const englishVocab: VocabEntry[] = [
  ['hello', 'həˈloʊ', '你好', '通用问候', 'Hello, nice to meet you.', '你好，很高兴认识你。'],
  ['morning', 'ˈmɔːrnɪŋ', '早晨', 'Good morning 的核心词', 'Good morning, everyone.', '大家早上好。'],
  ['thanks', 'θæŋks', '谢谢', '日常感谢', 'Thanks for your help.', '谢谢你的帮助。'],
  ['please', 'pliːz', '请', '礼貌请求', 'Please sit down.', '请坐。'],
  ['sorry', 'ˈsɑːri', '对不起', '表达歉意', 'I am sorry I am late.', '对不起，我迟到了。'],
  ['welcome', 'ˈwelkəm', '欢迎', '欢迎对方', 'Welcome to our class.', '欢迎来到我们的课堂。'],
  ['yes', 'jes', '是', '肯定回答', 'Yes, I understand.', '是的，我明白了。'],
  ['no', 'noʊ', '不', '否定回答', 'No, thank you.', '不用了，谢谢。'],
  ['goodbye', 'ˌɡʊdˈbaɪ', '再见', '告别用语', 'Goodbye, see you tomorrow.', '再见，明天见。'],
  ['friend', 'frend', '朋友', '介绍人际关系', 'She is my best friend.', '她是我最好的朋友。'],
].map(([word, reading, meaning, hint, example, exampleMeaning]) => ({ word, reading, meaning, hint, example, exampleMeaning }))

const spanishFoundation: FoundationEntry[] = [
  ['A', 'a', '元音'], ['E', 'e', '元音'], ['I', 'i', '元音'], ['O', 'o', '元音'], ['U', 'u', '元音'],
  ['Ñ', 'eñe', '特殊字母'], ['J', 'jota', '特殊发音'], ['LL', 'elle', '字母组合'], ['RR', 'erre', '颤音'], ['H', 'hache', '不发音字母'],
].map(([symbol, reading, row]) => ({ symbol, reading, row, hint: `${row}，注意西班牙语的稳定发音规则` }))

const spanishVocab: VocabEntry[] = [
  ['hola', 'o-la', '你好', '通用问候', 'Hola, mucho gusto.', '你好，很高兴认识你。'],
  ['buenos días', 'bwe-nos di-as', '早上好', '上午问候', 'Buenos días, ¿cómo estás?', '早上好，你好吗？'],
  ['gracias', 'gra-sias', '谢谢', '表达感谢', 'Muchas gracias por tu ayuda.', '非常感谢你的帮助。'],
  ['por favor', 'por fa-bor', '请', '礼貌请求', 'Un café, por favor.', '请给我一杯咖啡。'],
  ['perdón', 'per-don', '对不起', '表达歉意', 'Perdón por llegar tarde.', '对不起，我迟到了。'],
  ['bienvenido', 'byen-be-ni-do', '欢迎', '欢迎对方', 'Bienvenido a nuestra clase.', '欢迎来到我们的课堂。'],
  ['sí', 'si', '是', '肯定回答', 'Sí, entiendo.', '是的，我明白。'],
  ['no', 'no', '不', '否定回答', 'No, gracias.', '不用了，谢谢。'],
  ['adiós', 'a-dios', '再见', '告别用语', 'Adiós, hasta mañana.', '再见，明天见。'],
  ['amigo', 'a-mi-go', '朋友', '男性朋友；女性用 amiga', 'Carlos es mi amigo.', '卡洛斯是我的朋友。'],
].map(([word, reading, meaning, hint, example, exampleMeaning]) => ({ word, reading, meaning, hint, example, exampleMeaning }))

function cards(code: LanguageCode, foundation: FoundationEntry[], vocab: VocabEntry[]): ReviewCard[] {
  return [
    ...foundation.map((entry) => ({ id: `${code}-kana-${entry.symbol}`, prompt: entry.symbol, pairedPrompt: entry.pairedSymbol, scriptLabel: entry.scriptLabel, reading: entry.reading, answer: entry.row, hint: entry.hint, group: 'kana' as CardGroup, speakText: entry.symbol })),
    ...vocab.map((entry) => ({ id: `${code}-vocab-${entry.word}`, prompt: entry.word, reading: entry.reading, answer: entry.meaning, hint: entry.hint, group: 'vocab' as CardGroup, speakText: entry.word, example: entry.example, exampleMeaning: entry.exampleMeaning })),
  ]
}

function tasks(code: LanguageCode, foundationLabel: string): AppState['tasks'] {
  return [
    { id: `${code}-foundation`, title: `${foundationLabel} · 认读练习`, description: `掌握${foundationLabel}的基础读音`, duration: 8, kind: 'kana', completed: false },
    { id: `${code}-vocabulary`, title: '日常问候与核心词汇', description: '学习最常用的入门表达', duration: 10, kind: 'vocabulary', completed: false },
    { id: `${code}-listening`, title: '听音辨认', description: '听读音选出正确内容', duration: 5, kind: 'listening', completed: false },
    { id: `${code}-review`, title: '记忆复习', description: '完成今天到期的复习卡片', duration: 7, kind: 'review', completed: false },
  ]
}

function pack(config: Omit<LanguagePack, 'reviewCards' | 'dailyTasks' | 'preview'>): LanguagePack {
  const preview = config.kanaPairs
    ? config.kanaPairs.slice(0, 5).map((entry) => [`${entry.hiragana}·${entry.katakana}`, entry.reading] as const)
    : config.foundationEntries.slice(0, 5).map((entry) => [entry.symbol, entry.reading] as const)
  return { ...config, reviewCards: cards(config.code, config.foundationEntries, config.vocabEntries), dailyTasks: tasks(config.code, config.foundationLabel), preview }
}

export const languagePacks: Record<LanguageCode, LanguagePack> = {
  ja: pack({
    code: 'ja', name: '日语', nativeName: '日本語', locale: 'ja-JP', brandMark: 'こ', greeting: 'おはよう',
    pathDescription: '循序完成每个阶段，打好日语基础。', quote: { native: '継続は力なり', translation: '坚持就是力量' },
    foundationLabel: '平假名与片假名', foundationPrompt: '请读出假名并辨认对应写法', vocabularyLabel: '基础词汇', vocabularyPrompt: '请说出这个词的意思', foundationEntries: japaneseFoundation, vocabEntries: japaneseVocab, kanaPairs: japaneseKanaPairs,
    courses: [
      { id: 'hiragana', index: '01', title: '平假名与片假名入门', subtitle: 'Kana', description: '对照掌握 46 组平假名、片假名及其共同发音', lessons: 10, duration: '7 天' },
      { id: 'katakana', index: '02', title: '片假名强化', subtitle: 'Katakana', description: '辨认片假名，并用于常见外来语', lessons: 10, duration: '7 天' },
      { id: 'greetings', index: '03', title: '问候与自我介绍', subtitle: 'Greetings', description: '完成第一次简单的日语交流', lessons: 8, duration: '6 天' },
      { id: 'sentences', index: '04', title: '第一组基础句型', subtitle: 'Basic sentences', description: '理解「は」「です」的基本用法', lessons: 12, duration: '9 天' },
    ],
  }),
  en: pack({
    code: 'en', name: '英语', nativeName: 'English', locale: 'en-US', brandMark: 'A', greeting: 'Good morning',
    pathDescription: '从发音和高频表达开始，建立英语交流基础。', quote: { native: 'Practice makes progress.', translation: '练习带来进步' },
    foundationLabel: '字母与发音', foundationPrompt: '请读出这个字母或音组', vocabularyLabel: '核心词汇', vocabularyPrompt: '请说出这个词的意思', foundationEntries: englishFoundation, vocabEntries: englishVocab,
    courses: [
      { id: 'sounds', index: '01', title: '字母与核心发音', subtitle: 'Sounds', description: '掌握元音和常见易错辅音', lessons: 8, duration: '6 天' },
      { id: 'greetings', index: '02', title: '日常问候', subtitle: 'Greetings', description: '自然地问候、感谢和道别', lessons: 8, duration: '6 天' },
      { id: 'introductions', index: '03', title: '自我介绍', subtitle: 'Introductions', description: '介绍姓名、职业和兴趣', lessons: 10, duration: '8 天' },
      { id: 'sentences', index: '04', title: '基础句型', subtitle: 'Basic sentences', description: '使用 be 动词和一般现在时表达', lessons: 12, duration: '9 天' },
    ],
  }),
  es: pack({
    code: 'es', name: '西班牙语', nativeName: 'Español', locale: 'es-ES', brandMark: 'Ñ', greeting: 'Buenos días',
    pathDescription: '先掌握稳定的发音规则，再进入日常西语表达。', quote: { native: 'Poco a poco se llega lejos.', translation: '一步一步，终能走远' },
    foundationLabel: '字母与发音', foundationPrompt: '请读出这个西语字母或音组', vocabularyLabel: '核心词汇', vocabularyPrompt: '请说出这个词的意思', foundationEntries: spanishFoundation, vocabEntries: spanishVocab,
    courses: [
      { id: 'pronunciation', index: '01', title: '西语发音规则', subtitle: 'Pronunciación', description: '掌握元音、特殊字母和颤音', lessons: 8, duration: '6 天' },
      { id: 'greetings', index: '02', title: '问候与礼貌表达', subtitle: 'Saludos', description: '学会问候、感谢和道别', lessons: 8, duration: '6 天' },
      { id: 'introductions', index: '03', title: '自我介绍', subtitle: 'Presentarse', description: '介绍姓名、国籍和职业', lessons: 10, duration: '8 天' },
      { id: 'sentences', index: '04', title: '基础句型', subtitle: 'Frases básicas', description: '理解 ser、estar 和名词阴阳性', lessons: 12, duration: '9 天' },
    ],
  }),
}

export const languageOptions = (Object.keys(languagePacks) as LanguageCode[]).map((code) => languagePacks[code])
export function getLanguagePack(code: LanguageCode): LanguagePack { return languagePacks[code] }

export function createInitialState(code: LanguageCode): AppState {
  return { tasks: languagePacks[code].dailyTasks.map((task) => ({ ...task })), taskDate: '', studyLog: {}, quizStats: {}, cardProgress: {}, lessonsCompleted: 0, dailyGoal: 30, reminderEnabled: true, soundEnabled: true, strictMode: false, reminderTime: '20:00' }
}

export function totalLessons(pack: LanguagePack): number { return pack.courses.reduce((sum, course) => sum + course.lessons, 0) }
export function courseProgress(pack: LanguagePack, lessonsCompleted: number) {
  let cumulative = 0
  const rows = pack.courses.map((course) => {
    const start = cumulative; cumulative += course.lessons
    const completedLessons = Math.max(0, Math.min(course.lessons, lessonsCompleted - start))
    return { course, completedLessons, percent: Math.round((completedLessons / course.lessons) * 100), unlocked: start <= lessonsCompleted, active: false }
  })
  const activeIndex = rows.findIndex((row) => row.completedLessons < row.course.lessons)
  if (activeIndex >= 0) rows[activeIndex].active = true
  return rows
}
