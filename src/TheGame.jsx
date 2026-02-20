import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, setDoc, onSnapshot, updateDoc } from "firebase/firestore";

// ══════════════════════════════════════════════
// GAME LOGIC
// ══════════════════════════════════════════════
const HAND_SIZE  = (n) => (n === 1 ? 8 : n === 2 ? 7 : 6);
const MIN_CARDS  = (n, deckEmpty) => (n === 1 ? 1 : deckEmpty ? 1 : 2);
const COLORS     = ["#e8b86d", "#7ec8e3", "#c084fc", "#4ade80", "#f87171"];
const randCode   = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canPlay(card, pile) {
  return pile.dir === "asc"
    ? card > pile.top || card === pile.top - 10
    : card < pile.top || card === pile.top + 10;
}

function hasAnyMove(hand, piles) {
  return hand.some((c) => piles.some((p) => canPlay(c, p)));
}

function buildGame(playerNames) {
  const n   = playerNames.length;
  const hs  = HAND_SIZE(n);
  let deck  = shuffle(Array.from({ length: 98 }, (_, i) => i + 2));
  const hands = playerNames.map(() => {
    const h = deck.slice(0, hs);
    deck = deck.slice(hs);
    return h;
  });
  return {
    status: "playing",
    players: playerNames,
    hands,
    deck,
    piles: [
      { id: 0, dir: "asc",  top: 1,   history: [] },
      { id: 1, dir: "asc",  top: 1,   history: [] },
      { id: 2, dir: "desc", top: 100, history: [] },
      { id: 3, dir: "desc", top: 100, history: [] },
    ],
    currentPlayer: 0,
    playedThisTurn: 0,
    gameResult: null,
  };
}

async function saveGame(code, data) {
  await setDoc(doc(db, "thegame", code), data);
}
async function updateGame(code, data) {
  await updateDoc(doc(db, "thegame", code), data);
}

// ══════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════
export default function TheGameOnline() {
  const [screen,    setScreen]    = useState("home");   // home | create | join | lobby | playing | result
  const [roomCode,  setRoomCode]  = useState("");
  const [joinCode,  setJoinCode]  = useState("");
  const [myName,    setMyName]    = useState("");
  const [myIndex,   setMyIndex]   = useState(null);     // 自分のプレイヤーインデックス
  const [isHost,    setIsHost]    = useState(false);
  const [gs,        setGs]        = useState(null);     // ゲーム状態（Firestoreからリアルタイム）
  const [prevGs,    setPrevGs]    = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [highlights,setHighlights]= useState([]);
  const [msg,       setMsg]       = useState("");
  const [flash,     setFlash]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [lobbyName, setLobbyName] = useState("");       // ロビーで参加者名入力

  // ── ゲーム状態のリアルタイム購読 ──────────────
  useEffect(() => {
    if (!roomCode || screen === "home" || screen === "create" || screen === "join") return;
    const unsub = onSnapshot(doc(db, "thegame", roomCode), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setGs(data);
      if (data.status === "playing" && screen === "lobby") setScreen("playing");
      if (data.gameResult && screen === "playing") setScreen("result");
    });
    return () => unsub();
  }, [roomCode, screen]);

  // ── ハイライト更新 ────────────────────────────
  useEffect(() => {
    if (selected !== null && gs) {
      const myHand = gs.hands[myIndex] ?? [];
      setHighlights(gs.piles.filter((p) => canPlay(myHand[selected], p)).map((p) => p.id));
    } else {
      setHighlights([]);
    }
  }, [selected, gs, myIndex]);

  const showMsg = (m, type = "bad") => {
    setMsg(m); setFlash(type);
    setTimeout(() => { setMsg(""); setFlash(null); }, 1800);
  };

  const isMyTurn = gs && myIndex !== null && gs.currentPlayer === myIndex;

  // ══════════════════════════════════════════
  // ホスト：ルーム作成
  // ══════════════════════════════════════════
  const createRoom = async () => {
    if (!myName.trim()) { showMsg("名前を入力してね"); return; }
    setLoading(true);
    const code = randCode();
    // ロビー状態で保存（まだゲーム開始しない）
    await setDoc(doc(db, "thegame", code), {
      status: "lobby",
      players: [myName.trim()],
      hands: [],
      deck: [],
      piles: [],
      currentPlayer: 0,
      playedThisTurn: 0,
      gameResult: null,
    });
    setRoomCode(code);
    setMyIndex(0);
    setIsHost(true);
    setLoading(false);
    setScreen("lobby");
  };

  // ══════════════════════════════════════════
  // 参加者：ルーム参加
  // ══════════════════════════════════════════
  const joinRoom = async () => {
    if (!joinCode.trim() || joinCode.trim().length < 4) { showMsg("コードを入力してね"); return; }
    if (!lobbyName.trim()) { showMsg("名前を入力してね"); return; }
    setLoading(true);
    const code = joinCode.trim().toUpperCase();
    const snap = await import("firebase/firestore").then(m => m.getDoc(doc(db, "thegame", code)));
    if (!snap.exists()) { showMsg("ルームが見つからないよ"); setLoading(false); return; }
    const data = snap.data();
    if (data.status !== "lobby") { showMsg("このルームはもう始まってるよ"); setLoading(false); return; }
    const newPlayers = [...data.players, lobbyName.trim()];
    await updateDoc(doc(db, "thegame", code), { players: newPlayers });
    setMyIndex(newPlayers.length - 1);
    setMyName(lobbyName.trim());
    setRoomCode(code);
    setIsHost(false);
    setLoading(false);
    setScreen("lobby");
  };

  // ══════════════════════════════════════════
  // ホスト：ゲーム開始
  // ══════════════════════════════════════════
  const startGame = async () => {
    if (!gs || gs.players.length < 1) return;
    setLoading(true);
    const game = buildGame(gs.players);
    await saveGame(roomCode, game);
    setLoading(false);
  };

  // ══════════════════════════════════════════
  // カードを出す
  // ══════════════════════════════════════════
  const playCard = async (pileId) => {
    if (!isMyTurn || selected === null) return;
    const myHand = gs.hands[myIndex];
    const card   = myHand[selected];
    const pile   = gs.piles.find((p) => p.id === pileId);
    if (!canPlay(card, pile)) { showMsg("そこには置けないよ！"); return; }

    setPrevGs(JSON.parse(JSON.stringify(gs)));

    const newHand  = myHand.filter((_, i) => i !== selected);
    const newHands = gs.hands.map((h, i) => i === myIndex ? newHand : h);
    const newPiles = gs.piles.map((p) =>
      p.id === pileId ? { ...p, top: card, history: [...p.history, p.top] } : p
    );
    const newPlayedThisTurn = gs.playedThisTurn + 1;

    // 勝利チェック
    if (gs.deck.length === 0 && newHands.every((h) => h.length === 0)) {
      await updateGame(roomCode, { hands: newHands, piles: newPiles, playedThisTurn: newPlayedThisTurn, gameResult: "won" });
      return;
    }

    await updateGame(roomCode, { hands: newHands, piles: newPiles, playedThisTurn: newPlayedThisTurn });
    setSelected(null);
    setFlash("good"); setTimeout(() => setFlash(null), 400);
  };

  // ══════════════════════════════════════════
  // 一手戻る
  // ══════════════════════════════════════════
  const undo = async () => {
    if (!prevGs || !isMyTurn) return;
    await saveGame(roomCode, prevGs);
    setPrevGs(null); setSelected(null);
  };

  // ══════════════════════════════════════════
  // ターン終了
  // ══════════════════════════════════════════
  const endTurn = async () => {
    if (!isMyTurn) return;
    const n         = gs.players.length;
    const deckEmpty = gs.deck.length === 0;
    const minCards  = MIN_CARDS(n, deckEmpty);
    if (gs.playedThisTurn < minCards) {
      showMsg(`最低${minCards}枚出してね！（あと${minCards - gs.playedThisTurn}枚）`);
      return;
    }
    const myHand    = gs.hands[myIndex];
    const drawCount = Math.min(gs.playedThisTurn, gs.deck.length);
    const newHand   = [...myHand, ...gs.deck.slice(0, drawCount)];
    const newDeck   = gs.deck.slice(drawCount);
    const newHands  = gs.hands.map((h, i) => i === myIndex ? newHand : h);
    const next      = (myIndex + 1) % n;

    if (!hasAnyMove(newHands[next], gs.piles)) {
      await updateGame(roomCode, { hands: newHands, deck: newDeck, currentPlayer: next, playedThisTurn: 0, gameResult: "lost" });
      return;
    }
    await updateGame(roomCode, { hands: newHands, deck: newDeck, currentPlayer: next, playedThisTurn: 0 });
    setPrevGs(null); setSelected(null);
  };

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  // ─── HOME ─────────────────────────────────
  if (screen === "home") return (
    <Shell>
      <div style={st.setupBox}>
        <div style={st.title}>THE GAME</div>
        <div style={st.sub}>協力カードゲーム — オンライン版</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
          <input style={st.nameInput} placeholder="あなたの名前" value={myName}
            onChange={e => setMyName(e.target.value)} maxLength={12} />
          {msg && <ErrBadge>{msg}</ErrBadge>}
          <button style={st.btn} onClick={() => { if (!myName.trim()) { showMsg("名前を入力してね"); return; } setScreen("create"); }}>
            🎲 ルームを作る
          </button>
          <button style={st.btnSec} onClick={() => setScreen("join")}>
            🚪 ルームに入る
          </button>
        </div>
      </div>
    </Shell>
  );

  // ─── CREATE ───────────────────────────────
  if (screen === "create") return (
    <Shell>
      <div style={st.setupBox}>
        <BackBtn onClick={() => setScreen("home")} />
        <div style={st.title}>THE GAME</div>
        <p style={{ color: "#888", fontSize: "0.85rem", textAlign: "center" }}>
          ルームを作成して友達を招待しよう！
        </p>
        {msg && <ErrBadge>{msg}</ErrBadge>}
        <button style={{ ...st.btn, opacity: loading ? 0.5 : 1 }} onClick={createRoom} disabled={loading}>
          {loading ? "…" : "ルームを作成 →"}
        </button>
      </div>
    </Shell>
  );

  // ─── JOIN ─────────────────────────────────
  if (screen === "join") return (
    <Shell>
      <div style={st.setupBox}>
        <BackBtn onClick={() => setScreen("home")} />
        <div style={st.title}>THE GAME</div>
        <input style={st.nameInput} placeholder="あなたの名前" value={lobbyName}
          onChange={e => setLobbyName(e.target.value)} maxLength={12} />
        <input style={{ ...st.nameInput, letterSpacing: "0.2em", textAlign: "center", fontSize: "1.1rem" }}
          placeholder="ルームコード (XXXX)" value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} />
        {msg && <ErrBadge>{msg}</ErrBadge>}
        <button style={{ ...st.btn, opacity: loading ? 0.5 : 1 }} onClick={joinRoom} disabled={loading}>
          {loading ? "…" : "参加する →"}
        </button>
      </div>
    </Shell>
  );

  // ─── LOBBY ────────────────────────────────
  if (screen === "lobby") return (
    <Shell>
      <div style={st.setupBox}>
        <div style={st.title}>THE GAME</div>
        <div style={{ background: "#ffffff08", border: "1px solid #ffffff15", borderRadius: "12px", padding: "16px", textAlign: "center", width: "100%" }}>
          <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "0.1em", marginBottom: "6px" }}>ルームコード</div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: "2.5rem", color: "#e8b86d", letterSpacing: "0.3em" }}>{roomCode}</div>
          <div style={{ fontSize: "0.72rem", color: "#555", marginTop: "4px" }}>友達に共有してね</div>
        </div>
        <div style={{ width: "100%" }}>
          <div style={{ fontSize: "0.7rem", color: "#666", marginBottom: "8px", letterSpacing: "0.1em" }}>
            参加中 ({gs?.players?.length ?? 0}人)
          </div>
          {gs?.players?.map((name, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 0", borderBottom: "1px solid #ffffff08" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[i % COLORS.length] }} />
              <span style={{ color: "#e8e0d0", fontSize: "0.9rem" }}>{name}</span>
              {i === 0 && <span style={{ fontSize: "0.65rem", color: "#e8b86d", marginLeft: "auto" }}>ホスト</span>}
            </div>
          ))}
        </div>
        {isHost ? (
          <>
            <p style={{ fontSize: "0.75rem", color: "#555", textAlign: "center" }}>全員が入ったらスタート！（1〜5人）</p>
            <button style={st.btn} onClick={startGame} disabled={loading}>
              {loading ? "…" : "ゲームスタート →"}
            </button>
          </>
        ) : (
          <p style={{ color: "#666", fontSize: "0.85rem", textAlign: "center" }}>ホストがスタートするまで待ってね…</p>
        )}
      </div>
    </Shell>
  );

  // ─── RESULT ───────────────────────────────
  if (screen === "result" && gs) {
    const won = gs.gameResult === "won";
    const totalLeft = (gs.deck?.length ?? 0) + (gs.hands?.reduce((s, h) => s + h.length, 0) ?? 0);
    return (
      <Shell>
        <div style={st.resultBox}>
          <div style={st.bigEmoji}>{won ? "🎉" : "💀"}</div>
          <div style={{ ...st.bigTitle, color: won ? "#e8b86d" : "#f87171" }}>
            {won ? "クリア！！" : "ゲームオーバー"}
          </div>
          <div style={st.resultMsg}>
            {won ? "全員で全部出しきった！最高！"
                 : `残り ${totalLeft} 枚... あとちょっとだったかも`}
          </div>
          <button style={st.btn} onClick={() => { setScreen("home"); setGs(null); setPrevGs(null); setRoomCode(""); setMyIndex(null); }}>
            ホームに戻る
          </button>
        </div>
      </Shell>
    );
  }

  // ─── PLAYING ──────────────────────────────
  if (screen === "playing" && gs && myIndex !== null) {
    const myHand     = gs.hands[myIndex] ?? [];
    const cp         = gs.currentPlayer;
    const n          = gs.players.length;
    const deckEmpty  = gs.deck.length === 0;
    const minCards   = MIN_CARDS(n, deckEmpty);
    const totalLeft  = gs.deck.length + gs.hands.reduce((s, h) => s + h.length, 0);

    return (
      <Shell flash={flash}>
        {/* Header */}
        <div style={st.playHeader}>
          <div style={st.title}>THE GAME</div>
          <div style={st.headerRight}>
            <span style={st.badge}>🃏 残り {totalLeft}</span>
            <span style={st.badge}>山 {gs.deck.length}</span>
            <span style={{ ...st.playerBadge, background: COLORS[cp % COLORS.length] + "22", borderColor: COLORS[cp % COLORS.length] }}>
              {gs.players[cp]} のターン
            </span>
          </div>
        </div>

        {/* 自分のターンじゃない時のバナー */}
        {!isMyTurn && (
          <div style={{ background: "#ffffff08", border: "1px solid #ffffff15", borderRadius: "10px", padding: "10px 20px", fontSize: "0.85rem", color: "#888", textAlign: "center", width: "100%", maxWidth: "760px" }}>
            ⏳ {gs.players[cp]} のターンだよ、待ってね…
          </div>
        )}

        {/* Piles */}
        <div style={st.pilesGrid}>
          {gs.piles.map((pile) => {
            const hi  = highlights.includes(pile.id) && isMyTurn;
            const asc = pile.dir === "asc";
            return (
              <div key={pile.id}
                style={{ ...st.pile, borderColor: asc ? "#e8b86d" : "#7ec8e3",
                  ...(hi ? { boxShadow: `0 0 22px ${asc ? "#e8b86d88" : "#7ec8e388"}`, transform: "scale(1.04)", background: "#252e42" } : {}) }}
                className={hi ? "pile-click" : ""}
                onClick={() => hi && playCard(pile.id)}>
                <div style={{ ...st.pileDir, color: asc ? "#e8b86d" : "#7ec8e3" }}>{asc ? "↑ 昇順" : "↓ 降順"}</div>
                <div style={st.pileTop}>{pile.top}</div>
                <div style={st.pileSub}>{asc ? "↓ -10可" : "↑ +10可"}</div>
              </div>
            );
          })}
        </div>

        {/* 他のプレイヤーの手札枚数 */}
        <div style={st.others}>
          {gs.players.map((name, i) => i !== myIndex && (
            <span key={i} style={{ ...st.otherBadge, borderColor: COLORS[i % COLORS.length] }}>
              {name}: {gs.hands[i]?.length ?? 0}枚
            </span>
          ))}
        </div>

        {msg && <div style={st.msg}>{msg}</div>}

        {/* 自分の手札 */}
        <div style={st.handSection}>
          <div style={st.handLabel}>
            手札 {myHand.length}枚
            {isMyTurn && <span style={st.turnBadge}> 　今{gs.playedThisTurn}枚 / 最低{minCards}枚</span>}
          </div>
          <div style={st.handRow}>
            {myHand.map((card, idx) => {
              const sel      = selected === idx;
              const playable = gs.piles.some((p) => canPlay(card, p));
              return (
                <div key={`${card}-${idx}`}
                  style={{ ...st.card, ...(sel ? st.cardSel : {}), ...(!playable ? st.cardDead : {}), ...(!isMyTurn ? { cursor: "default", filter: "brightness(0.7)" } : {}) }}
                  className={isMyTurn ? "card-h" : ""}
                  onClick={() => isMyTurn && setSelected(selected === idx ? null : idx)}>
                  <span style={st.corner}>{card}</span>
                  <span style={st.center}>{card}</span>
                  <span style={{ ...st.corner, ...st.cornerBR }}>{card}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        {isMyTurn && (
          <div style={st.controls}>
            <button style={{ ...st.btnSec, opacity: prevGs ? 1 : 0.3 }} onClick={undo} disabled={!prevGs}>
              ↩ 一手戻る
            </button>
            <button style={{ ...st.btn, opacity: gs.playedThisTurn >= minCards ? 1 : 0.45 }} onClick={endTurn}>
              ターン終了 →
            </button>
          </div>
        )}

        <div style={st.hint}>
          💡 カードを選んで光った山をクリックで出す。最低{minCards}枚/ターン（山が空なら1枚でOK）
        </div>
      </Shell>
    );
  }

  return <Shell><div style={{ color: "#888" }}>読み込み中…</div></Shell>;
}

// ══════════════════════════════════════════════
// SUB COMPONENTS
// ══════════════════════════════════════════════
function Shell({ children, flash }) {
  return (
    <div style={{ ...st.root }} className={flash === "good" ? "flash-good" : flash === "bad" ? "flash-bad" : ""}>
      <style>{css}</style>
      {children}
    </div>
  );
}
function BackBtn({ onClick }) {
  return <button style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#666", fontSize: "0.83rem", cursor: "pointer", padding: "0", marginBottom: "-8px" }} onClick={onClick}>← 戻る</button>;
}
function ErrBadge({ children }) {
  return <div style={{ background: "#ff6b6b22", border: "1px solid #ff6b6b55", borderRadius: "8px", padding: "8px 14px", color: "#ff9999", fontSize: "0.82rem", textAlign: "center" }}>{children}</div>;
}

// ══════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  input{font-family:'Lato',sans-serif;}
  .card-h{transition:transform .15s,box-shadow .15s;cursor:pointer;}
  .card-h:hover{transform:translateY(-14px) scale(1.06);}
  .pile-click{cursor:pointer;animation:pp .9s ease-in-out infinite;}
  @keyframes pp{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
  .flash-good{animation:fg .4s ease;}
  .flash-bad{animation:fb .35s ease;}
  @keyframes fg{0%{box-shadow:inset 0 0 0 0 #4ade8000}50%{box-shadow:inset 0 0 40px 10px #4ade8044}100%{box-shadow:inset 0 0 0 0 #4ade8000}}
  @keyframes fb{0%{box-shadow:inset 0 0 0 0 #f8717100}50%{box-shadow:inset 0 0 40px 10px #f8717144}100%{box-shadow:inset 0 0 0 0 #f8717100}}
  input:focus{outline:none;}
  button:hover:not(:disabled){filter:brightness(1.12);}
  button:active:not(:disabled){transform:scale(0.97);}
`;

const st = {
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#0d1117,#161b27,#0d1117)",display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px",fontFamily:"'Lato',sans-serif",color:"#e8e0d0",gap:"16px"},
  title:{fontFamily:"'Cinzel',serif",fontSize:"2rem",letterSpacing:"0.3em",color:"#e8b86d",textShadow:"0 0 20px #e8b86d66"},
  sub:{color:"#666",letterSpacing:"0.15em",fontSize:"0.75rem",marginTop:"-16px"},
  setupBox:{background:"linear-gradient(145deg,#1e2535,#151c2e)",border:"1px solid #ffffff15",borderRadius:"24px",padding:"36px 40px",display:"flex",flexDirection:"column",alignItems:"center",gap:"18px",maxWidth:"380px",width:"100%",marginTop:"20px"},
  nameInput:{width:"100%",background:"#ffffff0a",border:"1px solid #ffffff20",borderRadius:"8px",padding:"10px 14px",color:"#e8e0d0",fontSize:"0.95rem"},
  btn:{background:"linear-gradient(135deg,#e8b86d,#c9973a)",border:"none",borderRadius:"12px",padding:"12px 30px",color:"#1a1a2e",fontFamily:"'Cinzel',serif",fontWeight:"700",fontSize:"0.92rem",letterSpacing:"0.08em",cursor:"pointer",boxShadow:"0 4px 15px #e8b86d44",transition:"all .15s",width:"100%"},
  btnSec:{background:"#ffffff10",border:"1px solid #ffffff20",borderRadius:"12px",padding:"12px 30px",color:"#aaa",fontFamily:"'Lato',sans-serif",fontWeight:"700",fontSize:"0.88rem",cursor:"pointer",transition:"all .15s",width:"100%"},
  resultBox:{background:"linear-gradient(145deg,#1e2535,#151c2e)",border:"1px solid #ffffff15",borderRadius:"24px",padding:"48px 40px",display:"flex",flexDirection:"column",alignItems:"center",gap:"14px",maxWidth:"380px",width:"100%",marginTop:"20px",textAlign:"center"},
  bigEmoji:{fontSize:"4rem"},
  bigTitle:{fontFamily:"'Cinzel',serif",fontSize:"2.2rem"},
  resultMsg:{fontSize:"1rem",color:"#aaa"},
  playHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",maxWidth:"760px"},
  headerRight:{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap",justifyContent:"flex-end"},
  badge:{background:"#ffffff10",border:"1px solid #ffffff20",borderRadius:"20px",padding:"4px 12px",fontSize:"0.77rem",color:"#aaa"},
  playerBadge:{border:"1.5px solid",borderRadius:"20px",padding:"4px 14px",fontSize:"0.82rem",fontWeight:"700"},
  pilesGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",width:"100%",maxWidth:"760px"},
  pile:{background:"linear-gradient(145deg,#1e2535,#151c2e)",border:"2px solid",borderRadius:"14px",padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:"6px",minHeight:"130px",justifyContent:"center",transition:"all .2s"},
  pileDir:{fontSize:"0.7rem",fontWeight:"700",letterSpacing:"0.1em"},
  pileTop:{fontFamily:"'Cinzel',serif",fontSize:"2.6rem",fontWeight:"700",lineHeight:1,color:"#fff",textShadow:"0 2px 10px #0008"},
  pileSub:{fontSize:"0.6rem",color:"#555"},
  others:{display:"flex",gap:"8px",flexWrap:"wrap"},
  otherBadge:{border:"1px solid",borderRadius:"16px",padding:"2px 12px",fontSize:"0.75rem",color:"#aaa"},
  msg:{background:"#ff6b6b22",border:"1px solid #ff6b6b55",borderRadius:"10px",padding:"8px 20px",color:"#ff9999",fontSize:"0.88rem"},
  handSection:{width:"100%",maxWidth:"760px"},
  handLabel:{fontSize:"0.73rem",color:"#888",marginBottom:"10px",letterSpacing:"0.08em",textTransform:"uppercase"},
  turnBadge:{color:"#e8b86d",fontWeight:"700"},
  handRow:{display:"flex",gap:"7px",flexWrap:"wrap"},
  card:{width:"68px",height:"98px",background:"linear-gradient(145deg,#f5f0e8,#e8e0d0)",borderRadius:"9px",color:"#1a1a2e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",boxShadow:"0 4px 12px #0008",userSelect:"none"},
  cardSel:{transform:"translateY(-16px) scale(1.08)",boxShadow:"0 16px 32px #000a, 0 0 0 3px #e8b86d",background:"linear-gradient(145deg,#fff9ee,#f5ecda)"},
  cardDead:{filter:"brightness(0.5) saturate(0.3)"},
  corner:{position:"absolute",top:"5px",left:"6px",fontSize:"0.7rem",fontWeight:"bold",fontFamily:"'Cinzel',serif"},
  cornerBR:{top:"auto",left:"auto",bottom:"5px",right:"6px",transform:"rotate(180deg)"},
  center:{fontFamily:"'Cinzel',serif",fontSize:"1.35rem",fontWeight:"700"},
  controls:{display:"flex",gap:"12px",flexWrap:"wrap",justifyContent:"center"},
  hint:{maxWidth:"760px",width:"100%",background:"#ffffff08",border:"1px solid #ffffff10",borderRadius:"10px",padding:"10px 16px",fontSize:"0.75rem",color:"#666",lineHeight:1.7,textAlign:"center"},
};
