import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot } from "firebase/firestore";

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════
const randCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

async function loadRoom(code) {
  try {
    const snap = await getDoc(doc(db, "rooms", code));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function saveRoom(code, data) {
  try {
    await setDoc(doc(db, "rooms", code), data);
    return true;
  } catch { return false; }
}

// ══════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════
export default function App() {
  // ── shared state ───────────────────────────
  const [screen,   setScreen]   = useState("home");
  const [err,      setErr]      = useState("");
  const [loading,  setLoading]  = useState(false);

  // ── multi-device ───────────────────────────
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [topic,    setTopic]    = useState("");
  const [name,     setName]     = useState("");
  const [answer,   setAnswer]   = useState("");
  const [room,     setRoom]     = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [entries,  setEntries]  = useState([]);
  const [showNames, setShowNames] = useState(false);

  // ── pass mode ──────────────────────────────
  const [passTopic,     setPassTopic]     = useState("");
  const [passPlayers,   setPassPlayers]   = useState([""]);
  const [passEntries,   setPassEntries]   = useState([]);
  const [passCurrent,   setPassCurrent]   = useState(0);
  const [passName,      setPassName]      = useState("");
  const [passAnswer,    setPassAnswer]    = useState("");
  const [passRevealed,  setPassRevealed]  = useState(false);
  const [passShowNames, setPassShowNames] = useState(false);

  const showErr = (msg) => { setErr(msg); setTimeout(() => setErr(""), 3000); };

  // ── Firestoreリアルタイム購読（待機中・ホスト画面）──
  useEffect(() => {
    if (!["waiting", "hostReveal"].includes(screen) || !roomCode) return;
    const unsub = onSnapshot(doc(db, "rooms", roomCode), (snap) => {
      if (!snap.exists()) return;
      const r = snap.data();
      setRoom(r);
      if (r.revealed) {
        setEntries(r.entries);
        setRevealed(true);
        if (screen === "waiting") setScreen("reveal");
      }
    });
    return () => unsub();
  }, [screen, roomCode]);

  // ══════════════════════════════════════════
  // MULTI-DEVICE HANDLERS
  // ══════════════════════════════════════════
  const createRoom = async () => {
    if (!topic.trim()) { showErr("お題を入力してね"); return; }
    setLoading(true);
    const code = randCode();
    const data = { topic: topic.trim(), entries: [], revealed: false };
    const ok   = await saveRoom(code, data);
    setLoading(false);
    if (!ok) { showErr("保存に失敗したよ…"); return; }
    setRoomCode(code); setRoom(data); setScreen("hostReveal");
  };

  const joinRoom = async () => {
    if (joinCode.trim().length < 4) { showErr("コードを入力してね"); return; }
    setLoading(true);
    const r = await loadRoom(joinCode.trim().toUpperCase());
    setLoading(false);
    if (!r)         { showErr("ルームが見つからないよ"); return; }
    if (r.revealed) { showErr("このルームはもう開示済み"); return; }
    setRoomCode(joinCode.trim().toUpperCase()); setRoom(r); setScreen("submit");
  };

  const submitAnswer = async () => {
    if (!answer.trim()) { showErr("回答を入力してね"); return; }
    if (!name.trim())   { showErr("名前を入力してね"); return; }
    setLoading(true);
    try {
      // arrayUnion で同時送信でも安全に追加できる
      await updateDoc(doc(db, "rooms", roomCode), {
        entries: arrayUnion({ id: Date.now(), name: name.trim(), answer: answer.trim() })
      });
      setName(""); setAnswer(""); setScreen("waiting");
    } catch {
      showErr("送信に失敗したよ…");
    }
    setLoading(false);
  };

  const doReveal = async () => {
    setLoading(true);
    const r = await loadRoom(roomCode);
    const updated = { ...r, revealed: true };
    await saveRoom(roomCode, updated);
    setEntries(updated.entries); setRevealed(true); setRoom(updated);
    setLoading(false);
  };

  const refreshCount = async () => {
    const r = await loadRoom(roomCode);
    if (r) setRoom(r);
  };

  // ══════════════════════════════════════════
  // PASS MODE HANDLERS
  // ══════════════════════════════════════════
  const startPass = () => {
    const valid = passPlayers.filter(p => p.trim());
    if (!passTopic.trim()) { showErr("お題を入力してね"); return; }
    if (valid.length < 2)  { showErr("2人以上の名前を入力してね"); return; }
    setPassEntries([]);
    setPassCurrent(0);
    setPassName(valid[0]);
    setPassAnswer("");
    setPassRevealed(false);
    setPassShowNames(false);
    setScreen("passInput");
  };

  const submitPassAnswer = () => {
    const valid = passPlayers.filter(p => p.trim());
    if (!passAnswer.trim()) { showErr("回答を入力してね"); return; }
    const newEntries = [...passEntries, { name: passName, answer: passAnswer.trim() }];
    setPassEntries(newEntries);
    setPassAnswer("");
    const next = passCurrent + 1;
    if (next >= valid.length) {
      setScreen("passReady");
    } else {
      setPassCurrent(next);
      setPassName(valid[next]);
      setScreen("passHandoff");
    }
  };

  const updatePlayer = (i, val) => {
    const arr = [...passPlayers]; arr[i] = val; setPassPlayers(arr);
  };
  const addPlayer    = () => setPassPlayers(p => [...p, ""]);
  const removePlayer = (i) => setPassPlayers(p => p.filter((_, idx) => idx !== i));
  const validPlayers = passPlayers.filter(p => p.trim());

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════
  return (
    <div style={s.root}>
      <style>{css}</style>

      {/* ─── HOME ────────────────────────────── */}
      {screen === "home" && (
        <Card>
          <Logo />
          <p style={s.sub}>匿名で答えを集めて、いっせいに公開しよう</p>
          <div style={s.modeRow}>
            <ModeCard emoji="📱" title="このスマホで完結" desc="1台を順番に回して入力"
              onClick={() => setScreen("passSetup")} accent="#4a90d9" />
            <ModeCard emoji="🌐" title="各自のスマホから" desc="ルームコードで参加"
              onClick={() => setScreen("multiMenu")} accent="#7c4dca" />
          </div>
        </Card>
      )}

      {/* ─── MULTI MENU ──────────────────────── */}
      {screen === "multiMenu" && (
        <Card>
          <BackBtn onClick={() => setScreen("home")} />
          <Logo small />
          <BigBtn accent="#7c4dca" onClick={() => setScreen("create")}>🎲 ルームを作る（ホスト）</BigBtn>
          <BigBtn ghost onClick={() => setScreen("join")}>🚪 ルームに入る（参加者）</BigBtn>
        </Card>
      )}

      {/* ─── CREATE ──────────────────────────── */}
      {screen === "create" && (
        <Card>
          <BackBtn onClick={() => setScreen("multiMenu")} />
          <h2 style={s.h2}>お題を設定しよう</h2>
          <textarea style={s.textarea} placeholder="例：このチームに一番必要なことは？"
            value={topic} onChange={e => setTopic(e.target.value)} rows={3} />
          {err && <ErrMsg>{err}</ErrMsg>}
          <BigBtn onClick={createRoom} loading={loading} accent="#7c4dca">ルームを作成 →</BigBtn>
        </Card>
      )}

      {/* ─── JOIN ────────────────────────────── */}
      {screen === "join" && (
        <Card>
          <BackBtn onClick={() => setScreen("multiMenu")} />
          <h2 style={s.h2}>ルームコードを入力</h2>
          <input style={s.input} placeholder="XXXX" value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} />
          {err && <ErrMsg>{err}</ErrMsg>}
          <BigBtn onClick={joinRoom} loading={loading} accent="#7c4dca">参加する →</BigBtn>
        </Card>
      )}

      {/* ─── SUBMIT ──────────────────────────── */}
      {screen === "submit" && room && (
        <Card>
          <div style={s.codeChip}>📍 {roomCode}</div>
          <TopicBox topic={room.topic} />
          <div style={s.fieldGroup}>
            <label style={s.label}>あなたの回答</label>
            <textarea style={s.textarea} placeholder="ここに入力..." value={answer}
              onChange={e => setAnswer(e.target.value)} rows={4} />
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>あなたの名前（開示まで非表示）</label>
            <input style={s.input} placeholder="名前を入力..." value={name}
              onChange={e => setName(e.target.value)} maxLength={20} />
          </div>
          {err && <ErrMsg>{err}</ErrMsg>}
          <BigBtn onClick={submitAnswer} loading={loading} accent="#7c4dca">🙈 匿名で送信する</BigBtn>
        </Card>
      )}

      {/* ─── WAITING ─────────────────────────── */}
      {screen === "waiting" && (
        <Card>
          <div style={s.codeChip}>📍 {roomCode}</div>
          <div style={s.bigEmoji}>⏳</div>
          <h2 style={s.h2}>送信したよ！</h2>
          <p style={s.subMsg}>ホストが開示するまで待ってね。<br />開示されたら自動で表示されるよ✨</p>
          <Dots />
        </Card>
      )}

      {/* ─── HOST DASHBOARD ──────────────────── */}
      {screen === "hostReveal" && room && !revealed && (
        <Card wide>
          <div style={s.codeBlock}>
            <span style={s.codeBlockLabel}>ルームコード</span>
            <span style={s.codeBlockVal}>{roomCode}</span>
            <span style={s.codeBlockSub}>参加者に共有してね</span>
          </div>
          <TopicBox topic={room.topic} />
          <div style={s.countRow}>
            <span style={s.countNum}>{room.entries.length}</span>
            <span style={s.countLabel}>件 届いてます</span>
            <button style={s.refreshBtn} onClick={refreshCount}>🔄</button>
          </div>
          {err && <ErrMsg>{err}</ErrMsg>}
          <BigBtn onClick={doReveal} loading={loading} disabled={room.entries.length === 0} accent="#7c4dca">
            🎉 全員に開示する
          </BigBtn>
        </Card>
      )}

      {/* ─── REVEAL (multi) ──────────────────── */}
      {(screen === "reveal" || (screen === "hostReveal" && revealed)) && (
        <RevealScreen topic={room?.topic} entries={entries}
          showNames={showNames} setShowNames={setShowNames}
          onHome={() => { setScreen("home"); setRevealed(false); setRoom(null); setEntries([]); setTopic(""); }} />
      )}

      {/* ═══════ PASS MODE ═══════ */}

      {/* ─── PASS SETUP ──────────────────────── */}
      {screen === "passSetup" && (
        <Card wide>
          <BackBtn onClick={() => setScreen("home")} />
          <h2 style={s.h2}>📱 パス回しモード</h2>
          <div style={s.fieldGroup}>
            <label style={s.label}>お題</label>
            <textarea style={s.textarea} placeholder="例：正直に言うと、最近サボってることは？"
              value={passTopic} onChange={e => setPassTopic(e.target.value)} rows={3} />
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>参加者の名前（順番に回します）</label>
            <div style={s.playerList}>
              {passPlayers.map((p, i) => (
                <div key={i} style={s.playerRow}>
                  <div style={{ ...s.playerNum, background: PLAYER_COLORS[i % PLAYER_COLORS.length] + "33", color: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>
                    {i + 1}
                  </div>
                  <input style={{ ...s.input, flex: 1 }} placeholder={`プレイヤー${i + 1}`}
                    value={p} onChange={e => updatePlayer(i, e.target.value)} maxLength={15} />
                  {passPlayers.length > 2 && (
                    <button style={s.removeBtn} onClick={() => removePlayer(i)}>×</button>
                  )}
                </div>
              ))}
              {passPlayers.length < 10 && (
                <button style={s.addBtn} onClick={addPlayer}>＋ 追加する</button>
              )}
            </div>
          </div>
          {err && <ErrMsg>{err}</ErrMsg>}
          <BigBtn onClick={startPass} accent="#4a90d9">スタート →</BigBtn>
        </Card>
      )}

      {/* ─── PASS HANDOFF ────────────────────── */}
      {screen === "passHandoff" && (
        <Card>
          <div style={s.bigEmoji}>📱</div>
          <div style={{ ...s.passNameTag, background: PLAYER_COLORS[passCurrent % PLAYER_COLORS.length] + "22", color: PLAYER_COLORS[passCurrent % PLAYER_COLORS.length] }}>
            {passName}
          </div>
          <h2 style={s.h2}>に渡してね！</h2>
          <p style={s.subMsg}>前の人の回答は見えないよ🙈<br />準備ができたらボタンを押して</p>
          <BigBtn accent="#4a90d9" onClick={() => setScreen("passInput")}>準備OK、入力する →</BigBtn>
        </Card>
      )}

      {/* ─── PASS INPUT ──────────────────────── */}
      {screen === "passInput" && (
        <Card>
          <div style={s.passProgress}>
            {validPlayers.map((_, i) => (
              <div key={i} style={{ ...s.progressDot, background: i < passEntries.length ? PLAYER_COLORS[i % PLAYER_COLORS.length] : i === passCurrent ? "#1a1a2e" : "#e0d8c8" }} />
            ))}
          </div>
          <TopicBox topic={passTopic} />
          <div style={s.fieldGroup}>
            <label style={s.label}>
              <span style={{ color: PLAYER_COLORS[passCurrent % PLAYER_COLORS.length], fontWeight: "700" }}>{passName}</span> の回答
            </label>
            <textarea style={s.textarea} placeholder="ここに入力..."
              value={passAnswer} onChange={e => setPassAnswer(e.target.value)} rows={5} />
          </div>
          {err && <ErrMsg>{err}</ErrMsg>}
          <BigBtn accent="#4a90d9" onClick={submitPassAnswer}>🙈 送信して次の人へ</BigBtn>
        </Card>
      )}

      {/* ─── PASS READY ──────────────────────── */}
      {screen === "passReady" && (
        <Card>
          <div style={s.bigEmoji}>🎁</div>
          <h2 style={s.h2}>全員の回答が揃ったよ！</h2>
          <p style={s.subMsg}>みんなで画面を囲んでから<br />「開示する」を押してね✨</p>
          <BigBtn accent="#4a90d9" onClick={() => { setPassRevealed(true); setScreen("passReveal"); }}>
            🎉 いっせいに開示する！
          </BigBtn>
        </Card>
      )}

      {/* ─── PASS REVEAL ─────────────────────── */}
      {screen === "passReveal" && (
        <RevealScreen topic={passTopic} entries={passEntries}
          showNames={passShowNames} setShowNames={setPassShowNames}
          onHome={() => { setScreen("home"); setPassTopic(""); setPassPlayers([""]); setPassEntries([]); setPassCurrent(0); setPassRevealed(false); }} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function RevealScreen({ topic, entries, showNames, setShowNames, onHome }) {
  const [order] = useState(() => shuffled(entries));
  return (
    <Card wide>
      <div style={s.revealBadge}>🎉 REVEAL</div>
      <TopicBox topic={topic} />
      <div style={s.toggleRow}>
        <button style={{ ...s.toggleBtn, ...(showNames ? s.toggleActive : {}) }}
          onClick={() => setShowNames(v => !v)}>
          {showNames ? "👤 名前を隠す" : "👁 名前を表示する"}
        </button>
        <span style={s.countMini}>{order.length}件</span>
      </div>
      <div style={s.entryList}>
        {order.map((e, i) => (
          <div key={i} style={{ ...s.entryCard, animationDelay: `${i * 0.07}s` }} className="entry-in">
            <div style={s.entryNum}>#{i + 1}</div>
            <div style={s.entryAnswer}>{e.answer}</div>
            <div style={{ ...s.entryName, opacity: showNames ? 1 : 0, filter: showNames ? "none" : "blur(8px)" }}>
              — {e.name}
            </div>
          </div>
        ))}
      </div>
      <BigBtn ghost onClick={onHome}>🏠 ホームに戻る</BigBtn>
    </Card>
  );
}

function Logo({ small }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: small ? "1.4rem" : "2rem", fontFamily: "'Playfair Display', serif", color: "#1a1a2e", letterSpacing: "0.03em", lineHeight: 1.3 }}>
        ひみつの<br />ひとこと
      </div>
    </div>
  );
}
function Card({ children, wide }) {
  return <div style={{ ...s.card, ...(wide ? { maxWidth: "580px" } : {}) }}>{children}</div>;
}
function BigBtn({ children, onClick, ghost, loading, disabled, accent = "#1a1a2e" }) {
  return (
    <button style={{ ...s.bigBtn, ...(ghost ? s.bigBtnGhost : { background: accent, borderColor: accent }), opacity: loading || disabled ? 0.45 : 1 }}
      onClick={loading || disabled ? undefined : onClick}>
      {loading ? "…" : children}
    </button>
  );
}
function BackBtn({ onClick }) {
  return <button style={s.backBtn} onClick={onClick}>← 戻る</button>;
}
function ErrMsg({ children }) {
  return <div style={s.errMsg}>{children}</div>;
}
function TopicBox({ topic }) {
  return (
    <div style={s.topicBox}>
      <div style={s.topicLabel}>お題</div>
      <div style={s.topicText}>{topic}</div>
    </div>
  );
}
function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: "7px" }}>
      <span className="dot" /><span className="dot" /><span className="dot" />
    </div>
  );
}
function ModeCard({ emoji, title, desc, onClick, accent }) {
  return (
    <div style={{ ...s.modeCard, borderColor: accent + "44" }} onClick={onClick} className="mode-hover">
      <div style={{ fontSize: "2rem" }}>{emoji}</div>
      <div style={{ fontWeight: "700", color: "#1a1a2e", fontSize: "0.95rem", marginTop: "4px" }}>{title}</div>
      <div style={{ fontSize: "0.78rem", color: "#aaa", marginTop: "2px", lineHeight: 1.5 }}>{desc}</div>
      <div style={{ ...s.modeArrow, background: accent }}> →</div>
    </div>
  );
}

const PLAYER_COLORS = ["#4a90d9", "#e05c5c", "#5cb85c", "#f0a030", "#9b59b6", "#1abc9c", "#e67e22", "#e91e63"];

// ══════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Noto+Sans+JP:wght@300;400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  textarea, input, button { font-family: 'Noto Sans JP', sans-serif; }
  input:focus, textarea:focus { outline: none; border-color: #aaa !important; }
  .dot { display:inline-block;width:8px;height:8px;border-radius:50%;background:#c4a882;animation:blink 1.4s ease-in-out infinite; }
  .dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
  .entry-in { animation: slideUp .4s ease both; }
  @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
  .mode-hover { cursor:pointer; transition: transform .15s, box-shadow .15s; }
  .mode-hover:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.10); }
  button:hover:not(:disabled) { filter: brightness(1.08); }
  button:active:not(:disabled) { transform: scale(0.97); }
`;

const s = {
  root: { minHeight: "100vh", background: "linear-gradient(135deg,#faf6ef,#f0e8d8)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 14px", fontFamily: "'Noto Sans JP', sans-serif" },
  card: { background: "#fff", borderRadius: "20px", padding: "32px 28px", width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 4px 40px rgba(0,0,0,0.08)" },
  sub: { textAlign: "center", color: "#aaa", fontSize: "0.83rem", lineHeight: 1.7, marginTop: "-6px" },
  subMsg: { textAlign: "center", color: "#999", fontSize: "0.85rem", lineHeight: 1.8 },
  h2: { fontSize: "1.1rem", fontWeight: "700", color: "#1a1a2e" },
  label: { display: "block", fontSize: "0.75rem", fontWeight: "700", color: "#aaa", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" },
  fieldGroup: { display: "flex", flexDirection: "column" },
  input: { width: "100%", padding: "11px 14px", border: "1.5px solid #ece4d4", borderRadius: "10px", fontSize: "0.95rem", color: "#1a1a2e", background: "#faf8f5", transition: "border-color .15s" },
  textarea: { width: "100%", padding: "11px 14px", border: "1.5px solid #ece4d4", borderRadius: "10px", fontSize: "0.92rem", color: "#1a1a2e", background: "#faf8f5", resize: "vertical", lineHeight: 1.7, transition: "border-color .15s" },
  bigBtn: { width: "100%", padding: "13px", background: "#1a1a2e", color: "#fff", border: "2px solid #1a1a2e", borderRadius: "12px", fontSize: "0.92rem", fontWeight: "700", cursor: "pointer", letterSpacing: "0.04em", transition: "all .15s" },
  bigBtnGhost: { background: "transparent", color: "#1a1a2e", border: "1.5px solid #d8d0c0" },
  backBtn: { alignSelf: "flex-start", background: "none", border: "none", color: "#bbb", fontSize: "0.83rem", cursor: "pointer", padding: "0", marginBottom: "-4px" },
  errMsg: { background: "#fff0f0", border: "1px solid #f0c0c0", borderRadius: "8px", padding: "8px 14px", fontSize: "0.8rem", color: "#c04040", textAlign: "center" },
  codeChip: { background: "#f5f0e8", borderRadius: "8px", padding: "5px 12px", fontSize: "0.78rem", color: "#aaa", alignSelf: "flex-start" },
  codeBlock: { background: "#faf6ef", border: "1.5px solid #ece0c8", borderRadius: "14px", padding: "16px", textAlign: "center", display: "flex", flexDirection: "column", gap: "4px" },
  codeBlockLabel: { fontSize: "0.7rem", color: "#bbb", letterSpacing: "0.1em", textTransform: "uppercase" },
  codeBlockVal: { fontFamily: "'Playfair Display', serif", fontSize: "2.4rem", color: "#1a1a2e", letterSpacing: "0.25em" },
  codeBlockSub: { fontSize: "0.75rem", color: "#c8b89a" },
  topicBox: { background: "#faf6ef", border: "1px solid #ece4d4", borderRadius: "12px", padding: "12px 16px" },
  topicLabel: { fontSize: "0.66rem", color: "#c8b89a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "3px", fontWeight: "700" },
  topicText: { fontSize: "1rem", color: "#1a1a2e", fontWeight: "700", lineHeight: 1.5 },
  bigEmoji: { fontSize: "3.5rem", textAlign: "center" },
  countRow: { display: "flex", alignItems: "center", gap: "8px" },
  countNum: { fontFamily: "'Playfair Display', serif", fontSize: "2.8rem", color: "#1a1a2e", lineHeight: 1 },
  countLabel: { fontSize: "0.85rem", color: "#aaa" },
  refreshBtn: { marginLeft: "auto", background: "#f5f0e8", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", fontSize: "1rem" },
  modeRow: { display: "flex", gap: "10px" },
  modeCard: { flex: 1, background: "#faf8f5", border: "1.5px solid", borderRadius: "14px", padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "2px", position: "relative", overflow: "hidden" },
  modeArrow: { marginTop: "10px", color: "#fff", borderRadius: "8px", padding: "4px 12px", fontSize: "0.82rem", fontWeight: "700" },
  playerList: { display: "flex", flexDirection: "column", gap: "8px" },
  playerRow: { display: "flex", alignItems: "center", gap: "8px" },
  playerNum: { width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.85rem", flexShrink: 0 },
  removeBtn: { background: "none", border: "none", color: "#ddd", fontSize: "1.1rem", cursor: "pointer", padding: "0 4px", flexShrink: 0 },
  addBtn: { background: "#f5f0e8", border: "1.5px dashed #d8d0c0", borderRadius: "10px", padding: "9px", color: "#bbb", fontSize: "0.85rem", cursor: "pointer", letterSpacing: "0.04em" },
  passProgress: { display: "flex", justifyContent: "center", gap: "6px" },
  progressDot: { width: "10px", height: "10px", borderRadius: "50%", transition: "background .3s" },
  passNameTag: { textAlign: "center", padding: "8px 20px", borderRadius: "30px", fontWeight: "700", fontSize: "1.3rem", alignSelf: "center" },
  revealBadge: { background: "#1a1a2e", color: "#fff", borderRadius: "8px", padding: "5px 14px", fontSize: "0.75rem", fontWeight: "700", letterSpacing: "0.15em", alignSelf: "flex-start" },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  toggleBtn: { padding: "7px 14px", border: "1.5px solid #e8dcc8", borderRadius: "20px", background: "#fff", color: "#aaa", fontSize: "0.8rem", cursor: "pointer", transition: "all .2s" },
  toggleActive: { background: "#1a1a2e", borderColor: "#1a1a2e", color: "#fff" },
  countMini: { fontSize: "0.75rem", color: "#c0b09a" },
  entryList: { display: "flex", flexDirection: "column", gap: "10px" },
  entryCard: { background: "#faf8f5", border: "1px solid #ece4d4", borderRadius: "14px", padding: "14px 18px", animation: "slideUp .4s ease both" },
  entryNum: { fontSize: "0.66rem", color: "#c4a882", fontWeight: "700", letterSpacing: "0.1em", marginBottom: "5px" },
  entryAnswer: { fontSize: "0.98rem", color: "#1a1a2e", lineHeight: 1.65, whiteSpace: "pre-wrap" },
  entryName: { marginTop: "8px", fontSize: "0.8rem", color: "#b0a090", fontStyle: "italic", transition: "opacity .3s, filter .3s" },
};
