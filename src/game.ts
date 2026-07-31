export type Side = 'red' | 'black'
export type PieceType = 'king' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn'
export type Difficulty = 'easy' | 'normal' | 'hard'

export interface Piece {
  id: string
  side: Side
  type: PieceType
}

export interface Position {
  row: number
  col: number
}

export interface ChessMove {
  from: Position
  to: Position
  piece: Piece
  captured: Piece | null
}

export type Board = Array<Array<Piece | null>>

export const PIECE_TEXT: Record<Side, Record<PieceType, string>> = {
  red: {
    king: '帅', advisor: '仕', elephant: '相', horse: '马',
    rook: '车', cannon: '炮', pawn: '兵',
  },
  black: {
    king: '将', advisor: '士', elephant: '象', horse: '马',
    rook: '车', cannon: '炮', pawn: '卒',
  },
}

export const PIECE_VALUE: Record<PieceType, number> = {
  king: 10000,
  rook: 900,
  cannon: 450,
  horse: 420,
  elephant: 200,
  advisor: 200,
  pawn: 100,
}

const inBoard = (row: number, col: number) => row >= 0 && row < 10 && col >= 0 && col < 9
const samePosition = (a: Position, b: Position) => a.row === b.row && a.col === b.col
export const otherSide = (side: Side): Side => side === 'red' ? 'black' : 'red'

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 10 }, () => Array<Piece | null>(9).fill(null))
  let id = 0
  const put = (row: number, col: number, side: Side, type: PieceType) => {
    board[row][col] = { id: `${side}-${type}-${id++}`, side, type }
  }
  const backRank: PieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'king', 'advisor', 'elephant', 'horse', 'rook']
  backRank.forEach((type, col) => {
    put(0, col, 'black', type)
    put(9, col, 'red', type)
  })
  put(2, 1, 'black', 'cannon')
  put(2, 7, 'black', 'cannon')
  put(7, 1, 'red', 'cannon')
  put(7, 7, 'red', 'cannon')
  for (let col = 0; col < 9; col += 2) {
    put(3, col, 'black', 'pawn')
    put(6, col, 'red', 'pawn')
  }
  return board
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.slice())
}

export function applyMove(board: Board, from: Position, to: Position): Board {
  const next = cloneBoard(board)
  next[to.row][to.col] = next[from.row][from.col]
  next[from.row][from.col] = null
  return next
}

function addIfAvailable(board: Board, piece: Piece, moves: Position[], row: number, col: number) {
  if (!inBoard(row, col)) return
  const target = board[row][col]
  if (!target || target.side !== piece.side) moves.push({ row, col })
}

export function getPseudoMoves(board: Board, from: Position): Position[] {
  const piece = board[from.row]?.[from.col]
  if (!piece) return []
  const { row, col } = from
  const moves: Position[] = []

  if (piece.type === 'rook' || piece.type === 'cannon') {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
    for (const [dr, dc] of directions) {
      let r = row + dr
      let c = col + dc
      let crossedScreen = false
      while (inBoard(r, c)) {
        const target = board[r][c]
        if (piece.type === 'rook') {
          if (!target) moves.push({ row: r, col: c })
          else {
            if (target.side !== piece.side) moves.push({ row: r, col: c })
            break
          }
        } else if (!crossedScreen) {
          if (!target) moves.push({ row: r, col: c })
          else crossedScreen = true
        } else if (target) {
          if (target.side !== piece.side) moves.push({ row: r, col: c })
          break
        }
        r += dr
        c += dc
      }
    }
  }

  if (piece.type === 'horse') {
    const jumps = [
      [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
      [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
    ]
    for (const [dr, dc, lr, lc] of jumps) {
      if (inBoard(row + lr, col + lc) && !board[row + lr][col + lc]) {
        addIfAvailable(board, piece, moves, row + dr, col + dc)
      }
    }
  }

  if (piece.type === 'elephant') {
    for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
      const r = row + dr
      const c = col + dc
      const staysHome = piece.side === 'red' ? r >= 5 : r <= 4
      if (staysHome && inBoard(r, c) && !board[row + dr / 2][col + dc / 2]) {
        addIfAvailable(board, piece, moves, r, c)
      }
    }
  }

  if (piece.type === 'advisor') {
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const r = row + dr
      const c = col + dc
      const inPalace = c >= 3 && c <= 5 && (piece.side === 'red' ? r >= 7 && r <= 9 : r >= 0 && r <= 2)
      if (inPalace) addIfAvailable(board, piece, moves, r, c)
    }
  }

  if (piece.type === 'king') {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = row + dr
      const c = col + dc
      const inPalace = c >= 3 && c <= 5 && (piece.side === 'red' ? r >= 7 && r <= 9 : r >= 0 && r <= 2)
      if (inPalace) addIfAvailable(board, piece, moves, r, c)
    }
    // “将帅照面”：无遮挡时可沿纵线直接吃掉对方将帅。
    for (const dr of [-1, 1]) {
      let r = row + dr
      while (inBoard(r, col)) {
        const target = board[r][col]
        if (target) {
          if (target.side !== piece.side && target.type === 'king') moves.push({ row: r, col })
          break
        }
        r += dr
      }
    }
  }

  if (piece.type === 'pawn') {
    const forward = piece.side === 'red' ? -1 : 1
    addIfAvailable(board, piece, moves, row + forward, col)
    const crossedRiver = piece.side === 'red' ? row <= 4 : row >= 5
    if (crossedRiver) {
      addIfAvailable(board, piece, moves, row, col - 1)
      addIfAvailable(board, piece, moves, row, col + 1)
    }
  }

  return moves
}

export function findKing(board: Board, side: Side): Position | null {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col]
      if (piece?.side === side && piece.type === 'king') return { row, col }
    }
  }
  return null
}

export function isInCheck(board: Board, side: Side): boolean {
  const king = findKing(board, side)
  if (!king) return true
  const enemy = otherSide(side)
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col]?.side !== enemy) continue
      if (getPseudoMoves(board, { row, col }).some(move => samePosition(move, king))) return true
    }
  }
  return false
}

export function getLegalMoves(board: Board, from: Position): Position[] {
  const piece = board[from.row]?.[from.col]
  if (!piece) return []
  return getPseudoMoves(board, from).filter(to => !isInCheck(applyMove(board, from, to), piece.side))
}

export function getAllLegalMoves(board: Board, side: Side): ChessMove[] {
  const moves: ChessMove[] = []
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col]
      if (piece?.side !== side) continue
      const from = { row, col }
      for (const to of getLegalMoves(board, from)) {
        moves.push({ from, to, piece, captured: board[to.row][to.col] })
      }
    }
  }
  return moves
}

export function hasAnyLegalMove(board: Board, side: Side): boolean {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col]?.side === side && getLegalMoves(board, { row, col }).length > 0) return true
    }
  }
  return false
}

const chineseNumbers = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']

export function moveNotation(move: ChessMove): string {
  const { piece, from, to } = move
  const sourceFile = piece.side === 'red' ? 9 - from.col : from.col + 1
  const targetFile = piece.side === 'red' ? 9 - to.col : to.col + 1
  let action = '平'
  let value = targetFile
  if (from.row !== to.row) {
    const forward = piece.side === 'red' ? to.row < from.row : to.row > from.row
    action = forward ? '进' : '退'
    value = ['horse', 'elephant', 'advisor'].includes(piece.type) ? targetFile : Math.abs(to.row - from.row)
  }
  return `${PIECE_TEXT[piece.side][piece.type]}${chineseNumbers[sourceFile]}${action}${chineseNumbers[value]}`
}

function evaluateBoard(board: Board, aiSide: Side): number {
  let score = 0
  let aiKing = false
  let enemyKing = false
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col]
      if (!piece) continue
      if (piece.type === 'king') {
        if (piece.side === aiSide) aiKing = true
        else enemyKing = true
      }
      let value = PIECE_VALUE[piece.type]
      if (piece.type === 'pawn') {
        const progress = piece.side === 'red' ? 6 - row : row - 3
        value += Math.max(0, progress) * 18
        if (col >= 2 && col <= 6) value += 8
      }
      if ((piece.type === 'horse' || piece.type === 'cannon') && col >= 2 && col <= 6) value += 12
      score += piece.side === aiSide ? value : -value
    }
  }
  if (!aiKing) return -100000
  if (!enemyKing) return 100000
  return score
}

function orderedMoves(moves: ChessMove[]): ChessMove[] {
  return moves.sort((a, b) => {
    const aScore = a.captured ? PIECE_VALUE[a.captured.type] - PIECE_VALUE[a.piece.type] * 0.05 : 0
    const bScore = b.captured ? PIECE_VALUE[b.captured.type] - PIECE_VALUE[b.piece.type] * 0.05 : 0
    return bScore - aScore
  })
}

function minimax(
  board: Board,
  turn: Side,
  aiSide: Side,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
): number {
  if (depth === 0 || Date.now() >= deadline) return evaluateBoard(board, aiSide)
  const moves = orderedMoves(getAllLegalMoves(board, turn))
  if (moves.length === 0) return turn === aiSide ? -90000 - depth : 90000 + depth

  if (turn === aiSide) {
    let best = -Infinity
    for (const move of moves) {
      best = Math.max(best, minimax(applyMove(board, move.from, move.to), otherSide(turn), aiSide, depth - 1, alpha, beta, deadline))
      alpha = Math.max(alpha, best)
      if (beta <= alpha || Date.now() >= deadline) break
    }
    return best
  }

  let best = Infinity
  for (const move of moves) {
    best = Math.min(best, minimax(applyMove(board, move.from, move.to), otherSide(turn), aiSide, depth - 1, alpha, beta, deadline))
    beta = Math.min(beta, best)
    if (beta <= alpha || Date.now() >= deadline) break
  }
  return best
}

export function chooseAIMove(board: Board, aiSide: Side, difficulty: Difficulty): ChessMove | null {
  const moves = orderedMoves(getAllLegalMoves(board, aiSide))
  if (!moves.length) return null

  if (difficulty === 'easy') {
    const ranked = moves
      .map(move => ({ move, score: evaluateBoard(applyMove(board, move.from, move.to), aiSide) + Math.random() * 120 }))
      .sort((a, b) => b.score - a.score)
    return ranked[Math.floor(Math.random() * Math.min(4, ranked.length))].move
  }

  const depth = difficulty === 'hard' ? 3 : 2
  const deadline = Date.now() + (difficulty === 'hard' ? 1200 : 500)
  let bestScore = -Infinity
  let bestMoves: ChessMove[] = []
  for (const move of moves) {
    const next = applyMove(board, move.from, move.to)
    const score = minimax(next, otherSide(aiSide), aiSide, depth - 1, -Infinity, Infinity, deadline)
    if (score > bestScore) {
      bestScore = score
      bestMoves = [move]
    } else if (score === bestScore) bestMoves.push(move)
    if (Date.now() >= deadline && bestMoves.length) break
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0]
}
