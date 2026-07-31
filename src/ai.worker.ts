/// <reference lib="webworker" />

import { chooseAIMove, type Board, type Difficulty, type Side } from './game'

interface AIRequest {
  board: Board
  side: Side
  difficulty: Difficulty
}

self.onmessage = (event: MessageEvent<AIRequest>) => {
  const { board, side, difficulty } = event.data
  self.postMessage(chooseAIMove(board, side, difficulty))
}

export {}
