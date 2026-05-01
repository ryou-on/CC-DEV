import {
  useCurrentFrame,
  useVideoConfig,
  Audio,
  Sequence,
  staticFile,
  interpolate,
} from "remotion";
import { Character } from "./Character";
import { getCurrentLine, SCRIPT, FPS } from "./script";

// 吹き出し
const SpeechBubble: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split("\n");
  return (
    <div style={{
      position: "relative",
      background: "white",
      borderRadius: 24,
      padding: "18px 28px",
      boxShadow: "0 6px 24px rgba(0,0,0,0.14)",
      maxWidth: 340,
      minWidth: 260,
      border: "3px solid #FFD166",
    }}>
      {/* しっぽ（左向き） */}
      <div style={{
        position: "absolute", left: -22, top: "50%",
        transform: "translateY(-50%)",
        width: 0, height: 0,
        borderTop: "14px solid transparent",
        borderBottom: "14px solid transparent",
        borderRight: "22px solid white", zIndex: 2,
      }} />
      <div style={{
        position: "absolute", left: -27, top: "50%",
        transform: "translateY(-50%)",
        width: 0, height: 0,
        borderTop: "16px solid transparent",
        borderBottom: "16px solid transparent",
        borderRight: "24px solid #FFD166", zIndex: 1,
      }} />
      {lines.map((line, i) => (
        <p key={i} style={{
          margin: 0, fontSize: 20, fontWeight: "bold", color: "#2c3e50",
          fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
          lineHeight: 1.65, textAlign: "center",
        }}>
          {line}
        </p>
      ))}
    </div>
  );
};

// 「試してみよう」コーナーの右パネル装飾
const TryCorner: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame * 0.12) * 0.04;
  return (
    <div style={{
      width: "100%", padding: "0 20px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
    }}>
      <div style={{
        background: "linear-gradient(135deg, #27ae60, #2ecc71)",
        borderRadius: 20, padding: "12px 28px",
        transform: `scale(${pulse})`,
        boxShadow: "0 4px 16px rgba(39,174,96,0.35)",
      }}>
        <span style={{ fontSize: 22, fontWeight: "bold", color: "white", letterSpacing: "0.05em" }}>
          🎮 実際に試してみよう！
        </span>
      </div>
      <p style={{
        fontSize: 15, color: "#7f8c8d", textAlign: "center", margin: 0,
        fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
        lineHeight: 1.6,
      }}>
        左のシミュレーターで<br/>分子・分母を動かしてみてね
      </p>
    </div>
  );
};

// 問題コーナー（5秒）
const ProblemCard: React.FC = () => {
  const frame = useCurrentFrame();
  // フェードイン
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  // 問題の分数アニメ（ぽよんと出る）
  const scale = interpolate(frame, [5, 18], [0.5, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <div style={{
      opacity,
      width: "100%", padding: "0 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
    }}>
      {/* 問題ラベル */}
      <div style={{
        background: "#e74c3c", borderRadius: 12,
        padding: "6px 24px",
      }}>
        <span style={{ fontSize: 20, fontWeight: "bold", color: "white" }}>📝 問題</span>
      </div>

      {/* 分数 */}
      <div style={{
        transform: `scale(${scale})`,
        background: "white", borderRadius: 20,
        padding: "20px 36px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        border: "3px solid #3498db",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        {/* 分子 */}
        <span style={{ fontSize: 64, fontWeight: "bold", color: "#e74c3c", lineHeight: 1 }}>3</span>
        <div style={{ width: 80, height: 5, background: "#333", borderRadius: 3, margin: "8px 0" }} />
        {/* 分母 */}
        <span style={{ fontSize: 64, fontWeight: "bold", color: "#3498db", lineHeight: 1 }}>4</span>
      </div>

      <p style={{
        fontSize: 18, fontWeight: "bold", color: "#2c3e50", textAlign: "center",
        margin: 0,
        fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      }}>
        <span style={{ color: "#3498db" }}>分母</span>はいくつかな？
      </p>

      {/* ヒント */}
      <p style={{ fontSize: 13, color: "#95a5a6", margin: 0, textAlign: "center" }}>
        ヒント：分母は「何等分するか」の数だよ
      </p>
    </div>
  );
};

export const FractionLesson: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const currentLine = getCurrentLine(frame);
  const sceneType = currentLine.sceneType;

  // 右パネル背景色
  const panelBg = sceneType === "problem" ? "#fff5f5"
    : sceneType === "try" ? "#f0fff8"
    : currentLine.appScene === 1 ? "#fffef5" : "#f5fff8";

  // シーンタイトル（説明シーンのみ）
  const titles: Record<number, string> = { 1: "分数って何だろう？", 2: "分母と分子" };

  return (
    <div style={{
      width, height, display: "flex",
      fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
      background: "#1a1a2e",
    }}>

      {/* ── 左側：説明中はスライド表示、試してみよう＋問題は空白 ── */}
      <div style={{ flex: 1, padding: sceneType === "explain" ? 24 : 0 }}>
        {sceneType === "explain" && currentLine.appScene > 0 && (
          <div style={{
            width: "100%", height: "100%",
            borderRadius: 20, overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            border: "3px solid rgba(255,255,255,0.15)",
          }}>
            <iframe
              src={`${staticFile("fraction-app.html")}?scene=${currentLine.appScene}`}
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              title="分数スライド"
            />
          </div>
        )}
      </div>

      {/* ── 右側：キャラクターパネル ── */}
      <div style={{
        width: 480, height: "100%",
        background: panelBg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
        transition: "background 0.5s",
      }}>
        {/* 上部カラーバー */}
        <div style={{
          width: "100%", height: 8,
          background: sceneType === "problem"
            ? "linear-gradient(90deg, #e74c3c, #c0392b)"
            : sceneType === "try"
            ? "linear-gradient(90deg, #27ae60, #2ecc71)"
            : "linear-gradient(90deg, #3498db, #8e44ad)",
        }} />

        {/* シーンラベル */}
        <div style={{ padding: "10px 0 0", textAlign: "center" }}>
          {sceneType === "explain" && titles[currentLine.appScene] && (
            <span style={{ fontSize: 17, fontWeight: "bold", color: "#8e44ad" }}>
              {titles[currentLine.appScene]}
            </span>
          )}
          {sceneType === "try" && (
            <span style={{ fontSize: 17, fontWeight: "bold", color: "#27ae60" }}>
              チャレンジタイム
            </span>
          )}
          {sceneType === "problem" && (
            <span style={{ fontSize: 17, fontWeight: "bold", color: "#e74c3c" }}>
              チェック！
            </span>
          )}
        </div>

        {/* メインコンテンツ（吹き出し or 問題カード） */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          width: "100%", padding: "0 24px 0 36px", gap: 16,
        }}>
          {sceneType === "problem" ? (
            <ProblemCard />
          ) : (
            <>
              {sceneType === "try" && <TryCorner />}
              <SpeechBubble text={currentLine.text} />
            </>
          )}
        </div>

        {/* キャラクター */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Character
            talking={currentLine.talking}
            happy={sceneType === "try" || sceneType === "problem"}
          />
        </div>

        {/* プログレスバー */}
        <div style={{ width: "100%", height: 8, background: "rgba(0,0,0,0.06)" }}>
          <div style={{
            height: "100%",
            width: `${(frame / (FPS * 95)) * 100}%`,
            background: sceneType === "problem"
              ? "linear-gradient(90deg, #e74c3c, #c0392b)"
              : sceneType === "try"
              ? "linear-gradient(90deg, #27ae60, #2ecc71)"
              : "linear-gradient(90deg, #3498db, #8e44ad)",
          }} />
        </div>
      </div>

      {/* 音声 */}
      {SCRIPT.map((line, i) => (
        <Sequence key={i} from={line.startFrame} durationInFrames={line.endFrame - line.startFrame}>
          <Audio src={staticFile(`audio/line_${i}.mp3`)} />
        </Sequence>
      ))}
    </div>
  );
};
