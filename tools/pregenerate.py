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
    except Exception:
        title, album = path.stem, "Unknown Album"
    return str(title), str(album)


def make_clip(src: Path, dest: Path, duration: float):
    if dest.exists():
        return
    result = subprocess.run(
        ["ffmpeg", "-y", "-t", str(duration), "-i", str(src),
         "-map", "0:a", "-acodec", "libmp3lame", "-q:a", "2", str(dest)],
        capture_output=True,
    )
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

            # Clips
            for dur in DURATIONS:
                ds = dur_str(dur)
                dest = CLIPS_DIR / f"{sid}_{ds}.mp3"
                make_clip(track, dest, dur)

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
