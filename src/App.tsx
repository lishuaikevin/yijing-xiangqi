import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Clock3,
  Flag,
  FlipVertical2,
  Palette,
  RotateCcw,
  Settings2,
  Sparkles,
  Swords,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import {
  applyMove,
  chooseAIMove,
  createInitialBoard,
  findKing,
  getLegalMoves,
  hasAnyLegalMove,
  isInCheck,
  moveNotation,
  otherSide,
  PIECE_TEXT,
  PIECE_VALUE,
  type Board,
  type ChessMove,
  type Difficulty,
  type Piece,
  type Position,
  type Side,
} from './game'

type GameMode = 'ai' | 'local'
type GamePhase = 'playing' | 'check' | 'finished'
type ThemeId = 'night' | 'celadon' | 'ink' | 'cyber'

interface HistoryEntry {
  board: Board
  turn: Side
  move: ChessMove
  notation: string
  captured: Piece | null
}

const sideName: Record<Side, string> = { red: '红方', black: '黑方' }
const difficultyName: Record<Difficulty, string> = { easy: '入门', normal: '棋手', hard: '大师' }
const themeOptions: Array<{ id: ThemeId; name: string; description: string; browserColor: string }> = [
  { id: 'night', name: '夜阑木韵', description: '温润原木', browserColor: '#0b0d0f' },
  { id: 'celadon', name: '青瓷云岚', description: '雨过天青', browserColor: '#10211f' },
  { id: 'ink', name: '水墨长卷', description: '宣纸墨意', browserColor: '#d8c7a3' },
  { id: 'cyber', name: '霓虹残局', description: '未来棋局', browserColor: '#030711' },
]
const positionKey = (position: Position) => `${position.row}-${position.col}`
const samePosition = (a: Position, b: Position) => a.row === b.row && a.col === b.col
// 棋盘线位于 SVG 的 x=50…850、y=50…950，使用同一套精确坐标避免标记产生像素偏移。
const boardPositionStyle = (row: number, col: number) => ({
  left: `${(50 + col * 100) / 9}%`,
  top: `${5 + row * 10}%`,
})

let audioContext: AudioContext | null = null
function playGameSound(kind: 'select' | 'move' | 'capture' | 'check' | 'win', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return
  try {
    audioContext ??= new AudioContext()
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    const frequency = { select: 310, move: 220, capture: 145, check: 430, win: 520 }[kind]
    oscillator.type = kind === 'capture' ? 'triangle' : 'sine'
    oscillator.frequency.setValueAtTime(frequency, now)
    if (kind === 'win') oscillator.frequency.exponentialRampToValueAtTime(780, now + 0.24)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.35 : 0.12))
    oscillator.start(now)
    oscillator.stop(now + (kind === 'win' ? 0.36 : 0.13))
  } catch {
    // 浏览器不支持音频时安静降级。
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function BoardArtwork() {
  const markers = [
    [150, 250], [750, 250], [150, 750], [750, 750],
    [50, 350], [250, 350], [450, 350], [650, 350], [850, 350],
    [50, 650], [250, 650], [450, 650], [650, 650], [850, 650],
  ]
  return (
    <svg className="board-art" viewBox="0 0 900 1000" aria-hidden="true">
      <defs>
        <filter id="ink-soft"><feGaussianBlur stdDeviation="0.35" /></filter>
      </defs>
      <g className="board-lines">
        {Array.from({ length: 10 }, (_, index) => (
          <line key={`h-${index}`} x1="50" y1={50 + index * 100} x2="850" y2={50 + index * 100} />
        ))}
        <line x1="50" y1="50" x2="50" y2="950" />
        <line x1="850" y1="50" x2="850" y2="950" />
        {Array.from({ length: 7 }, (_, index) => {
          const x = 150 + index * 100
          return <path key={`v-${index}`} d={`M ${x} 50 V 450 M ${x} 550 V 950`} />
        })}
        <path d="M 350 50 L 550 250 M 550 50 L 350 250" />
        <path d="M 350 750 L 550 950 M 550 750 L 350 950" />
      </g>
      <g className="board-markers">
        {markers.map(([x, y], index) => (
          <g key={index} transform={`translate(${x} ${y})`}>
            {x > 50 && <path d="M -11 -25 V -11 H -25 M -11 25 V 11 H -25" />}
            {x < 850 && <path d="M 11 -25 V -11 H 25 M 11 25 V 11 H 25" />}
          </g>
        ))}
      </g>
      <g className="river-words" filter="url(#ink-soft)">
        <text x="245" y="516">楚 河</text>
        <text x="655" y="516">漢 界</text>
      </g>
    </svg>
  )
}

function PlayerCard({
  side,
  active,
  time,
  mode,
  thinking,
  capturedValue,
}: {
  side: Side
  active: boolean
  time: number
  mode: GameMode
  thinking: boolean
  capturedValue: number
}) {
  const isRed = side === 'red'
  return (
    <div className={`player-card ${active ? 'is-active' : ''} ${isRed ? 'is-red' : 'is-black'}`}>
      <div className="player-avatar">
        {side === 'black' && mode === 'ai' ? <Bot size={21} strokeWidth={1.8} /> : PIECE_TEXT[side].king}
        {active && <span className="active-orbit" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <strong>{isRed ? '执炬者' : mode === 'ai' ? '墨衡' : '守夜人'}</strong>
          <span className="side-chip">{sideName[side]}</span>
        </div>
        <p>{thinking ? '正在推演棋局…' : capturedValue > 0 ? `子力 +${capturedValue}` : isRed ? '先手' : mode === 'ai' ? '弈境棋手' : '后手'}</p>
      </div>
      <div className={`player-clock ${time < 60 ? 'is-low' : ''}`}>
        <Clock3 size={14} />
        <span>{formatTime(time)}</span>
      </div>
    </div>
  )
}

function CapturedPieces({ pieces, label }: { pieces: Piece[]; label: string }) {
  return (
    <div className="captured-row">
      <span>{label}</span>
      <div className="captured-list">
        {pieces.length === 0 ? <i>暂无</i> : pieces.map(piece => (
          <b className={piece.side} key={piece.id}>{PIECE_TEXT[piece.side][piece.type]}</b>
        ))}
      </div>
    </div>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  const rules = [
    ['车', '沿直线行走，途中不可越子，是最强的长兵器。'],
    ['马', '走“日”字；若马腿位置有棋子，则该方向不可走。'],
    ['炮', '移动时如车；吃子时必须恰好隔一个棋子作“炮架”。'],
    ['相', '走“田”字，不能过河；田心有子时不可走。'],
    ['将', '只能在九宫内移动；将帅不可在同一直线上无遮挡相对。'],
    ['兵', '过河前只可向前，过河后可向前或横走，不可后退。'],
  ]
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        <div className="eyebrow"><BookOpen size={14} /> 对弈指南</div>
        <h2 id="rules-title">方寸之间，运筹千里</h2>
        <p className="modal-intro">红方先行，以将死或困毙对方将帅为胜。点选己方棋子，棋盘会标出所有符合规则的落点。</p>
        <div className="rule-grid">
          {rules.map(([name, text]) => (
            <article key={name}><b>{name}</b><p>{text}</p></article>
          ))}
        </div>
        <button className="primary-button w-full justify-center" onClick={onClose}>知晓，开始对弈</button>
      </section>
    </div>
  )
}

export default function App() {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [turn, setTurn] = useState<Side>('red')
  const [selected, setSelected] = useState<Position | null>(null)
  const [hovered, setHovered] = useState<Position | null>(null)
  const [legalMoves, setLegalMoves] = useState<Position[]>([])
  const [lastMove, setLastMove] = useState<ChessMove | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [captured, setCaptured] = useState<Piece[]>([])
  const [mode, setMode] = useState<GameMode>('ai')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<GamePhase>('playing')
  const [winner, setWinner] = useState<Side | null>(null)
  const [endReason, setEndReason] = useState('')
  const [soundOn, setSoundOn] = useState(true)
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('yijing-theme') : null
    return themeOptions.some(option => option.id === saved) ? saved as ThemeId : 'night'
  })
  const [flipped, setFlipped] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [times, setTimes] = useState<Record<Side, number>>({ red: 600, black: 600 })
  const historyEndRef = useRef<HTMLDivElement>(null)
  const aiWorkerRef = useRef<Worker | null>(null)

  const redGain = useMemo(() => captured.filter(piece => piece.side === 'black').reduce((sum, piece) => sum + PIECE_VALUE[piece.type], 0), [captured])
  const blackGain = useMemo(() => captured.filter(piece => piece.side === 'red').reduce((sum, piece) => sum + PIECE_VALUE[piece.type], 0), [captured])
  const checkedKing = phase === 'check' ? findKing(board, turn) : null

  const performMove = useCallback((from: Position, to: Position) => {
    const movingPiece = board[from.row]?.[from.col]
    if (!movingPiece) return
    const capturedPiece = board[to.row][to.col]
    const move: ChessMove = { from, to, piece: movingPiece, captured: capturedPiece }
    const nextBoard = applyMove(board, from, to)
    const nextTurn = otherSide(turn)

    setHistory(previous => [...previous, {
      board,
      turn,
      move,
      notation: moveNotation(move),
      captured: capturedPiece,
    }])
    if (capturedPiece) setCaptured(previous => [...previous, capturedPiece])
    setBoard(nextBoard)
    setTurn(nextTurn)
    setLastMove(move)
    setSelected(null)
    setLegalMoves([])

    const enemyKingExists = findKing(nextBoard, nextTurn)
    const checked = enemyKingExists ? isInCheck(nextBoard, nextTurn) : true
    const canContinue = enemyKingExists ? hasAnyLegalMove(nextBoard, nextTurn) : false
    if (!enemyKingExists || !canContinue) {
      setPhase('finished')
      setWinner(turn)
      setEndReason(!enemyKingExists || checked ? '绝杀' : '困毙')
      playGameSound('win', soundOn)
    } else if (checked) {
      setPhase('check')
      setWinner(null)
      setEndReason('')
      playGameSound('check', soundOn)
    } else {
      setPhase('playing')
      setWinner(null)
      setEndReason('')
      playGameSound(capturedPiece ? 'capture' : 'move', soundOn)
    }
  }, [board, soundOn, turn])

  useEffect(() => {
    if (mode !== 'ai' || turn !== 'black' || phase === 'finished') return
    let cancelled = false
    let settled = false
    setAiThinking(true)

    const finishThinking = (move: ChessMove | null) => {
      if (cancelled || settled) return
      settled = true
      aiWorkerRef.current?.terminate()
      aiWorkerRef.current = null
      if (move) performMove(move.from, move.to)
      setAiThinking(false)
    }

    const timer = window.setTimeout(() => {
      try {
        const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
        aiWorkerRef.current = worker
        worker.onmessage = (event: MessageEvent<ChessMove | null>) => finishThinking(event.data)
        worker.onerror = () => {
          worker.terminate()
          aiWorkerRef.current = null
          finishThinking(chooseAIMove(board, 'black', difficulty))
        }
        worker.postMessage({ board, side: 'black', difficulty })
      } catch {
        finishThinking(chooseAIMove(board, 'black', difficulty))
      }
    }, 420)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      aiWorkerRef.current?.terminate()
      aiWorkerRef.current = null
      setAiThinking(false)
    }
  }, [board, difficulty, mode, performMove, phase, turn])

  useEffect(() => {
    if (phase === 'finished') return
    const timer = window.setInterval(() => {
      setTimes(previous => ({ ...previous, [turn]: Math.max(0, previous[turn] - 1) }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase, turn])

  useEffect(() => {
    if (phase === 'finished' || times[turn] > 0) return
    setPhase('finished')
    setWinner(otherSide(turn))
    setEndReason('超时')
    setAiThinking(false)
    playGameSound('win', soundOn)
  }, [phase, soundOn, times, turn])

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [history.length])

  useEffect(() => {
    window.localStorage.setItem('yijing-theme', theme)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const selectedTheme = themeOptions.find(option => option.id === theme)
    if (meta && selectedTheme) meta.content = selectedTheme.browserColor
  }, [theme])

  const startNewGame = useCallback((nextMode: GameMode = mode) => {
    setBoard(createInitialBoard())
    setTurn('red')
    setSelected(null)
    setLegalMoves([])
    setLastMove(null)
    setHistory([])
    setCaptured([])
    setMode(nextMode)
    setPhase('playing')
    setWinner(null)
    setEndReason('')
    setTimes({ red: 600, black: 600 })
    setAiThinking(false)
    setSettingsOpen(false)
  }, [mode])

  const handleSquareClick = (position: Position) => {
    if (phase === 'finished' || aiThinking || (mode === 'ai' && turn === 'black')) return
    const piece = board[position.row][position.col]
    if (selected && legalMoves.some(move => samePosition(move, position))) {
      performMove(selected, position)
      return
    }
    if (piece?.side === turn) {
      setSelected(position)
      setLegalMoves(getLegalMoves(board, position))
      playGameSound('select', soundOn)
    } else {
      setSelected(null)
      setLegalMoves([])
    }
  }

  const undoMove = () => {
    if (!history.length || aiThinking) return
    const steps = mode === 'ai' && turn === 'red' && history.length >= 2 ? 2 : 1
    const restoreEntry = history[history.length - steps]
    const remaining = history.slice(0, history.length - steps)
    setBoard(restoreEntry.board)
    setTurn(restoreEntry.turn)
    setHistory(remaining)
    setCaptured(remaining.map(entry => entry.captured).filter((piece): piece is Piece => Boolean(piece)))
    setLastMove(remaining.at(-1)?.move ?? null)
    setSelected(null)
    setLegalMoves([])
    setWinner(null)
    setEndReason('')
    setPhase(isInCheck(restoreEntry.board, restoreEntry.turn) ? 'check' : 'playing')
  }

  const resign = () => {
    if (phase === 'finished') return
    setPhase('finished')
    setWinner(otherSide(turn))
    setEndReason(`${sideName[turn]}认输`)
    setSelected(null)
    setLegalMoves([])
    playGameSound('win', soundOn)
  }

  const statusTitle = phase === 'finished'
    ? `${sideName[winner ?? 'red']}胜出`
    : aiThinking
      ? '墨衡正在推演'
      : phase === 'check'
        ? `${sideName[turn]}被将军`
        : `${sideName[turn]}行棋`
  const statusSubtitle = phase === 'finished'
    ? `${endReason} · 共 ${history.length} 回合`
    : mode === 'ai'
      ? turn === 'red' ? '轮到你了，从容落子' : 'AI 正在寻找最佳着法'
      : `第 ${Math.floor(history.length / 2) + 1} 回合`

  return (
    <div className="app-shell" data-theme={theme}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-seal">弈</div>
          <div><strong>弈境</strong><span>YIJING XIANGQI</span></div>
        </div>
        <div className="top-status hidden md:flex">
          <span className={`status-dot ${turn}`} />
          <span>{statusTitle}</span>
          <i />
          <small>{mode === 'ai' ? `${difficultyName[difficulty]}人机局` : '双人对弈'}</small>
        </div>
        <nav className="top-actions">
          <button onClick={() => setRulesOpen(true)} aria-label="查看规则"><BookOpen size={18} /><span>规则</span></button>
          <button onClick={() => setSoundOn(value => !value)} aria-label={soundOn ? '关闭声音' : '开启声音'}>
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <div className="settings-wrap">
            <button className={settingsOpen ? 'active' : ''} onClick={() => setSettingsOpen(value => !value)} aria-label="棋局设置"><Settings2 size={18} /></button>
            {settingsOpen && (
              <div className="settings-popover">
                <div className="popover-heading"><span>棋局设置</span><button onClick={() => setSettingsOpen(false)}><X size={16} /></button></div>
                <label>对弈难度</label>
                <div className="segmented compact">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map(level => (
                    <button key={level} className={difficulty === level ? 'active' : ''} onClick={() => setDifficulty(level)}>{difficultyName[level]}</button>
                  ))}
                </div>
                <label className="theme-picker-label"><Palette size={13} />视觉主题</label>
                <div className="theme-grid">
                  {themeOptions.map(option => (
                    <button
                      key={option.id}
                      className={theme === option.id ? 'active' : ''}
                      onClick={() => setTheme(option.id)}
                      aria-pressed={theme === option.id}
                    >
                      <span className={`theme-preview preview-${option.id}`}><i /><i /></span>
                      <strong>{option.name}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
                <button className="setting-line" onClick={() => setFlipped(value => !value)}><FlipVertical2 size={17} /><span>翻转棋盘</span><i>{flipped ? '已翻转' : '红方视角'}</i></button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="game-layout">
        <aside className="left-panel panel-card">
          <div className="eyebrow"><Swords size={14} /> 对弈模式</div>
          <h2>选择你的棋局</h2>
          <div className="mode-switch">
            <button className={mode === 'ai' ? 'active' : ''} onClick={() => mode !== 'ai' && startNewGame('ai')}>
              <Bot size={18} /><span>人机对弈</span>
            </button>
            <button className={mode === 'local' ? 'active' : ''} onClick={() => mode !== 'local' && startNewGame('local')}>
              <Users size={18} /><span>双人对弈</span>
            </button>
          </div>

          <div className="status-block">
            <div className={`turn-emblem ${phase === 'finished' ? 'finished' : turn}`}>
              {phase === 'finished' ? <Sparkles size={25} /> : PIECE_TEXT[turn].king}
            </div>
            <div><span>{phase === 'finished' ? '本局结果' : '当前行棋'}</span><strong>{statusTitle}</strong><p>{statusSubtitle}</p></div>
          </div>

          <div className="players-stack">
            <PlayerCard side="black" active={turn === 'black' && phase !== 'finished'} time={times.black} mode={mode} thinking={aiThinking} capturedValue={blackGain} />
            <div className="versus"><i /><span>VS</span><i /></div>
            <PlayerCard side="red" active={turn === 'red' && phase !== 'finished'} time={times.red} mode={mode} thinking={false} capturedValue={redGain} />
          </div>

          <div className="desktop-controls">
            <button className="primary-button" onClick={undoMove} disabled={!history.length || aiThinking}><Undo2 size={17} />悔棋</button>
            <button className="ghost-button" onClick={() => startNewGame()}><RotateCcw size={17} />新局</button>
            <button className="icon-button danger" onClick={resign} disabled={phase === 'finished'} title="认输"><Flag size={17} /></button>
          </div>
        </aside>

        <section className="board-column">
          <div className="mobile-game-status md:hidden">
            <span className={`status-dot ${turn}`} />
            <div><strong>{statusTitle}</strong><small>{statusSubtitle}</small></div>
            <b>{formatTime(times[turn])}</b>
          </div>

          <div className={`board-stage ${flipped ? 'is-flipped' : ''}`}>
            <div className="board-rim">
              <div className="board-surface">
                <BoardArtwork />
                {Array.from({ length: 10 }, (_, row) => Array.from({ length: 9 }, (_, col) => {
                  const actual = { row, col }
                  const displayRow = flipped ? 9 - row : row
                  const displayCol = flipped ? 8 - col : col
                  const isLegal = legalMoves.some(move => samePosition(move, actual))
                  const target = board[row][col]
                  const isSelected = selected && samePosition(selected, actual)
                  const isLastFrom = lastMove && samePosition(lastMove.from, actual)
                  const isLastTo = lastMove && samePosition(lastMove.to, actual)
                  return (
                    <button
                      key={`square-${positionKey(actual)}`}
                      className={`board-square ${isLegal ? 'is-legal' : ''} ${isSelected ? 'is-selected' : ''} ${isLastFrom ? 'is-last-from' : ''} ${isLastTo ? 'is-last-to' : ''}`}
                      style={boardPositionStyle(displayRow, displayCol)}
                      onClick={() => handleSquareClick(actual)}
                      onMouseEnter={() => target && setHovered(actual)}
                      onMouseLeave={() => target && setHovered(null)}
                      aria-label={`${row + 1} 行 ${col + 1} 列${target ? `，${sideName[target.side]}${PIECE_TEXT[target.side][target.type]}` : ''}`}
                    >
                      {isLegal && <span className={target ? 'capture-hint' : 'move-hint'} />}
                      {isLastFrom && <span className="last-hint last-from" />}
                      {isLastTo && <span className="last-hint last-to" />}
                    </button>
                  )
                }))}

                {board.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
                  if (!piece) return null
                  const displayRow = flipped ? 9 - rowIndex : rowIndex
                  const displayCol = flipped ? 8 - colIndex : colIndex
                  const isSelected = selected?.row === rowIndex && selected.col === colIndex
                  const isHovered = hovered?.row === rowIndex && hovered.col === colIndex
                  const isChecked = checkedKing?.row === rowIndex && checkedKing.col === colIndex
                  return (
                    <div
                      key={piece.id}
                      className={`chess-piece ${piece.side} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isChecked ? 'in-check' : ''} ${history.length === 0 ? 'piece-enter' : ''}`}
                      style={{
                        ...boardPositionStyle(displayRow, displayCol),
                        '--enter-delay': `${(rowIndex * 9 + colIndex) * 9}ms`,
                      } as React.CSSProperties}
                    >
                      <span className="piece-outer"><span className="piece-inner">{PIECE_TEXT[piece.side][piece.type]}</span></span>
                    </div>
                  )
                }))}

                {aiThinking && <div className="thinking-badge"><BrainCircuit size={16} /><span>墨衡推演中</span><i /><i /><i /></div>}
                {phase === 'check' && <div className="check-stamp">将</div>}
              </div>
            </div>
            <div className="board-caption"><span>楚河汉界</span><i>·</i><span>落子无悔</span></div>
          </div>

          <div className="mobile-controls md:hidden">
            <button onClick={undoMove} disabled={!history.length || aiThinking}><Undo2 size={18} /><span>悔棋</span></button>
            <button onClick={() => setFlipped(value => !value)}><FlipVertical2 size={18} /><span>翻转</span></button>
            <button onClick={() => startNewGame()}><RotateCcw size={18} /><span>新局</span></button>
            <button onClick={resign} disabled={phase === 'finished'}><Flag size={18} /><span>认输</span></button>
          </div>
        </section>

        <aside className="right-panel panel-card">
          <div className="panel-heading">
            <div><span>棋局进程</span><strong>{history.length} 手</strong></div>
            <button onClick={() => setFlipped(value => !value)} title="翻转棋盘"><FlipVertical2 size={17} /></button>
          </div>

          <div className="captured-box">
            <CapturedPieces label="红方所得" pieces={captured.filter(piece => piece.side === 'black')} />
            <CapturedPieces label="黑方所得" pieces={captured.filter(piece => piece.side === 'red')} />
          </div>

          <div className="history-head"><span>着法记录</span><span>红方</span><span>黑方</span></div>
          <div className="move-history">
            {history.length === 0 ? (
              <div className="empty-history"><div>弈</div><p>静待第一步落子</p><span>红方先行</span></div>
            ) : Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => {
              const redMove = history[index * 2]
              const blackMove = history[index * 2 + 1]
              return (
                <div className="history-row" key={index}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <b className={index * 2 === history.length - 1 ? 'latest' : ''}>{redMove?.notation ?? '—'}</b>
                  <b className={index * 2 + 1 === history.length - 1 ? 'latest' : ''}>{blackMove?.notation ?? '…'}</b>
                </div>
              )
            })}
            <div ref={historyEndRef} />
          </div>

          <div className="tip-card">
            <Sparkles size={17} />
            <div><strong>弈境提示</strong><p>{phase === 'check' ? '将帅正受威胁，请立即应将。' : '控制中路，往往能获得更开阔的进攻空间。'}</p></div>
          </div>
        </aside>
      </main>

      {phase === 'finished' && (
        <div className="result-overlay">
          <div className="result-rays" />
          <div className={`result-seal ${winner}`}><span>{winner ? PIECE_TEXT[winner].king : '和'}</span></div>
          <div className="eyebrow"><Sparkles size={14} /> 棋局已定</div>
          <h2>{winner ? `${sideName[winner]}胜` : '和棋'}</h2>
          <p>{endReason} · 历经 {history.length} 手</p>
          <div><button className="primary-button" onClick={() => startNewGame()}><RotateCcw size={17} />再来一局</button><button className="ghost-button" onClick={undoMove}><Undo2 size={17} />复盘一步</button></div>
        </div>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}

      <footer><span>弈境 · 中国象棋</span><i /> <span>以棋会友，乐在其中</span></footer>
    </div>
  )
}
