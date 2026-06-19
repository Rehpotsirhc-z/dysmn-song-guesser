const DURATIONS = [0.25, 0.5, 1, 2]

export default function ModeSelect({ onSelect, clipDuration, onDurationChange }) {
  return (
    <div className="mode-select">
      <img className="logo" src="/Dysmn.png" alt="Dysmn" />
      <h1>Dysmn Song Guesser</h1>

      <div className="duration-select">
        <span className="duration-label">Clip length</span>
        <div className="duration-options">
          {DURATIONS.map(d => (
            <button
              key={d}
              className={`duration-btn${clipDuration === d ? ' active' : ''}`}
              onClick={() => onDurationChange(d)}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>

      <div className="modes">
        <button onClick={() => onSelect('type')}>
          <strong>Type it in</strong>
          <span>Enter the song name from memory</span>
        </button>
        <button onClick={() => onSelect('list')}>
          <strong>Pick from a list</strong>
          <span>Choose from 4 options</span>
        </button>
      </div>
    </div>
  )
}
