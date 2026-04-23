// CDN構成: import文なし、チャートはSVGで自前実装
const { useState, useEffect, useCallback, useRef } = React;

const STORAGE_KEY = 'balance_wheel_v2_history';

const CATEGORIES = [
  {
    id: 'health', label: '健康', emoji: '💪', color: '#4ade80',
    questions: [
      '毎日7〜8時間の睡眠が取れていますか？',
      '週に3回以上、体を動かす機会がありますか？',
      '食事のバランスに気を配っていますか？',
      '自分の体調の変化に気づき、適切に対処できていますか？',
    ],
  },
  {
    id: 'family', label: '家族', emoji: '🏠', color: '#f97316',
    questions: [
      '家族との時間を十分に取れていますか？',
      '家族との関係に満足していますか？',
      '家族のことを心からサポートできていますか？',
    ],
  },
  {
    id: 'friends', label: '友人・人間関係', emoji: '🤝', color: '#60a5fa',
    questions: [
      '信頼できる友人と定期的に会えていますか？',
      '周囲の人との関係が良好だと感じますか？',
      '困ったとき頼れる人が身近にいますか？',
    ],
  },
  {
    id: 'hobby', label: '趣味・楽しみ', emoji: '🎨', color: '#e879f9',
    questions: [
      '自分の趣味や楽しみの時間を確保できていますか？',
      '日常の中でワクワクする瞬間がありますか？',
    ],
  },
  {
    id: 'learning', label: '学び・成長', emoji: '📚', color: '#facc15',
    questions: [
      '新しいことを学ぶ機会が定期的にありますか？',
      '自分の成長を実感できていますか？',
      '将来に向けてスキルを磨いていますか？',
    ],
  },
  {
    id: 'work', label: '仕事・職業', emoji: '💼', color: '#38bdf8',
    questions: [
      '仕事にやりがいを感じていますか？',
      'ワークライフバランスが取れていますか？',
      '職場の人間関係は良好ですか？',
      'キャリアの方向性に納得していますか？',
    ],
  },
  {
    id: 'money', label: 'お金・経済', emoji: '💰', color: '#a3e635',
    questions: [
      '毎月の収支が安定していますか？',
      '将来の備え（貯蓄・投資）ができていますか？',
      'お金のことで過度なストレスを感じていませんか？',
    ],
  },
  {
    id: 'social', label: '社会貢献', emoji: '🌱', color: '#2dd4bf',
    questions: [
      '社会や地域に対して何か貢献できていますか？',
      '自分の行動が誰かの役に立っていると感じますか？',
    ],
  },
];

const OPTIONS = [
  { label: 'はい', emoji: '😊', value: 1.0 },
  { label: '少し', emoji: '🤔', value: 0.5 },
  { label: 'いいえ', emoji: '😔', value: 0.0 },
];

const ALL_QUESTIONS = CATEGORIES.flatMap(cat =>
  cat.questions.map((q, i) => ({ catId: cat.id, qIdx: i, text: q, key: `${cat.id}_${i}` }))
);

function calcCategoryScores(answers) {
  return CATEGORIES.map(cat => {
    const vals = cat.questions.map((_, i) => answers[`${cat.id}_${i}`]).filter(v => v !== undefined);
    const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    const pct = Math.round(avg * 100);
    return { id: cat.id, label: cat.label, emoji: cat.emoji, color: cat.color, pct };
  });
}

function buildDonutData(catScores) {
  const total = catScores.reduce((s, c) => s + c.pct, 0);
  if (total === 0) return catScores.map(c => ({ ...c, value: 1 }));
  return catScores.map(c => ({ ...c, value: c.pct || 1 }));
}

function calcOverall(catScores) {
  const avg = catScores.reduce((s, c) => s + c.pct, 0) / catScores.length;
  return Math.round(avg);
}

function getMessage(score) {
  if (score >= 80) return { text: '素晴らしいバランスです！', sub: '各領域が充実しています。この調子を維持しましょう。' };
  if (score >= 60) return { text: 'バランスは良好です', sub: 'いくつかの領域で伸びしろがあります。重点的に取り組んでみましょう。' };
  if (score >= 40) return { text: '改善の余地があります', sub: '気になる領域から少しずつ取り組むと変化が出てきます。' };
  return { text: '今が見直しのチャンスです', sub: 'まず1つの領域に集中して改善してみましょう。小さな一歩が大切です。' };
}

// SVGドーナツチャート（Recharts不使用）
function DonutChart({ data, score }) {
  const size = 260;
  const cx = size / 2, cy = size / 2;
  const outerR = 110, innerR = 72;
  const total = data.reduce((s, d) => s + d.value, 0);
  const gap = 0.015; // ラジアン単位のギャップ

  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const sweep = (d.value / total) * (Math.PI * 2) - gap;
    const start = angle + gap / 2;
    const end = start + sweep;
    angle += (d.value / total) * Math.PI * 2;

    const x1 = cx + outerR * Math.cos(start), y1 = cy + outerR * Math.sin(start);
    const x2 = cx + outerR * Math.cos(end),   y2 = cy + outerR * Math.sin(end);
    const x3 = cx + innerR * Math.cos(end),   y3 = cy + innerR * Math.sin(end);
    const x4 = cx + innerR * Math.cos(start), y4 = cy + innerR * Math.sin(start);
    const large = sweep > Math.PI ? 1 : 0;

    return { ...d, path: `M${x1},${y1} A${outerR},${outerR},0,${large},1,${x2},${y2} L${x3},${y3} A${innerR},${innerR},0,${large},0,${x4},${y4} Z` };
  });

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
      <text x={cx} y={cy - 12} textAnchor="middle" fill="#e8e6df" fontSize="38" fontWeight="700" fontFamily="DM Mono, monospace">{score}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#9ca3af" fontSize="13">総合スコア</text>
    </svg>
  );
}

function FadeWrapper({ children, phase }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(false); const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, [phase]);
  return (
    <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.35s ease', minHeight: '100dvh' }}>
      {children}
    </div>
  );
}

// ---- デバッグコンソール ----
function DebugConsole() {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const origRef = useRef({});

  useEffect(() => {
    ['log', 'warn', 'error'].forEach(method => {
      origRef.current[method] = console[method];
      console[method] = (...args) => {
        origRef.current[method](...args);
        setLogs(prev => [...prev.slice(-99), { t: method, msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }]);
      };
    });
    return () => { ['log', 'warn', 'error'].forEach(m => { console[m] = origRef.current[m]; }); };
  }, []);

  const copy = () => navigator.clipboard.writeText(logs.map(l => `[${l.t}] ${l.msg}`).join('\n'));

  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 9999, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: '#1e1e2e', color: '#a0aec0', border: '1px solid #333', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
        🐛 {open ? '閉じる' : 'ログ'}
      </button>
      {open && (
        <div style={{ background: '#0d0d14', border: '1px solid #333', borderRadius: 8, padding: 8, marginTop: 4, width: 320, maxHeight: 200, overflowY: 'auto' }}>
          <button onClick={copy} style={{ background: '#2d2d3e', color: '#a0aec0', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', marginBottom: 6, width: '100%' }}>
            📋 コピー
          </button>
          {logs.length === 0 && <div style={{ color: '#555' }}>ログなし</div>}
          {logs.map((l, i) => (
            <div key={i} style={{ color: l.t === 'error' ? '#f87171' : l.t === 'warn' ? '#fbbf24' : '#6ee7b7', marginBottom: 2, wordBreak: 'break-all' }}>
              {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- メインコンポーネント ----
function BalanceWheelV2() {
  const [phase, setPhase] = useState('intro');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [selectedHistory, setSelectedHistory] = useState(null);

  const saveHistory = useCallback((newHistory) => {
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  }, []);

  const handleAnswer = (value) => {
    const q = ALL_QUESTIONS[qIndex];
    const newAnswers = { ...answers, [q.key]: value };
    setAnswers(newAnswers);
    if (qIndex < ALL_QUESTIONS.length - 1) {
      setQIndex(qIndex + 1);
    } else {
      setPhase('result');
    }
  };

  const handleBack = () => {
    if (qIndex > 0) setQIndex(qIndex - 1);
    else setPhase('intro');
  };

  const handleSave = () => {
    const catScores = calcCategoryScores(answers);
    const overall = calcOverall(catScores);
    const entry = {
      id: Date.now(),
      date: new Date().toLocaleString('ja-JP'),
      answers,
      catScores,
      overall,
    };
    saveHistory([entry, ...history]);
    console.log('保存完了:', entry.date, '総合スコア:', overall);
  };

  const handleDeleteHistory = (id) => {
    const next = history.filter(h => h.id !== id);
    saveHistory(next);
    if (selectedHistory?.id === id) setSelectedHistory(null);
  };

  const catScores = phase === 'result' ? calcCategoryScores(answers) : [];
  const donutData = phase === 'result' ? buildDonutData(catScores) : [];
  const overall = phase === 'result' ? calcOverall(catScores) : 0;
  const message = phase === 'result' ? getMessage(overall) : null;
  const progress = ALL_QUESTIONS.length > 0 ? ((qIndex) / ALL_QUESTIONS.length) * 100 : 0;
  const currentCat = phase === 'quiz' ? CATEGORIES.find(c => c.id === ALL_QUESTIONS[qIndex].catId) : null;

  const S = {
    wrap: { maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' },
    title: { fontSize: 22, fontWeight: 600, marginBottom: 8 },
    sub: { color: '#9ca3af', fontSize: 14, lineHeight: 1.7 },
    btn: (bg, color = '#0f0f13') => ({
      background: bg, color, border: 'none', borderRadius: 12,
      padding: '14px 28px', fontSize: 15, fontWeight: 600,
      cursor: 'pointer', width: '100%', marginTop: 12,
      fontFamily: 'Noto Serif JP, serif',
    }),
    card: { background: '#1a1a24', borderRadius: 16, padding: '20px 20px 24px', marginBottom: 16 },
  };

  return (
    <>
      <FadeWrapper phase={phase}>
        {/* ---- INTRO ---- */}
        {phase === 'intro' && (
          <div style={S.wrap}>
            <div style={{ textAlign: 'center', paddingTop: 48 }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>⚖️</div>
              <h1 style={{ ...S.title, fontSize: 26 }}>バランスホイール</h1>
              <p style={{ ...S.sub, marginTop: 12, marginBottom: 32 }}>
                26の質問に答えるだけで、<br />あなたの人生8領域のバランスを診断します。<br />所要時間：約3〜5分
              </p>
              <button style={S.btn('#4ade80')} onClick={() => { setAnswers({}); setQIndex(0); setPhase('quiz'); }}>
                診断をはじめる →
              </button>
              {history.length > 0 && (
                <button style={{ ...S.btn('transparent', '#9ca3af'), border: '1px solid #333', marginTop: 8 }}
                  onClick={() => setPhase('history')}>
                  過去の結果を見る ({history.length}件)
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---- QUIZ ---- */}
        {phase === 'quiz' && (
          <div style={S.wrap}>
            {/* プログレスバー */}
            <div style={{ height: 4, background: '#1a1a24', borderRadius: 2, marginBottom: 24 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: currentCat?.color || '#4ade80', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 20, textAlign: 'right' }}>
              {qIndex + 1} / {ALL_QUESTIONS.length}
            </div>

            {/* カテゴリバッジ */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a1a24', borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
              <span>{currentCat?.emoji}</span>
              <span style={{ fontSize: 13, color: currentCat?.color }}>{currentCat?.label}</span>
            </div>

            {/* 質問 */}
            <div style={{ ...S.card, marginBottom: 32 }}>
              <p style={{ fontSize: 17, lineHeight: 1.8 }}>{ALL_QUESTIONS[qIndex].text}</p>
            </div>

            {/* 選択肢 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPTIONS.map(opt => (
                <button key={opt.label}
                  style={{ ...S.btn('#1a1a24', '#e8e6df'), border: '1px solid #2a2a3a', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '16px 20px' }}
                  onClick={() => handleAnswer(opt.value)}>
                  <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <button onClick={handleBack} style={{ ...S.btn('transparent', '#6b7280'), border: 'none', marginTop: 20, fontSize: 13 }}>
              ← 前の質問に戻る
            </button>
          </div>
        )}

        {/* ---- RESULT ---- */}
        {phase === 'result' && (
          <div style={S.wrap}>
            <h2 style={{ ...S.title, textAlign: 'center', marginBottom: 4 }}>診断結果</h2>
            <p style={{ ...S.sub, textAlign: 'center', marginBottom: 28 }}>{message.text}</p>

            {/* ドーナツチャート（SVG） */}
            <DonutChart data={donutData} score={overall} />

            {/* カテゴリ凡例 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24, marginTop: 8 }}>
              {catScores.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9ca3af' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                  <span>{c.emoji} {c.label}</span>
                </div>
              ))}
            </div>

            {/* スコアバー */}
            <div style={S.card}>
              {catScores.map(c => (
                <div key={c.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{c.emoji} {c.label}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', color: c.color }}>{c.pct}点</span>
                  </div>
                  <div style={{ height: 6, background: '#2a2a3a', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${c.pct}%`, background: c.color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* メッセージ */}
            <div style={{ ...S.card, borderLeft: `3px solid #4ade80`, marginBottom: 24 }}>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: '#d1d5db' }}>{message.sub}</p>
            </div>

            <button style={S.btn('#4ade80')} onClick={handleSave}>📊 結果を保存する</button>
            <button style={{ ...S.btn('transparent', '#9ca3af'), border: '1px solid #333' }}
              onClick={() => setPhase('history')}>履歴を見る</button>
            <button style={{ ...S.btn('transparent', '#6b7280'), border: 'none', fontSize: 13 }}
              onClick={() => { setAnswers({}); setQIndex(0); setPhase('quiz'); }}>もう一度診断する</button>
            <button style={{ ...S.btn('transparent', '#6b7280'), border: 'none', fontSize: 13 }}
              onClick={() => setPhase('intro')}>トップに戻る</button>
          </div>
        )}

        {/* ---- HISTORY ---- */}
        {phase === 'history' && (
          <div style={S.wrap}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={S.title}>過去の結果</h2>
              <button onClick={() => setPhase('intro')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>← 戻る</button>
            </div>

            {history.length === 0 && <p style={S.sub}>まだ記録がありません。</p>}

            {history.map(h => (
              <div key={h.id} style={{ ...S.card, cursor: 'pointer', border: selectedHistory?.id === h.id ? '1px solid #4ade80' : '1px solid transparent' }}
                onClick={() => setSelectedHistory(selectedHistory?.id === h.id ? null : h)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>{h.date}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, color: '#4ade80' }}>{h.overall}点</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDeleteHistory(h.id); }}
                    style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}>🗑</button>
                </div>

                {/* 展開詳細 */}
                {selectedHistory?.id === h.id && (
                  <div style={{ marginTop: 16 }}>
                    {h.catScores.map(c => (
                      <div key={c.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                          <span>{c.emoji} {c.label}</span>
                          <span style={{ fontFamily: 'DM Mono, monospace', color: c.color }}>{c.pct}点</span>
                        </div>
                        <div style={{ height: 5, background: '#2a2a3a', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${c.pct}%`, background: c.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </FadeWrapper>
      <DebugConsole />
    </>
  );
}
