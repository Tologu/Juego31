import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import barajaSprite from './assets/baraja_espanola_completa.png'
import './App.css'

type Suit = 'oros' | 'copas' | 'espadas' | 'bastos'
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12

interface Card {
  id: string
  suit: Suit
  rank: Rank
}

interface Player {
  id: number
  name: string
  isHuman: boolean
  lives: number
  hand: Card[]
}

interface GameState {
  players: Player[]
  deck: Card[]
  discardPile: Card[]
  dealerIndex: number
  currentPlayerIndex: number
  knockerId: number | null
  remainingFinalTurns: number
  round: number
  phase: 'turn' | 'discarding' | 'round-end' | 'game-over'
  logs: string[]
  roundSummary: string
  winnerIds: number[]
}

type Difficulty = 'facil' | 'media' | 'dificil'
type DrawSource = 'deck' | 'discard'

const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos']
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
const STARTING_LIVES = 3
const BOT_NAMES = ['Bot Luna', 'Bot Sol', 'Bot Nube', 'Bot Río', 'Bot Cometa']
const SPRITE_COLUMNS = 12
const SPRITE_ROWS = 5
const BACK_SPRITE_COLUMN = 1
const BACK_SPRITE_ROW = 4

const spriteRowBySuit: Record<Suit, number> = {
  oros: 0,
  copas: 1,
  espadas: 2,
  bastos: 3,
}

const spriteColumnByRank: Record<Rank, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  10: 9, // Sota (J)
  11: 10, // Caballo (Q)
  12: 11, // Rey (K)
}

const buildPlayers = (playerCount: number, humanName: string): Player[] => {
  const normalizedCount = Math.max(2, Math.min(6, playerCount))
  const players: Player[] = [
    { id: 0, name: humanName || 'Tu', isHuman: true, lives: STARTING_LIVES, hand: [] },
  ]
  for (let i = 1; i < normalizedCount; i += 1) {
    players.push({
      id: i,
      name: BOT_NAMES[i - 1] ?? `Bot ${i}`,
      isHuman: false,
      lives: STARTING_LIVES,
      hand: [],
    })
  }
  return players
}

const difficultyConfig: Record<Difficulty, { knockThreshold: number; mistakeChance: number; thinkMs: number }> = {
  facil: { knockThreshold: 30, mistakeChance: 0.34, thinkMs: 1800 },
  media: { knockThreshold: 28, mistakeChance: 0.17, thinkMs: 1400 },
  dificil: { knockThreshold: 27, mistakeChance: 0.06, thinkMs: 1100 },
}

const cardValue = (rank: Rank): number => {
  if (rank === 1) return 11
  if (rank >= 11) return 10
  return rank
}

const rankLabel = (rank: Rank): string => {
  if (rank === 1) return 'As'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  return String(rank)
}

const scoreHand = (hand: Card[]): number => {
  const suitTotals: Record<Suit, number> = {
    oros: 0,
    copas: 0,
    espadas: 0,
    bastos: 0,
  }
  hand.forEach((card) => {
    suitTotals[card.suit] += cardValue(card.rank)
  })
  return Math.max(...Object.values(suitTotals))
}

const createDeck = (): Card[] => {
  const deck: Card[] = []
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({ id: `${suit}-${rank}`, suit, rank })
    })
  })
  return deck
}

const shuffle = (cards: Card[]): Card[] => {
  const next = [...cards]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

const isAlive = (player: Player): boolean => player.lives > 0

const nextAliveIndex = (players: Player[], fromIndex: number): number => {
  let index = fromIndex
  for (let i = 0; i < players.length; i += 1) {
    index = (index + 1) % players.length
    if (isAlive(players[index])) {
      return index
    }
  }
  return fromIndex
}

const refillDeckIfNeeded = (deck: Card[], discardPile: Card[]): { deck: Card[]; discardPile: Card[] } => {
  if (deck.length > 0) return { deck, discardPile }
  if (discardPile.length <= 1) return { deck, discardPile }

  const newTop = discardPile[discardPile.length - 1]
  const toShuffle = discardPile.slice(0, -1)
  return {
    deck: shuffle(toShuffle),
    discardPile: [newTop],
  }
}

const bestDiscardIndex = (cards: Card[]): number => {
  let bestIndex = 0
  let bestScore = -1
  let bestDiscardValue = Number.POSITIVE_INFINITY

  cards.forEach((_, index) => {
    const candidate = cards.filter((__, cardIndex) => cardIndex !== index)
    const score = scoreHand(candidate)
    const discardedValue = cardValue(cards[index].rank)

    if (score > bestScore || (score === bestScore && discardedValue < bestDiscardValue)) {
      bestScore = score
      bestDiscardValue = discardedValue
      bestIndex = index
    }
  })

  return bestIndex
}

const setupRound = (players: Player[], dealerIndex: number, round: number): GameState => {
  const deck = shuffle(createDeck())
  const roundPlayers = players.map((player) => ({ ...player, hand: [] as Card[] }))

  roundPlayers.forEach((player) => {
    if (!isAlive(player)) return
    player.hand = [deck.pop()!, deck.pop()!, deck.pop()!]
  })

  const firstDiscard = deck.pop()!
  const starter = nextAliveIndex(roundPlayers, dealerIndex)

  return {
    players: roundPlayers,
    deck,
    discardPile: [firstDiscard],
    dealerIndex,
    currentPlayerIndex: starter,
    knockerId: null,
    remainingFinalTurns: 0,
    round,
    phase: 'turn',
    logs: [`Ronda ${round}: abre ${roundPlayers[starter].name}.`],
    roundSummary: '',
    winnerIds: [],
  }
}

const applyRoundResult = (state: GameState, winnerId: number | null): GameState => {
  const alivePlayers = state.players.filter(isAlive)
  let losers: number[] = []
  let summary = ''
  let roundWinnerIds: number[] = []

  if (winnerId !== null) {
    losers = alivePlayers.filter((player) => player.id !== winnerId).map((player) => player.id)
    roundWinnerIds = [winnerId]
    const winnerName = state.players.find((player) => player.id === winnerId)?.name ?? 'Jugador'
    summary = `${winnerName} logró 31 exactos. Todos los demás pierden una vida.`
  } else {
    const scores = alivePlayers.map((player) => ({ id: player.id, score: scoreHand(player.hand) }))
    const minScore = Math.min(...scores.map((entry) => entry.score))
    const maxScore = Math.max(...scores.map((entry) => entry.score))
    losers = scores.filter((entry) => entry.score === minScore).map((entry) => entry.id)
    roundWinnerIds = scores.filter((entry) => entry.score === maxScore).map((entry) => entry.id)
    const loserNames = state.players
      .filter((player) => losers.includes(player.id))
      .map((player) => player.name)
      .join(', ')
    summary = `Pierde${losers.length > 1 ? 'n' : ''} vida: ${loserNames} (puntuación mínima: ${minScore}).`
  }

  const updatedPlayers = state.players.map((player) => {
    if (!losers.includes(player.id)) return player
    return { ...player, lives: Math.max(0, player.lives - 1) }
  })

  const aliveAfterRound = updatedPlayers.filter(isAlive)
  const gameOver = aliveAfterRound.length === 1
  const champion = gameOver ? aliveAfterRound[0].name : ''
  const winnerIds = gameOver ? [aliveAfterRound[0].id] : roundWinnerIds

  return {
    ...state,
    players: updatedPlayers,
    phase: gameOver ? 'game-over' : 'round-end',
    roundSummary: gameOver ? `${summary} Campeón final: ${champion}.` : summary,
    logs: [...state.logs, summary],
    winnerIds,
  }
}

const skipKnocker = (state: GameState, candidateIndex: number): number => {
  if (state.knockerId === null) return candidateIndex
  if (state.players[candidateIndex].id !== state.knockerId) return candidateIndex
  return nextAliveIndex(state.players, candidateIndex)
}

const finishTurn = (state: GameState, actorIndex: number): GameState => {
  const actor = state.players[actorIndex]
  const actorScore = scoreHand(actor.hand)
  if (state.knockerId === null && actorScore === 31) {
    return applyRoundResult(
      {
        ...state,
        logs: [...state.logs, `${actor.name} muestra 31 exactos y corta la ronda.`],
      },
      actor.id,
    )
  }

  let remaining = state.remainingFinalTurns
  if (state.knockerId !== null && actor.id !== state.knockerId) {
    remaining -= 1
  }
  if (state.knockerId !== null && remaining <= 0) {
    return applyRoundResult({ ...state, remainingFinalTurns: 0 }, null)
  }

  const baseNext = nextAliveIndex(state.players, actorIndex)
  const nextIndex = skipKnocker({ ...state, remainingFinalTurns: remaining }, baseNext)

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    remainingFinalTurns: remaining,
    phase: 'turn',
  }
}

function App() {
  const [playerCount, setPlayerCount] = useState(4)
  const [humanName, setHumanName] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('media')
  const [game, setGame] = useState<GameState>(() => setupRound(buildPlayers(4, ''), 0, 1))
  const [dragSource, setDragSource] = useState<DrawSource | null>(null)
  const [draggedHandCardIndex, setDraggedHandCardIndex] = useState<number | null>(null)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const draggedHandCardElementRef = useRef<HTMLElement | null>(null)

  const currentPlayer = game.players[game.currentPlayerIndex]
  const topDiscard = game.discardPile[game.discardPile.length - 1]
  const humanPlayer = game.players.find((player) => player.isHuman) ?? game.players[0]
  const botPlayers = game.players.filter((player) => !player.isHuman)
  const isHumanTurn = humanPlayer.id === currentPlayer.id && game.phase !== 'game-over'
  const showWinners = game.phase === 'round-end' || game.phase === 'game-over'
  const isWinner = (playerId: number): boolean => showWinners && game.winnerIds.includes(playerId)
  // Jugadores que pierden vida en la ronda actual
  const losersThisRound = (() => {
    if (!showWinners) return []
    // Buscar en roundSummary los nombres de los que pierden vida
    // El summary puede ser: 'Pierde vida: Bot Luna (puntuación mínima: 18).' o 'Pierden vida: Bot Luna, Bot Sol (puntuación mínima: 18).' o 'Jugador logró 31 exactos. Todos los demás pierden una vida.'
    if (game.roundSummary.includes('pierden una vida')) {
      // Todos menos el ganador pierden vida
      return game.players.filter(p => !isWinner(p.id) && p.lives > 0).map(p => p.id)
    }
    if (game.roundSummary.includes('Pierde vida:')) {
      const match = game.roundSummary.match(/Pierde vida: (.+) \(puntuación/)
      if (match) {
        const name = match[1].trim()
        const p = game.players.find(pl => pl.name === name && pl.lives > 0)
        return p ? [p.id] : []
      }
    }
    if (game.roundSummary.includes('Pierden vida:')) {
      const match = game.roundSummary.match(/Pierden vida: (.+) \(puntuación/)
      if (match) {
        const names = match[1].split(',').map(s => s.trim())
        return game.players.filter(pl => names.includes(pl.name) && pl.lives > 0).map(pl => pl.id)
      }
    }
    return []
  })()

  const canHumanAct =
    game.phase === 'turn' && currentPlayer.isHuman && isAlive(currentPlayer)
  const canHumanDiscard =
    game.phase === 'discarding' && currentPlayer.isHuman && isAlive(currentPlayer)

  const humanCardStyle = (cardIndex: number, totalCards: number): CSSProperties => {
    const fanOffset = cardIndex - (totalCards - 1) / 2
    const fanDepth = Math.abs(fanOffset)
    return {
      '--fan-offset': String(fanOffset),
      '--fan-depth': String(fanDepth),
      '--fan-rotate': `${fanOffset * 8}deg`,
    } as CSSProperties
  }

  const cardSpriteStyle = (card: Card): CSSProperties => {
    const row = spriteRowBySuit[card.suit]
    const col = spriteColumnByRank[card.rank]
    const x = (col / (SPRITE_COLUMNS - 1)) * 100
    const y = (row / (SPRITE_ROWS - 1)) * 100

    return {
      backgroundImage: `url(${barajaSprite})`,
      backgroundPosition: `${x}% ${y}%`,
      backgroundSize: `${SPRITE_COLUMNS * 100}% ${SPRITE_ROWS * 100}%`,
    }
  }

  const cardBackSpriteStyle = (): CSSProperties => {
    const x = (BACK_SPRITE_COLUMN / (SPRITE_COLUMNS - 1)) * 100
    const y = (BACK_SPRITE_ROW / (SPRITE_ROWS - 1)) * 100
    return {
      backgroundImage: `url(${barajaSprite})`,
      backgroundPosition: `${x}% ${y}%`,
      backgroundSize: `${SPRITE_COLUMNS * 100}% ${SPRITE_ROWS * 100}%`,
    }
  }

  const drawForHuman = (source: 'deck' | 'discard') => {
    if (!canHumanAct) return

    setGame((prev) => {
      const current = prev.players[prev.currentPlayerIndex]
      if (!current.isHuman || prev.phase !== 'turn') return prev

      let deck = [...prev.deck]
      let discardPile = [...prev.discardPile]

      if (source === 'deck') {
        const refill = refillDeckIfNeeded(deck, discardPile)
        deck = refill.deck
        discardPile = refill.discardPile
        if (deck.length === 0) return prev
      }

      const drawn = source === 'deck' ? deck.pop()! : discardPile.pop()!
      const players = [...prev.players]
      players[prev.currentPlayerIndex] = {
        ...current,
        hand: [...current.hand, drawn],
      }

      return {
        ...prev,
        players,
        deck,
        discardPile,
        phase: 'discarding',
        logs: [
          ...prev.logs,
          `${current.name} robó del ${source === 'deck' ? 'mazo' : 'descarte'}.`,
        ],
      }
    })
  }

  const startDrawDrag = (source: DrawSource, event: DragEvent<HTMLElement>) => {
    if (!canHumanAct || game.phase !== 'turn') {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/draw-source', source)
    setDragSource(source)
  }

  const endDrawDrag = () => {
    setDragSource(null)
  }

  const startHandCardDrag = (cardIndex: number, event: DragEvent<HTMLButtonElement>) => {
    if (!canHumanDiscard || !isHumanTurn) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/discard-index', String(cardIndex))
    setDraggedHandCardIndex(cardIndex)
    draggedHandCardElementRef.current = event.currentTarget
  }

  const endHandCardDrag = () => {
    setDraggedHandCardIndex(null)
    draggedHandCardElementRef.current = null
  }

  const dropToHand = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!canHumanAct || game.phase !== 'turn') return

    const sourceData = event.dataTransfer.getData('text/draw-source')
    const source = (sourceData || dragSource) as DrawSource | null
    if (source !== 'deck' && source !== 'discard') return
    drawForHuman(source)
    setDragSource(null)
  }

  const allowDropToHand = (event: DragEvent<HTMLElement>) => {
    if (!canHumanAct || game.phase !== 'turn') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const allowDropToDiscard = (event: DragEvent<HTMLElement>) => {
    if (!canHumanDiscard || !isHumanTurn) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropToDiscard = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!canHumanDiscard || !isHumanTurn) return
    const data = event.dataTransfer.getData('text/discard-index')
    const cardIndex = Number(data)
    if (!Number.isInteger(cardIndex)) return
    discardForHuman(cardIndex)
    endHandCardDrag()
  }

  const discardForHuman = (cardIndex: number) => {
    setGame((prev) => {
      const current = prev.players[prev.currentPlayerIndex]
      if (!current.isHuman || prev.phase !== 'discarding') return prev
      if (cardIndex < 0 || cardIndex >= current.hand.length) return prev

      const nextHand = current.hand.filter((_, index) => index !== cardIndex)
      const card = current.hand[cardIndex]
      const players = [...prev.players]
      players[prev.currentPlayerIndex] = {
        ...current,
        hand: nextHand,
      }

      const nextState = {
        ...prev,
        players,
        discardPile: [...prev.discardPile, card],
        logs: [...prev.logs, `${current.name} descartó ${rankLabel(card.rank)} de ${card.suit}.`],
      }

      return finishTurn(nextState, prev.currentPlayerIndex)
    })
  }

  const knockForHuman = () => {
    if (!canHumanAct || game.knockerId !== null) return

    setGame((prev) => {
      const current = prev.players[prev.currentPlayerIndex]
      if (!current.isHuman || prev.phase !== 'turn' || prev.knockerId !== null) return prev

      const aliveCount = prev.players.filter(isAlive).length
      const nextState = {
        ...prev,
        knockerId: current.id,
        remainingFinalTurns: aliveCount - 1,
        logs: [...prev.logs, `${current.name} se planta. Los demás juegan una última vuelta.`],
      }
      return finishTurn(nextState, prev.currentPlayerIndex)
    })
  }

  const startNextRound = () => {
    setGame((prev) => {
      if (prev.phase !== 'round-end') return prev
      const nextDealer = nextAliveIndex(prev.players, prev.dealerIndex)
      return setupRound(prev.players, nextDealer, prev.round + 1)
    })
  }

  const restartGame = () => {
    setGame(setupRound(buildPlayers(playerCount, humanName), 0, 1))
  }

  const applySettings = () => {
    setGame(setupRound(buildPlayers(playerCount, humanName), 0, 1))
  }

  useEffect(() => {
    if (game.phase !== 'turn') return
    const actor = game.players[game.currentPlayerIndex]
    if (actor.isHuman || !isAlive(actor)) return

    const timer = setTimeout(() => {
      setGame((prev) => {
        if (prev.phase !== 'turn') return prev
        const bot = prev.players[prev.currentPlayerIndex]
        if (bot.isHuman || !isAlive(bot)) return prev

        const config = difficultyConfig[difficulty]
        const botScore = scoreHand(bot.hand)
        if (prev.knockerId === null && botScore >= config.knockThreshold) {
          const aliveCount = prev.players.filter(isAlive).length
          const knockerState = {
            ...prev,
            knockerId: bot.id,
            remainingFinalTurns: aliveCount - 1,
            logs: [...prev.logs, `${bot.name} se planta.`],
          }
          return finishTurn(knockerState, prev.currentPlayerIndex)
        }

        let deck = [...prev.deck]
        let discardPile = [...prev.discardPile]
        const top = discardPile[discardPile.length - 1]

        const scoreIfTakeDiscard = scoreHand([...bot.hand, top])
        let shouldTakeDiscard = scoreIfTakeDiscard > botScore
        if (Math.random() < config.mistakeChance) {
          shouldTakeDiscard = !shouldTakeDiscard
        }
        const source: 'deck' | 'discard' = shouldTakeDiscard ? 'discard' : 'deck'

        if (source === 'deck') {
          const refill = refillDeckIfNeeded(deck, discardPile)
          deck = refill.deck
          discardPile = refill.discardPile
          if (deck.length === 0) return prev
        }

        const drawn = source === 'deck' ? deck.pop()! : discardPile.pop()!
        let candidateHand = [...bot.hand, drawn]
        let discardIndex: number
        if (source === 'discard') {
          // No puede descartar la carta recién cogida del descarte
          const handWithoutDrawn = candidateHand.slice(0, -1)
          // Si hay error, elige aleatorio entre las que puede
          discardIndex = Math.random() < config.mistakeChance
            ? Math.floor(Math.random() * handWithoutDrawn.length)
            : bestDiscardIndex(handWithoutDrawn)
          // Ajustar índice porque bestDiscardIndex devuelve índice relativo a handWithoutDrawn
          // handWithoutDrawn.length === candidateHand.length - 1
        } else {
          // Puede descartar cualquiera
          const randomDiscard = Math.floor(Math.random() * candidateHand.length)
          discardIndex = Math.random() < config.mistakeChance ? randomDiscard : bestDiscardIndex(candidateHand)
        }
        // Si robó del descarte, handWithoutDrawn.length == candidateHand.length - 1
        // Por tanto, si source === 'discard', el índice es el mismo
        const discarded = source === 'discard'
          ? candidateHand[discardIndex]
          : candidateHand[discardIndex]
        const nextHand = candidateHand.filter((_, index) => index !== discardIndex)

        const players = [...prev.players]
        players[prev.currentPlayerIndex] = { ...bot, hand: nextHand }

        let logMsg = '';
        if (source === 'discard') {
          logMsg = `${bot.name} roba la carta ${rankLabel(drawn.rank)} de ${drawn.suit} y descarta ${rankLabel(discarded.rank)} de ${discarded.suit}.`;
        } else {
          logMsg = `${bot.name} roba del mazo y descarta ${rankLabel(discarded.rank)} de ${discarded.suit}.`;
        }
        const nextState = {
          ...prev,
          players,
          deck,
          discardPile: [...discardPile, discarded],
          logs: [
            ...prev.logs,
            logMsg,
          ],
        }
        return finishTurn(nextState, prev.currentPlayerIndex)
      })
    }, difficultyConfig[difficulty].thinkMs)

    return () => clearTimeout(timer)
  }, [game, difficulty])

  return (
    <main className="table-wrap">
      <header className="table-header">
        <h1>Juego del 31</h1>
        <button
          className="rules-btn"
          style={{ position: 'absolute', top: 18, right: 18, zIndex: 10 }}
          onClick={() => setShowRules(true)}
        >
          Reglas
        </button>
        <div className="meta-row">
          <span>Ronda: {game.round}</span>
          <span>Mazo: {game.deck.length} cartas</span>
          <span>Turno: {game.players[game.currentPlayerIndex].name}</span>
          <span>Jugadores: {game.players.length}</span>
          <span>Dificultad: {difficulty}</span>
        </div>
        <div className="settings-row">
          <label>
            Tu nombre
            <input
              type="text"
              value={humanName}
              onChange={e => setHumanName(e.target.value)}
              maxLength={16}
              style={{ marginLeft: 8, width: 120 }}
              placeholder="Tu nombre"
            />
          </label>
          <label>
            Jugadores
            <select
              value={playerCount}
              onChange={(event) => setPlayerCount(Number(event.target.value))}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>
          </label>
          <label>
            Dificultad
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            >
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
          </label>
          <button type="button" onClick={applySettings}>
            Aplicar ajustes
          </button>
        </div>
        {showRules && (
          <div className="discard-modal" onClick={() => setShowRules(false)}>
            <div className="discard-modal-content" onClick={e => e.stopPropagation()}>
              <button className="close-modal-btn" onClick={() => setShowRules(false)} aria-label="Cerrar">×</button>
              <h2 style={{marginBottom: 18}}>Reglas del Juego del 31</h2>
              <ul style={{ textAlign: 'left', maxWidth: 420, margin: '0 auto', fontSize: '1.08em', marginBottom: 0 }}>
                <li>Se juega con la baraja española (sin 8, 9 ni comodines).</li>
                <li>Cada jugador recibe 3 cartas.</li>
                <li>El objetivo es sumar 31 puntos o acercarse lo máximo posible en un mismo palo.</li>
                <li>El As vale 11 puntos, figuras 10, el resto su valor.</li>
                <li>En tu turno puedes robar del mazo o del descarte y luego descartar una carta.</li>
                <li>Cuando un jugador se planta, los demás tienen una última oportunidad.</li>
                <li>El que más puntos tenga en un palo gana la ronda.</li>
              </ul>
            </div>
          </div>
        )}
      </header>

      <section className="board-surface">
        <section className="bots-row">
          {botPlayers.map((player) => {
            const revealCards = showWinners
            const isCurrent = player.id === currentPlayer.id && game.phase !== 'game-over'
            const score = scoreHand(player.hand)
            return (
              <article key={player.id} className={`player-card ${isCurrent ? 'active' : ''} ${player.lives === 0 ? 'out' : ''} ${isWinner(player.id) ? 'winner-glow' : ''}`}>
                <div className="player-top">
                  <h2>{player.name}</h2>
                  <span className="lives-hearts" aria-label={`Vidas: ${player.lives}`}>
                    {[0,1,2].map(i => (
                      <svg
                        key={i}
                        width="18" height="18" viewBox="0 0 20 20"
                        aria-hidden="true"
                        style={{ marginRight: i < 2 ? 2 : 0, opacity: player.lives > i ? 1 : 0.32, filter: player.lives > i ? 'drop-shadow(0 0 2px #f6d77a)' : 'none' }}
                        fill={player.lives > i ? '#e94f4f' : 'none'}
                        stroke="#e94f4f"
                        strokeWidth="1.2"
                      >
                        <path d="M10 17s-6.2-4.2-7.6-7.1C1.1 7.7 2.2 5 5 5c1.5 0 2.7 1 3.3 2.1C9 6 10.2 5 11.7 5c2.8 0 3.9 2.7 2.6 4.9C16.2 12.8 10 17 10 17z"/>
                      </svg>
                    ))}
                  </span>
                </div>
                <div className="hand-row">
                  {player.hand.map((card, cardIndex) => (
                    revealCards ? (
                      <div
                        key={`${card.id}-${cardIndex}`}
                        className="card bot-card sprite-card aged-card"
                        style={cardSpriteStyle(card)}
                        aria-label={`${rankLabel(card.rank)} de ${card.suit}`}
                      >
                        <span className="sr-only">{rankLabel(card.rank)} de {card.suit}</span>
                      </div>
                    ) : (
                      <div
                        key={`${card.id}-${cardIndex}`}
                        className="card back sprite-back"
                        style={cardBackSpriteStyle()}
                        aria-label="Carta oculta"
                      >
                        <strong>?</strong>
                        <small>oculta</small>
                        <small>---</small>
                      </div>
                    )
                  ))}
                </div>
                <p className="score">
                  Puntos actuales: {revealCards ? score : 'ocultos'}
                </p>
                {showWinners && (
                  isWinner(player.id)
                    ? <span className="player-result-label gana">GANA</span>
                    : losersThisRound.includes(player.id)
                      ? <span className="player-result-label pierde">PIERDE</span>
                      : null
                )}
              </article>
            )
          })}
        </section>

        <section className="center-zone stage-center">
          <div className="pile-box">
            <h3>Mazo</h3>
            <button
              type="button"
              className={`deck-stack action-pile ${canHumanAct && game.phase === 'turn' ? 'drag-enabled' : ''} ${dragSource === 'deck' ? 'dragging' : ''}`}
              onClick={() => drawForHuman('deck')}
              onDragStart={(event) => startDrawDrag('deck', event)}
              onDragEnd={endDrawDrag}
              draggable={canHumanAct && game.phase === 'turn'}
              disabled={!canHumanAct || game.phase !== 'turn'}
              aria-label="Robar del mazo arrastrando a tu mano"
            >
              <span style={cardBackSpriteStyle()}></span>
              <span style={cardBackSpriteStyle()}></span>
              <span style={cardBackSpriteStyle()}></span>
            </button>
          </div>

          <div className="pile-box discard-focus">
            <h3>Descarte</h3>
            <button
              type="button"
              className={`top-card sprite-card aged-card action-pile ${canHumanAct && game.phase === 'turn' ? 'drag-enabled' : ''} ${dragSource === 'discard' ? 'dragging' : ''} ${canHumanDiscard ? 'discard-drop-ready' : ''}`}
              style={cardSpriteStyle(topDiscard)}
              onClick={() => drawForHuman('discard')}
              onDragStart={(event) => startDrawDrag('discard', event)}
              onDragEnd={endDrawDrag}
              onDragOver={allowDropToDiscard}
              onDrop={dropToDiscard}
              draggable={canHumanAct && game.phase === 'turn'}
              disabled={!canHumanAct || game.phase !== 'turn'}
              aria-label="Robar del descarte arrastrando a tu mano"
            >
              <span className="sr-only">{rankLabel(topDiscard.rank)} de {topDiscard.suit}</span>
            </button>
          </div>

          <div className="controls">
            <button type="button" onClick={knockForHuman} disabled={!canHumanAct || game.knockerId !== null || game.phase !== 'turn'}>
              Plantarse
            </button>
            <button
              type="button"
              onClick={startNextRound}
              disabled={game.phase !== 'round-end'}
              className={game.phase === 'round-end' ? 'next-round-btn highlight-green' : 'next-round-btn'}
            >
              Siguiente ronda
            </button>
            <button type="button" onClick={restartGame}>
              Reiniciar partida
            </button>
            <button
              type="button"
              className="show-discard-btn"
              style={{ marginLeft: 8 }}
              onClick={() => setShowDiscardModal(true)}
            >
              Cartas que han salido
            </button>
          </div>
              {showDiscardModal && (
                <div className="discard-modal" onClick={() => setShowDiscardModal(false)}>
                  <div className="discard-modal-content" onClick={e => e.stopPropagation()}>
                    <button className="close-modal-btn" onClick={() => setShowDiscardModal(false)} aria-label="Cerrar">×</button>
                    <div className="minicards-grid-wrap">
                      <div className="minicards-grid">
                        {SUITS.map((suit) => (
                          <div key={suit} className="minicards-row">
                            {RANKS.map((rank) => {
                              // Solo mostrar los rangos válidos (1-7, 10=Sota, 11=Caballo, 12=Rey)
                              if (![1,2,3,4,5,6,7,10,11,12].includes(rank)) return null;
                              const cardId = `${suit}-${rank}`;
                              const isOut = game.discardPile.some(c => c.suit === suit && c.rank === rank);
                              const row = spriteRowBySuit[suit];
                              const col = spriteColumnByRank[rank];
                              const x = (col / (SPRITE_COLUMNS - 1)) * 100;
                              const y = (row / (SPRITE_ROWS - 1)) * 100;
                              // Etiquetas personalizadas para figuras
                              let nombreFigura = '';
                              if (rank === 10) nombreFigura = 'Sota';
                              else if (rank === 11) nombreFigura = 'Caballo';
                              else if (rank === 12) nombreFigura = 'Rey';
                              const label = nombreFigura ? `${nombreFigura} de ${suit}` : `${rankLabel(rank)} de ${suit}`;
                              return (
                                <span
                                  key={cardId}
                                  className={`minicard ${isOut ? 'minicard-out' : 'minicard-dark'}`}
                                  title={label}
                                  aria-label={`${label}${isOut ? ' (descartada)' : ' (no vista)'}`}
                                  style={{
                                    backgroundImage: `url(${barajaSprite})`,
                                    backgroundPosition: `${x}% ${y}%`,
                                    backgroundSize: `${SPRITE_COLUMNS * 100}% ${SPRITE_ROWS * 100}%`,
                                  }}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="desc-modal-text">Cartas vistas en el descarte durante la partida.</p>
                  </div>
                </div>
              )}
        </section>

        <section
          className={`human-hand-panel ${isHumanTurn ? 'active' : ''} ${dragSource ? 'drop-target' : ''} ${isWinner(humanPlayer.id) ? 'winner-glow' : ''}`}
          onDragOver={allowDropToHand}
          onDrop={dropToHand}
        >
          <div className="human-hand-header">
            <h2>{humanPlayer.name}</h2>
            <span className="lives-hearts" aria-label={`Vidas: ${humanPlayer.lives}`}>
              {[0,1,2].map(i => (
                <svg
                  key={i}
                  width="18" height="18" viewBox="0 0 20 20"
                  aria-hidden="true"
                  style={{ marginRight: i < 2 ? 2 : 0, opacity: humanPlayer.lives > i ? 1 : 0.32, filter: humanPlayer.lives > i ? 'drop-shadow(0 0 2px #f6d77a)' : 'none' }}
                  fill={humanPlayer.lives > i ? '#e94f4f' : 'none'}
                  stroke="#e94f4f"
                  strokeWidth="1.2"
                >
                  <path d="M10 17s-6.2-4.2-7.6-7.1C1.1 7.7 2.2 5 5 5c1.5 0 2.7 1 3.3 2.1C9 6 10.2 5 11.7 5c2.8 0 3.9 2.7 2.6 4.9C16.2 12.8 10 17 10 17z"/>
                </svg>
              ))}
            </span>
            <span>Puntos: {scoreHand(humanPlayer.hand)}</span>
            <span>{isHumanTurn ? 'Tu turno' : `Juega ${currentPlayer.name}`}</span>
          </div>

          <div className="human-hand fan-layout">
            {humanPlayer.hand.map((card, cardIndex) => (
              <button
                key={`${card.id}-${cardIndex}`}
                className={`card human-card sprite-card aged-card ${draggedHandCardIndex === cardIndex ? 'dragging-card' : ''}`}
                type="button"
                style={{
                  ...humanCardStyle(cardIndex, humanPlayer.hand.length),
                  ...cardSpriteStyle(card),
                }}
                disabled={!(game.phase === 'discarding' && isHumanTurn)}
                draggable={game.phase === 'discarding' && isHumanTurn}
                onDragStart={(event) => startHandCardDrag(cardIndex, event)}
                onDragEnd={endHandCardDrag}
                onClick={() => discardForHuman(cardIndex)}
              >
                <span className="sr-only">{rankLabel(card.rank)} de {card.suit}</span>
              </button>
            ))}
            {showWinners && (
              isWinner(humanPlayer.id)
                ? <span className="player-result-label gana">GANA</span>
                : losersThisRound.includes(humanPlayer.id)
                  ? <span className="player-result-label pierde">PIERDE</span>
                  : null
            )}
          </div>
        </section>
      </section>

      <section className="log-panel">
        <p className="turn-badge">
          Turno actual: {currentPlayer.name}
        </p>
        {game.phase === 'discarding' && <p>Descarta una carta haciendo clic o arrastrandola al descarte.</p>}
        {game.phase === 'turn' && isHumanTurn && <p>Arrastra desde Mazo o Descarte y suelta en tu mano para robar.</p>}
        {game.phase === 'round-end' && <p>{game.roundSummary}</p>}
        {game.phase === 'game-over' && <p>{game.roundSummary}</p>}
        <h3>Registro</h3>
        <ul>
          {game.logs.slice(-8).map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>

    </main>
  )
}

export default App
