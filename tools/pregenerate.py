#!/usr/bin/env python3
"""
Pre-generate all clip durations and album art from the music library.
Run once inside the container while /music is mounted:
    python tools/pregenerate.py

Output:
    backend/static/songs.json
    backend/static/clips/{sid}_{duration}.mp3
    backend/static/art/{sid}.jpg
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

MUSIC_DIR = Path(os.environ.get("MUSIC_DIR", "/music"))
STATIC = Path(__file__).parent.parent / "backend" / "static"
CLIPS_DIR = STATIC / "clips"
ART_DIR = STATIC / "art"
DURATIONS = [0.25, 0.5, 1, 2]

SILENCE_NOISE   = "-30dB"  # -30 dBFS: treats near-silence/brief clicks as silence so we skip past them
SILENCE_MIN_DUR = "0.1"   # 100 ms minimum silence run; shorter gaps are musical rests, not intro silence
SCAN_WINDOW     = 30.0    # only analyse the first 30 s per track


def song_id(path: Path) -> str:
    return hashlib.md5(str(path).encode()).hexdigest()[:12]


def read_tags(path: Path) -> tuple[str, str]:
    try:
        suffix = path.suffix.lower()
        if suffix == ".flac":
            from mutagen.flac import FLAC
            audio = FLAC(str(path))
            title = audio.get("title", [path.stem])[0]
            album = audio.get("album", ["Unknown Album"])[0]
        elif suffix in (".m4a", ".aac", ".mp4"):
            from mutagen.mp4 import MP4
            audio = MP4(str(path))
            title = str(audio.get("\xa9nam", [path.stem])[0])
            album = str(audio.get("\xa9alb", ["Unknown Album"])[0])
        else:
            title, album = path.stem, "Unknown Album"
        return str(title), str(album)
    except Exception as e:
        print(f"  WARN: could not read tags for {path.name}: {e}", file=sys.stderr)
        return path.stem, "Unknown Album"


def find_silence_intervals(src: Path) -> list[tuple[float, float]]:
    """Return (start, end) silence intervals within the first SCAN_WINDOW seconds."""
    result = subprocess.run(
        [
            "ffmpeg", "-t", str(SCAN_WINDOW), "-i", str(src),
            "-af", f"silencedetect=n={SILENCE_NOISE}:d={SILENCE_MIN_DUR}",
            "-f", "null", "-",
        ],
        capture_output=True,
    )
    stderr = result.stderr.decode(errors="replace")
    intervals: list[tuple[float, float]] = []
    pending_start: float | None = None
    for line in stderr.splitlines():
        if "silence_start:" in line:
            try:
                pending_start = float(line.split("silence_start:")[-1].strip())
            except ValueError:
                pending_start = None
        elif "silence_end:" in line and pending_start is not None:
            try:
                end_str = line.split("silence_end:")[-1].split("|")[0].strip()
                intervals.append((pending_start, float(end_str)))
                pending_start = None
            except ValueError:
                pending_start = None
    # If pending_start is still set, silence ran past scan window — omit the incomplete interval
    return intervals


def find_start(intervals: list[tuple[float, float]], clip_duration: float) -> float:
    """Return earliest t >= 0 where clip_duration seconds of non-silent audio begin.
    Falls back to 0.0 if no suitable position is found."""
    if not intervals:
        return 0.0
    sorted_ivs = sorted(intervals)
    if sorted_ivs[0][0] > 0.0:
        return 0.0  # track starts with audio — no shift needed

    cursor = 0.0
    for s_start, s_end in sorted_ivs:
        if s_start > cursor:
            if s_start - cursor >= clip_duration:
                return cursor
        if s_end > cursor:
            cursor = s_end

    # Non-silent tail after the last silence
    if SCAN_WINDOW - cursor >= clip_duration:
        return cursor

    return 0.0  # fallback


def make_clip(src: Path, dest: Path, duration: float, start: float = 0.0):
    if dest.exists():
        return
    cmd = ["ffmpeg", "-y"]
    if start > 0.0:
        cmd += ["-ss", str(start)]
    cmd += ["-t", str(duration), "-i", str(src),
            "-map", "0:a", "-acodec", "libmp3lame", "-q:a", "2", str(dest)]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        print(f"  WARN: ffmpeg failed for {src.name}: {result.stderr.decode()[:200]}", file=sys.stderr)


def dur_str(d: float) -> str:
    # "1.0" -> "1", "0.5" -> "0.5", "0.25" -> "0.25"
    return str(d).rstrip("0").rstrip(".") if "." in str(d) else str(d)


def main():
    if not MUSIC_DIR.exists():
        sys.exit(f"MUSIC_DIR {MUSIC_DIR} not found")

    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    ART_DIR.mkdir(parents=True, exist_ok=True)

    songs = []
    album_dirs = sorted(d for d in MUSIC_DIR.iterdir() if d.is_dir())
    total_albums = len(album_dirs)

    for album_idx, album_dir in enumerate(album_dirs, 1):
        cover = album_dir / "cover.jpg"
        tracks = sorted(
            t for t in album_dir.iterdir()
            if t.suffix.lower() in (".flac", ".m4a", ".aac", ".mp4")
        )
        if not tracks:
            continue

        print(f"[{album_idx}/{total_albums}] {album_dir.name} ({len(tracks)} tracks)")

        for track in tracks:
            sid = song_id(track)
            title, album = read_tags(track)

            # Determine which clips need generating, then run silencedetect once if any do
            missing = [
                (dur, CLIPS_DIR / f"{sid}_{dur_str(dur)}.mp3")
                for dur in DURATIONS
                if not (CLIPS_DIR / f"{sid}_{dur_str(dur)}.mp3").exists()
            ]
            if missing:
                intervals = find_silence_intervals(track)
                for dur, dest in missing:
                    start = find_start(intervals, dur)
                    make_clip(track, dest, dur, start)

            # Art — copy cover.jpg for each track so the per-song art endpoint works
            art_dest = ART_DIR / f"{sid}.jpg"
            if not art_dest.exists() and cover.exists():
                shutil.copy2(cover, art_dest)

            songs.append({
                "id": sid,
                "title": title,
                "album": album,
                "has_art": cover.exists(),
            })

    songs_json = STATIC / "songs.json"
    songs_json.write_text(json.dumps(songs, ensure_ascii=False, indent=2))

    print(f"\nDone: {len(songs)} songs, {len(DURATIONS)} durations each")
    print(f"  clips: {len(list(CLIPS_DIR.glob('*.mp3')))} files")
    print(f"  art:   {len(list(ART_DIR.glob('*.jpg')))} files")
    print(f"  songs.json: {songs_json}")


if __name__ == "__main__":
    main()
