import { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'motion/react'
import {
  Users, BookOpen, Lightbulb, FlaskConical, Heart,
  GraduationCap, Database, Brain, ChevronRight, Menu, X, ArrowRight,
  Star, Globe, MessageCircle
} from 'lucide-react'
import './index.css'

const BENEFITS = [
  {
    icon: Users,
    title: '実務家同士のつながり',
    desc: '大学・企業・教育機関など立場を超えた仲間と出会い、孤独な悩みを一緒に解決。',
    color: 'bg-emerald-50 text-emerald-700',
    accent: 'border-emerald-200',
  },
  {
    icon: BookOpen,
    title: '実践・知見の共有',
    desc: '授業改善、学習分析、AI活用など、現場での工夫や失敗を共有できます。',
    color: 'bg-sky-50 text-sky-700',
    accent: 'border-sky-200',
  },
  {
    icon: Lightbulb,
    title: '最新の知見・情報',
    desc: '教育テクノロジーや学習科学の最新動向をキャッチアップ。',
    color: 'bg-amber-50 text-amber-700',
    accent: 'border-amber-200',
  },
  {
    icon: FlaskConical,
    title: '共に実験し、未来を創る',
    desc: '新しいアイデアやツールを試し、教育の可能性を広げていきます。',
    color: 'bg-violet-50 text-violet-700',
    accent: 'border-violet-200',
  },
  {
    icon: Heart,
    title: '安心して話せる場',
    desc: '否定しない、競わない。本音で語り合える安全なコミュニティです。',
    color: 'bg-rose-50 text-rose-700',
    accent: 'border-rose-200',
  },
]

const FOR_WHO = [
  { icon: GraduationCap, text: '授業や研修をより良くしたいと考えている方' },
  { icon: Database, text: '学習データやテクノロジーを活用したい方' },
  { icon: Users, text: '他の教育者とつながり、刺激を受けたい方' },
  { icon: Brain, text: 'AIやラーニングアナリティクスに興味がある方' },
  { icon: Star, text: '教育の未来を一緒に創っていきたい方' },
]

const ACTIVITIES = [
  { icon: Globe, title: 'オンラインイベント・勉強会', desc: '月1〜2回開催' },
  { icon: MessageCircle, title: 'テーマ別ディスカッション', desc: '実践的な議論の場' },
  { icon: BookOpen, title: '実践事例・実験の共有', desc: '現場の知見を届け合う' },
  { icon: FlaskConical, title: '共同プロジェクト・実証実験', desc: '一緒に試して学ぶ' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' as const } },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
}

function InView({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0, margin: '0px 0px -50px 0px' })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      variants={stagger}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f8fdf8] font-sans">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
              <GraduationCap size={16} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">教育共創コミュニティ</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-gray-600 font-medium">
            <a href="#benefits" className="hover:text-emerald-700 transition-colors">得られること</a>
            <a href="#for-who" className="hover:text-emerald-700 transition-colors">こんな方へ</a>
            <a href="#activities" className="hover:text-emerald-700 transition-colors">活動内容</a>
            <a href="#join" className="px-4 py-2 bg-emerald-600 text-white rounded-full text-[13px] hover:bg-emerald-700 transition-colors">
              参加する（無料）
            </a>
          </div>
          <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="md:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-4 text-[14px]"
            >
              {['得られること', 'こんな方へ', '活動内容'].map(t => (
                <a key={t} href="#" className="text-gray-700 hover:text-emerald-700">{t}</a>
              ))}
              <a href="#join" className="px-4 py-2 bg-emerald-600 text-white rounded-full text-center">参加する（無料）</a>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* background blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-1/4 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-sky-100 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-700 text-[12px] font-medium tracking-wide mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            参加費無料 · オンライン中心 · 全国からOK
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[2.8rem] md:text-[4rem] lg:text-[4.8rem] font-bold leading-[1.1] tracking-tight text-gray-900 mb-6"
          >
            教育を変えたい人が、<br />
            <span className="text-emerald-600">つながり、学び、</span><br />
            共に創る。
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="text-gray-500 text-[17px] leading-relaxed max-w-xl mx-auto mb-10"
          >
            一人では難しいことも、仲間と一緒なら変えていける。<br />
            教育の「今」と「未来」を一緒に考えませんか？
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center"
          >
            <a
              href="#join"
              className="flex items-center gap-2 px-7 py-3.5 bg-emerald-600 text-white rounded-full font-semibold text-[15px] hover:bg-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-200 hover:-translate-y-0.5"
            >
              まずは参加してみる
              <ArrowRight size={16} />
            </a>
            <a
              href="#benefits"
              className="flex items-center gap-2 px-7 py-3.5 border border-gray-200 rounded-full text-gray-700 text-[15px] hover:border-emerald-300 hover:text-emerald-700 transition-colors"
            >
              詳しく見る
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-6 text-[12px] text-gray-400"
          >
            見るだけの参加もOK！　お気軽にどうぞ
          </motion.p>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <InView className="text-center mb-16">
            <motion.p variants={fadeUp} className="text-emerald-600 font-medium text-[12px] uppercase tracking-widest mb-3">What You'll Get</motion.p>
            <motion.h2 variants={fadeUp} className="text-[2rem] md:text-[2.8rem] font-bold text-gray-900 leading-tight">
              このコミュニティで<br className="md:hidden" />得られること
            </motion.h2>
          </InView>

          <InView className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`p-6 rounded-2xl border ${b.accent} bg-white hover:shadow-md transition-shadow`}
              >
                <div className={`w-11 h-11 rounded-xl ${b.color} flex items-center justify-center mb-4`}>
                  <b.icon size={20} />
                </div>
                <h3 className="font-bold text-gray-900 text-[16px] mb-2">{b.title}</h3>
                <p className="text-gray-500 text-[14px] leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </InView>
        </div>
      </section>

      {/* For Who */}
      <section id="for-who" className="py-24 px-6 bg-gradient-to-br from-emerald-50 to-sky-50">
        <div className="max-w-5xl mx-auto">
          <InView className="text-center mb-16">
            <motion.p variants={fadeUp} className="text-emerald-600 font-medium text-[12px] uppercase tracking-widest mb-3">For You</motion.p>
            <motion.h2 variants={fadeUp} className="text-[2rem] md:text-[2.8rem] font-bold text-gray-900">
              こんな方におすすめ
            </motion.h2>
          </InView>

          <InView className="flex flex-col gap-3 max-w-2xl mx-auto">
            {FOR_WHO.map((item, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <item.icon size={18} />
                </div>
                <p className="text-gray-800 text-[15px] font-medium">{item.text}</p>
                <ChevronRight size={16} className="text-gray-300 ml-auto flex-shrink-0" />
              </motion.div>
            ))}
          </InView>
        </div>
      </section>

      {/* Activities */}
      <section id="activities" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <InView className="text-center mb-16">
            <motion.p variants={fadeUp} className="text-emerald-600 font-medium text-[12px] uppercase tracking-widest mb-3">Activities</motion.p>
            <motion.h2 variants={fadeUp} className="text-[2rem] md:text-[2.8rem] font-bold text-gray-900">
              主な活動内容
            </motion.h2>
          </InView>

          <InView className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ACTIVITIES.map((a, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-6 rounded-2xl bg-gray-50 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center mb-4 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <a.icon size={20} />
                </div>
                <h3 className="font-bold text-gray-900 text-[15px] mb-1">{a.title}</h3>
                <p className="text-gray-500 text-[13px]">{a.desc}</p>
              </motion.div>
            ))}
          </InView>
        </div>
      </section>

      {/* CTA */}
      <section id="join" className="py-28 px-6 bg-gradient-to-br from-emerald-700 to-emerald-900 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center">
          <InView>
            <motion.p variants={fadeUp} className="text-emerald-300 text-[12px] uppercase tracking-widest font-medium mb-4">
              ★ 未来の教育は、私たちの対話から始まる。
            </motion.p>
            <motion.h2 variants={fadeUp} className="text-[2rem] md:text-[3rem] font-bold text-white leading-tight mb-6">
              あなたの参加を<br />お待ちしています！
            </motion.h2>
            <motion.p variants={fadeUp} className="text-emerald-200 text-[16px] leading-relaxed mb-10">
              初めての方も大歓迎。見るだけの参加もOKです。<br />
              まずはお気軽にご参加ください。
            </motion.p>
            <motion.a
              variants={fadeUp}
              href="#"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-700 rounded-full font-bold text-[16px] hover:bg-emerald-50 transition-all hover:shadow-xl hover:-translate-y-1"
            >
              コミュニティページへ
              <ArrowRight size={18} />
            </motion.a>
            <motion.p variants={fadeUp} className="mt-5 text-emerald-400 text-[12px]">
              参加費無料 · いつでも退会可能
            </motion.p>
          </InView>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 bg-gray-900 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center">
            <GraduationCap size={13} className="text-white" />
          </div>
          <span className="text-white font-semibold text-[14px]">教育共創コミュニティ</span>
        </div>
        <p className="text-gray-500 text-[12px]">教育を良くしたいすべての人のための、共創のプラットフォーム</p>
        <p className="text-gray-700 text-[11px] mt-4">© 2026 教育共創コミュニティ</p>
      </footer>
    </div>
  )
}
