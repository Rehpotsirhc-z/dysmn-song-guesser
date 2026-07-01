import { useState, useEffect, useRef } from 'react'
import ModeSelect from './ModeSelect'
import Game from './Game'

const PRELOAD_AHEAD = 3

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeAudio(id, duration) {
  const a = new Audio(`/api/songs/${id}/clip/${duration}`)
  a.preload = 'auto'
  return a
}

function initGame(songs, clipDuration, limit) {
  const queue = shuffle(songs).slice(0, limit ?? songs.length)
  const audioCache = new Map()
  queue.slice(0, PRELOAD_AHEAD + 1).forEach(s => audioCache.set(s.id, makeAudio(s.id, clipDuration)))
  return { queue, audioCache }
}

export default function App() {
  const [songs, setSongs] = useState(null)
  const [mode, setMode] = useState(null)
  const [clipDuration, setClipDuration] = useState(() => {
    const saved = localStorage.getItem('clipDuration')
    return saved ? Number(saved) : 1
  })
  const [limit, setLimit] = useState(() => {
    const saved = localStorage.getItem('limit')
    return saved ? Number(saved) : null
  })
  const [error, setError] = useState(null)
  const game = useRef(null)

  useEffect(() => {
    fetch('/api/songs')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setSongs)
      .catch(e => setError(e.message))
  }, [])

  // Re-shuffle and preload whenever songs load, duration, or limit changes (only outside a game)
  useEffect(() => {
    if (!songs || mode) return
    game.current = initGame(songs, clipDuration, limit)
  }, [songs, clipDuration, limit, mode])

  const handleBack = () => {
    setMode(null)
  }

  const handleLimitChange = (l) => {
    setLimit(l)
    if (l === null) localStorage.removeItem('limit')
    else localStorage.setItem('limit', l)
  }

  if (error) return <div className="error">Failed to load songs: {error}</div>
  if (!songs) return <div className="loading">Loading…</div>
  if (!mode) return (
    <ModeSelect
      onSelect={setMode}
      clipDuration={clipDuration}
      onDurationChange={d => { setClipDuration(d); localStorage.setItem('clipDuration', d) }}
      limit={limit}
      onLimitChange={handleLimitChange}
    />
  )
  return (
    <Game
      queue={game.current.queue}
      audioCache={game.current.audioCache}
      songs={songs}
      mode={mode}
      clipDuration={clipDuration}
      onBack={handleBack}
    />
  )
}
