import { useState, useEffect, useRef, useCallback } from 'react'

const PRELOAD_AHEAD = 3

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getChoices(songs, correct) {
  const others = songs.filter(s => s.id !== correct.id)
  return shuffle([correct, ...shuffle(others).slice(0, 3)])
}

function makeAudio(id, duration) {
  const a = new Audio(`/api/songs/${id}/clip/${duration}`)
  a.preload = 'auto'
  return a
}

export default function Game({ queue, audioCache, songs, mode, clipDuration, onBack }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('answering')
  const [answer, setAnswer] = useState('')
  const [choices, setChoices] = useState([])
  const [selected, setSelected] = useState(null)
  const [correct, setCorrect] = useState(0)
  const currentAudio = useRef(null)

  const current = queue[index]
  const isLast = index >= queue.length - 1

  function ensureLoaded(song) {
    if (!audioCache.has(song.id)) audioCache.set(song.id, makeAudio(song.id, clipDuration))
    return audioCache.get(song.id)
  }

  const playClip = useCallback(() => {
    const audio = currentAudio.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }, [])

  useEffect(() => {
    currentAudio.current = ensureLoaded(current)
    queue.slice(index + 1, index + 1 + PRELOAD_AHEAD).forEach(s => ensureLoaded(s))
    playClip()
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPhase('answering')
    setAnswer('')
    setSelected(null)
    if (mode === 'list') setChoices(getChoices(songs, current))
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = () => setPhase('revealed')

  const handleListChoice = (choice) => {
    setSelected(choice.id)
    if (choice.id === current.id) setCorrect(n => n + 1)
    reveal()
  }

  const handleNext = () => {
    if (isLast) {
      onBack()
    } else {
      setIndex(i => i + 1)
    }
  }

  const choiceClass = (choice) => {
    if (phase !== 'revealed') return ''
    if (choice.id === current.id) return 'correct'
    if (choice.id === selected) return 'wrong'
    return 'dimmed'
  }

  return (
    <div>
      <div className="game-header">
        <button onClick={onBack}>← Back</button>
        <span className="progress">{index + 1} / {queue.length}</span>
        {mode === 'list' && (
          <span className="score">{correct} / {phase === 'revealed' ? index + 1 : index}</span>
        )}
      </div>

      <button className="play-btn" onClick={playClip}>▶ Play clip</button>

      {phase === 'answering' && (
        mode === 'type' ? (
          <form className="type-form" onSubmit={e => { e.preventDefault(); reveal() }}>
            <input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Song title…"
              autoFocus
            />
            <button type="submit">Submit</button>
          </form>
        ) : (
          <div className="choices">
            {choices.map(c => (
              <button key={c.id} onClick={() => handleListChoice(c)}>
                {c.title}
              </button>
            ))}
          </div>
        )
      )}

      {phase === 'revealed' && (
        <>
          {mode === 'list' && (
            <div className="choices">
              {choices.map(c => (
                <button key={c.id} className={choiceClass(c)} disabled>
                  {c.title}
                </button>
              ))}
            </div>
          )}

          <div className="reveal">
            {current.has_art
              ? <img src={`/api/songs/${current.id}/art`} alt="Album art" />
              : <div className="no-art">♪</div>
            }
            <h2>{current.title}</h2>
            <p className="album-name">{current.album}</p>

            {mode === 'list' && (
              <p className={`verdict ${selected === current.id ? 'correct' : 'wrong'}`}>
                {selected === current.id ? '✓ Correct!' : '✗ Wrong'}
              </p>
            )}

            <button className="next-btn" onClick={handleNext}>
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
