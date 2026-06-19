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

function initGame(songs, clipDuration) {
  const queue = shuffle(songs)
  const audioCache = new Map()
  queue.slice(0, PRELOAD_AHEAD + 1).forEach(s => audioCache.set(s.id, makeAudio(s.id, clipDuration)))
  return { queue, audioCache }
}

export default function App() {
  const [songs, setSongs] = useState(null)
  const [mode, setMode] = useState(null)
  const [clipDuration, setClipDuration] = useState(1)
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

  // Re-shuffle and preload whenever songs load or duration changes (only outside a game)
  useEffect(() => {
    if (!songs || mode) return
    game.current = initGame(songs, clipDuration)
  }, [songs, clipDuration, mode])

  const handleBack = () => {
    setMode(null) // mode→null triggers the effect above to reshuffle + preload
  }

  if (error) return <div className="error">Failed to load songs: {error}</div>
  if (!songs) return <div className="loading">Loading…</div>
  if (!mode) return (
    <ModeSelect
      onSelect={setMode}
      clipDuration={clipDuration}
      onDurationChange={setClipDuration}
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
