import { useState, useEffect, useRef, useCallback } from 'react'

const ChevronLeft = () => (
  <svg width="0.75em" height="0.75em" viewBox="0 0 10 10" fill="none"
       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 1L3 5l4 4"/>
  </svg>
)

const ChevronRight = () => (
  <svg width="0.75em" height="0.75em" viewBox="0 0 10 10" fill="none"
       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 1l4 4-4 4"/>
  </svg>
)

const PlayIcon = () => (
  <svg width="0.75em" height="0.75em" viewBox="0 0 10 10" fill="currentColor">
    <polygon points="2,1 9,5 2,9"/>
  </svg>
)

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
  const [phase, setPhase] = useState('answering') // 'answering' | 'revealed' | 'summary'
  const [answer, setAnswer] = useState('')
  const [choices, setChoices] = useState([])
  const [selected, setSelected] = useState(null)
  const [correct, setCorrect] = useState(0)
  const [results, setResults] = useState([]) // [{song, correct}]
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

  const advanceOrFinish = () => {
    if (isLast) {
      setPhase('summary')
    } else {
      setIndex(i => i + 1)
    }
  }

  const handleListChoice = (choice) => {
    setSelected(choice.id)
    const wasCorrect = choice.id === current.id
    if (wasCorrect) setCorrect(n => n + 1)
    setResults(r => [...r, { song: current, correct: wasCorrect }])
    reveal()
  }

  const handleSelfScore = (wasCorrect) => {
    if (wasCorrect) setCorrect(n => n + 1)
    setResults(r => [...r, { song: current, correct: wasCorrect }])
    advanceOrFinish()
  }

  const choiceClass = (choice) => {
    if (phase !== 'revealed') return ''
    if (choice.id === current.id) return 'correct'
    if (choice.id === selected) return 'wrong'
    return 'dimmed'
  }

  if (phase === 'summary') {
    const total = results.length
    const numCorrect = results.filter(r => r.correct).length
    const pct = total > 0 ? Math.round(numCorrect / total * 100) : 0
    return (
      <div className="summary">
        <div className="summary-score">
          <span className="summary-fraction">{numCorrect} / {total} ({clipDuration} s)</span>
          <span className="summary-pct">{pct}%</span>
        </div>
        <div className="summary-list">
          {results.map((r, i) => (
            <div key={i} className={`summary-item ${r.correct ? 'correct' : 'wrong'}`}>
              <span className="summary-verdict">{r.correct ? '✓' : '✗'}</span>
              {r.song.has_art
                ? <img src={`/api/songs/${r.song.id}/art`} alt="" />
                : <div className="summary-no-art">♪</div>
              }
              <div className="summary-info">
                <strong>{r.song.title}</strong>
                <span>{r.song.album}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="summary-back" onClick={onBack}>Back to Menu</button>
      </div>
    )
  }

  return (
    <div>
      <div className="game-header">
        <button onClick={onBack}><ChevronLeft /> Back</button>
        <span className="progress">{index + 1} / {queue.length}</span>
        {results.length > 0
          ? <span className="score">{correct} / {results.length}</span>
          : <span />
        }
      </div>

      <button className="play-btn" onClick={playClip}><PlayIcon /> Play clip</button>

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

            {mode === 'list' ? (
              <button className="next-btn" onClick={advanceOrFinish}>
                {isLast ? 'See Results' : <>Next <ChevronRight /></>}
              </button>
            ) : (
              <>
                {answer && <p className="your-guess">You said: "{answer}"</p>}
                <div className="self-score">
                  <button className="got-it" onClick={() => handleSelfScore(true)}>✓ Got it</button>
                  <button className="missed" onClick={() => handleSelfScore(false)}>✗ Missed it</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
