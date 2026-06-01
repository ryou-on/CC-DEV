import { useState } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Users, BookOpen, TrendingUp, Lightbulb, MessagesSquare,
  X, ArrowRight, ArrowDown, Globe, UserPlus, Eye,
  Video, MessageSquare, BarChart3, Mic,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './index.css'

/* ───────────────────────── データ ───────────────────────── */

const NAV = [
  { label: 'コミュニティについて', href: '#benefits' },
  { label: '活動内容', href: '#activities' },
  { label: 'イベント', href: '#activities' },
  { label: '参加方法', href: '#join' },
]

const BENEFITS: { n: string; icon: LucideIcon; title: string; desc: string }[] = [
  { n: '01', icon: Users, title: '実践家同士のつながり', desc: '大学・企業・教育現場など、立場を越えた仲間と出会い、協働を生み出す場に出会えます。' },
  { n: '02', icon: BookOpen, title: '実践・知見の共有', desc: '授業実践、学習設計、AI活用など、現場での工夫や失敗を共有できます。' },
  { n: '03', icon: TrendingUp, title: '最新の知見・情報に触れられる', desc: '教育テックのシーンや学習科学の最前線をキャッチアップ。' },
  { n: '04', icon: Lightbulb, title: '共に実践し、未来を創る', desc: '新しいアイデアやツールを試し、教育の可能性を広げていきます。' },
  { n: '05', icon: MessagesSquare, title: '安心して話せる場', desc: '宣伝なし、競争なし。本音で語り合える安全なコミュニティです。' },
]

const FOR_WHO = [
  '授業や研修をより良くしたいと考えている方',
  '学習データやテクノロジーを活用したい方',
  '他の教育者とつながり、刺激を受けたい方',
  'AIやラーニングアナリティクスに興味がある方',
  '教育の未来を一緒に創っていきたい方',
]

const ACTIVITIES: { n: string; title: [string, string]; img: string; icon: LucideIcon }[] = [
  { n: '01', title: ['オンラインイベント・', '勉強会（月1〜2回）'], img: 'https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?auto=format&fit=crop&w=800&q=80', icon: Video },
  { n: '02', title: ['テーマ別', 'ディスカッション'], img: 'https://images.unsplash.com/photo-1577415124269-fc1140a69e91?auto=format&fit=crop&w=800&q=80', icon: MessageSquare },
  { n: '03', title: ['実践事例・', '実験の共有'], img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80', icon: BarChart3 },
  { n: '04', title: ['共同プロジェクトや', '実証実験'], img: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80', icon: Users },
]

const POINTS: { icon: LucideIcon; lines: [string, string] }[] = [
  { icon: Globe, lines: ['オンライン中心', '全国どこからでもOK'] },
  { icon: UserPlus, lines: ['初めての方も', '大歓迎！'] },
  { icon: Eye, lines: ['見るだけの参加もOK！', '（ご参加いただけます）'] },
]

const IMG = {
  hero: 'https://images.unsplash.com/photo-1698986668651-295fda8e61bc?auto=format&fit=crop&w=1200&q=80',
  data: 'https://images.unsplash.com/photo-1754307943655-a76a567661e3?auto=format&fit=crop&w=900&q=80',
  mic: 'https://images.unsplash.com/photo-1666858852072-d9198dab504b?auto=format&fit=crop&w=900&q=80',
}

/* ───────────────────────── 汎用コンポーネント ───────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const

// スクロールで一度だけフェードアップ表示
function FadeIn({ children, className, delay = 0, y = 28 }: {
  children: ReactNode; className?: string; delay?: number; y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

// 写真（読み込み失敗時はフォレストグリーンのグラデ＋アイコンに優雅にフォールバック）
function Photo({ src, alt, icon: Icon, className = '', imgClassName = '', tint = false }: {
  src: string; alt: string; icon: LucideIcon; className?: string; imgClassName?: string; tint?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-moss via-forest to-forest-deep ${className}`}>
      <div className="pointer-events-none absolute -top-1/4 -right-1/4 h-2/3 w-2/3 rounded-full bg-cream/10 blur-3xl" />
      {!failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Icon className="text-cream/25" size={64} strokeWidth={1} />
        </div>
      )}
      {/* 元画像の緑テック調に寄せるグリーンティント */}
      {tint && <div className="pointer-events-none absolute inset-0 bg-forest/45 mix-blend-multiply" />}
    </div>
  )
}

// セクション見出し（明朝の和文 ＋ 小さなラテンラベル）
function SectionHead({ jp, en, align = 'center', tone = 'ink' }: {
  jp: string; en: string; align?: 'center' | 'left'; tone?: 'ink' | 'cream'
}) {
  return (
    <div className={align === 'center' ? 'text-center' : 'text-left'}>
      <h2 className={`font-serif text-[1.7rem] md:text-[2.4rem] tracking-[0.04em] ${tone === 'cream' ? 'text-cream' : 'text-ink'}`}>{jp}</h2>
      <p className="eyebrow mt-3 text-[11px] text-moss">{en}</p>
    </div>
  )
}

/* ───────────────────────── ページ本体 ───────────────────────── */

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div id="top" className="min-h-screen bg-cream font-sans text-ink">
      {/* ════════ ナビゲーション ════════ */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-hair/50 bg-cream/80 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-6 md:px-10">
          <a href="#top" className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-ink md:text-[17px]">教育共創コミュニティ</span>
            <span className="eyebrow mt-[5px] text-[8px] text-moss md:text-[9px]">Education Co-Creation Community</span>
          </a>

          <nav className="hidden items-center gap-9 lg:flex">
            {NAV.map(item => (
              <a key={item.label} href={item.href} className="text-[13px] tracking-wide text-ink/75 transition-colors hover:text-forest">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a href="#join" className="hidden rounded-sm bg-forest px-5 py-2.5 text-[13px] font-medium text-cream transition-colors hover:bg-forest-deep sm:inline-block">
              参加する（無料）
            </a>
            <button
              aria-label="メニュー"
              onClick={() => setMenuOpen(true)}
              className="flex h-9 w-9 flex-col items-center justify-center gap-[5px]"
            >
              <span className="h-px w-6 bg-ink" />
              <span className="h-px w-6 bg-ink" />
              <span className="h-px w-6 bg-ink" />
            </button>
          </div>
        </div>
      </header>

      {/* ════════ フルスクリーンメニュー ════════ */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[60] flex flex-col bg-forest text-cream"
          >
            <div className="mx-auto flex h-[68px] w-full max-w-[1280px] items-center justify-between px-6 md:px-10">
              <span className="text-[15px] font-bold md:text-[17px]">教育共創コミュニティ</span>
              <button aria-label="閉じる" onClick={() => setMenuOpen(false)} className="p-2">
                <X size={24} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col items-center justify-center gap-8">
              {NAV.map((item, i) => (
                <motion.a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, ease: EASE }}
                  className="font-serif text-2xl tracking-wide text-cream/90 hover:text-cream"
                >
                  {item.label}
                </motion.a>
              ))}
              <motion.a
                href="#join"
                onClick={() => setMenuOpen(false)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + NAV.length * 0.07, ease: EASE }}
                className="mt-4 rounded-sm bg-cream px-8 py-3.5 text-[15px] font-medium text-forest"
              >
                参加する（無料）
              </motion.a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ ヒーロー ════════ */}
      <section className="relative min-h-[100svh] w-full overflow-hidden bg-cream">
        {/* 写真（右側 / モバイルは全面背景） */}
        <div className="absolute inset-y-0 right-0 w-full md:w-[54%]">
          <Photo src={IMG.hero} alt="教育について語り合う人々" icon={Users} className="h-full w-full" />
          {/* 左端をクリームへなじませる */}
          <div className="absolute inset-0 bg-gradient-to-r from-cream via-cream/10 to-transparent md:via-cream/0" />
        </div>
        {/* モバイル用の可読性オーバーレイ */}
        <div className="absolute inset-0 bg-gradient-to-r from-cream via-cream/75 to-cream/20 md:hidden" />

        {/* 左端の縦書きラベル */}
        <div className="absolute left-3 top-1/2 hidden -translate-y-1/2 lg:block">
          <p className="tate text-[11px] tracking-[0.25em] text-muted">教育共創コミュニティ（参加費無料）</p>
        </div>

        {/* メインコンテンツ */}
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1280px] items-center px-7 md:px-16">
          <div className="flex items-start gap-5 pt-24 md:gap-9 md:pt-0">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1.1, ease: EASE }}
              className="tate font-serif text-[2.85rem] font-extrabold leading-[1.12] tracking-[0.02em] text-ink sm:text-[4.2rem] md:text-[5.2rem]"
            >
              教育の未来を、<br />私たちの手で。
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="tate mt-2 font-serif text-[0.95rem] leading-[2.1] tracking-[0.04em] text-ink/75 md:text-[1.15rem]"
            >
              教育を変えたい人が、つながり、学び、共に創る。
            </motion.p>
          </div>
        </div>

        {/* 左下のラテンラベル */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="absolute bottom-10 left-16 hidden md:block"
        >
          <p className="eyebrow text-[11px] leading-[2.4] text-muted">CO-CREATE<br />THE FUTURE<br />OF EDUCATION</p>
        </motion.div>

        {/* グリーンの引用ボックス（デスクトップ：写真に重ねる） */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.9, ease: EASE }}
          className="absolute bottom-[12%] right-[5%] z-10 hidden w-[clamp(230px,21vw,290px)] bg-forest p-8 text-cream shadow-2xl md:block"
        >
          <p className="font-serif text-[1.25rem] leading-[1.8]">一人では難しいことも、仲間と一緒なら変えていける。</p>
          <div className="my-6 h-px w-12 bg-cream/40" />
          <p className="text-[13px] leading-[1.9] text-cream/85">教育の「今」と「未来」を一緒に考えませんか？</p>
        </motion.div>

        {/* グリーンの引用ボックス（モバイル） */}
        <div className="absolute inset-x-7 bottom-10 z-10 bg-forest p-6 text-cream md:hidden">
          <p className="font-serif text-[1.05rem] leading-[1.8]">一人では難しいことも、仲間と一緒なら変えていける。</p>
          <div className="my-4 h-px w-10 bg-cream/40" />
          <p className="text-[12px] leading-[1.9] text-cream/85">教育の「今」と「未来」を一緒に考えませんか？</p>
        </div>

        {/* スクロールインジケーター */}
        <div className="absolute bottom-10 right-10 hidden flex-col items-center gap-3 md:flex">
          <span className="tate eyebrow text-[9px] text-muted">Scroll Down</span>
          <motion.span
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
            className="grid h-11 w-11 place-items-center rounded-full border border-hair"
          >
            <ArrowDown size={15} className="text-muted" strokeWidth={1.5} />
          </motion.span>
        </div>
      </section>

      {/* ════════ Benefits ════════ */}
      <section id="benefits" className="bg-cream px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-[1280px]">
          <FadeIn>
            <SectionHead jp="このコミュニティで得られること" en="Benefits" />
          </FadeIn>

          <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 border-t border-hair pt-14 md:mt-20 lg:grid-cols-5">
            {BENEFITS.map((b, i) => (
              <FadeIn key={b.n} delay={i * 0.08} className="flex flex-col">
                <span className="font-serif text-[2.6rem] leading-none text-moss/85">{b.n}</span>
                <b.icon className="mt-6 text-forest" size={26} strokeWidth={1.4} />
                <h3 className="mt-5 font-serif text-[1.05rem] leading-snug text-ink">{b.title}</h3>
                <p className="mt-3 text-[12.5px] leading-[1.95] text-muted">{b.desc}</p>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ For You（こんな方におすすめ） ════════ */}
      <section className="bg-cream-deep">
        <div className="flex flex-col lg:flex-row">
          {/* 左：データ／テクノロジーの写真 */}
          <Photo
            src={IMG.data}
            alt="学習データとテクノロジー"
            icon={BarChart3}
            tint
            className="min-h-[260px] lg:min-h-[600px] lg:basis-[22%]"
          />

          {/* 中：縦書きラベル ＋ チェックリスト */}
          <div className="flex gap-7 bg-cream px-8 py-14 md:px-12 md:py-20 lg:basis-[34%]">
            <FadeIn className="shrink-0">
              <h2 className="tate font-serif text-[1.7rem] tracking-[0.06em] text-ink md:text-[2rem]">こんな方におすすめ</h2>
              <p className="eyebrow mt-4 text-[10px] text-moss" style={{ writingMode: 'vertical-rl' }}>For You</p>
            </FadeIn>
            <ul className="flex flex-1 flex-col justify-center">
              {FOR_WHO.map((t, i) => (
                <FadeIn key={i} delay={i * 0.08}>
                  <li className="flex items-baseline gap-3 border-b border-hair/70 py-4">
                    <span className="text-moss">—</span>
                    <span className="text-[13.5px] leading-[1.7] text-ink/90">{t}</span>
                  </li>
                </FadeIn>
              ))}
            </ul>
          </div>

          {/* 右：縦書きの誘い文 */}
          <div className="flex items-center justify-center bg-cream px-6 py-14 lg:basis-[16%] lg:py-20">
            <FadeIn className="flex gap-4">
              <p className="tate font-serif text-[0.85rem] leading-[2] text-ink/70">あなたの参加をお待ちしています。</p>
              <p className="tate font-serif text-[1.4rem] leading-[1.7] tracking-[0.04em] text-forest md:text-[1.7rem]">未来の教育は、私たちの対話から始まる</p>
            </FadeIn>
          </div>

          {/* 右端：登壇者の写真 */}
          <Photo
            src={IMG.mic}
            alt="登壇して語る教育者"
            icon={Mic}
            className="min-h-[280px] lg:min-h-[600px] lg:basis-[28%]"
          />
        </div>
      </section>

      {/* ════════ Activities（主な活動内容） ════════ */}
      <section id="activities" className="bg-cream px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-10 lg:flex-row lg:gap-12">
          {/* 縦書きの見出し */}
          <FadeIn className="flex shrink-0 items-start gap-3 lg:flex-row-reverse lg:justify-end">
            <h2 className="font-serif text-[1.7rem] tracking-[0.06em] text-ink md:text-[2.2rem] lg:[writing-mode:vertical-rl]">主な活動内容</h2>
            <p className="eyebrow mt-3 text-[11px] text-moss lg:mt-1 lg:[writing-mode:vertical-rl]">Activities</p>
          </FadeIn>

          {/* 4枚のカード */}
          <div className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ACTIVITIES.map((a, i) => (
              <FadeIn key={a.n} delay={i * 0.1} className="group">
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Photo
                    src={a.img}
                    alt={a.title.join('')}
                    icon={a.icon}
                    className="h-full w-full"
                    imgClassName="transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/75 via-forest-deep/10 to-transparent" />
                  <span className="absolute left-4 top-3 font-serif text-[2.4rem] leading-none text-cream drop-shadow-md">{a.n}</span>
                </div>
                <h3 className="mt-4 font-serif text-[1rem] leading-[1.6] text-ink">
                  {a.title[0]}<br />{a.title[1]}
                </h3>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ CTA（参加への誘い・フッター） ════════ */}
      <section id="join" className="relative overflow-hidden bg-forest text-cream">
        {/* 流れる曲線の装飾 */}
        <svg
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-[75%] opacity-50"
          viewBox="0 0 800 600"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6f8a78" stopOpacity="0" />
              <stop offset="0.55" stopColor="#a9c6b2" stopOpacity="0.7" />
              <stop offset="1" stopColor="#6f8a78" stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 13 }).map((_, i) => {
            const y = 90 + i * 38
            return (
              <path
                key={i}
                d={`M 820 ${y} C 640 ${y - 34}, 540 ${y - 78}, 320 ${y - 52} S 60 ${y + 14}, -40 ${y - 30}`}
                stroke="url(#flow)"
                strokeWidth="1"
                fill="none"
              />
            )
          })}
        </svg>

        <div className="relative mx-auto grid max-w-[1280px] gap-12 px-6 py-20 md:px-10 md:py-24 lg:grid-cols-[3fr_2fr] lg:items-center">
          <FadeIn>
            <h2 className="font-serif text-[1.6rem] leading-[1.55] tracking-[0.02em] md:text-[2.1rem]">
              教育を良くしたいすべての人のための、<br className="hidden md:block" />共創のプラットフォーム
            </h2>
            <a
              href="#"
              className="group mt-9 inline-flex items-center gap-3 bg-cream px-8 py-4 text-[15px] font-medium text-forest transition-all hover:gap-4"
            >
              参加する（無料）
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </a>
          </FadeIn>

          <FadeIn delay={0.15} className="flex flex-col gap-7 sm:flex-row sm:flex-wrap lg:justify-end">
            {POINTS.map((p, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-cream/30">
                  <p.icon size={20} strokeWidth={1.5} className="text-cream" />
                </span>
                <p className="text-[13px] leading-[1.7] text-cream/90">
                  {p.lines[0]}<br />{p.lines[1]}
                </p>
              </div>
            ))}
          </FadeIn>
        </div>

        {/* 下部バー */}
        <div className="relative border-t border-cream/15">
          <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-3 px-6 py-6 md:flex-row md:px-10">
            <span className="text-[14px] text-cream/85">まずはお気軽にご参加ください！</span>
            <a href="#" className="group inline-flex items-center gap-2 text-[14px] text-cream/90 transition-colors hover:text-cream">
              詳しくはコミュニティページへ！
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
          <p className="pb-7 text-center text-[11px] tracking-wide text-cream/40">© 2026 教育共創コミュニティ — Education Co-Creation Community</p>
        </div>
      </section>
    </div>
  )
}
