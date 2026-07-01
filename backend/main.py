import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

STATIC = Path(__file__).parent / "static"
VALID_DURATIONS = {"0.25", "0.5", "1", "2"}

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_songs: list[dict] = json.loads((STATIC / "songs.json").read_text())
_song_map: dict[str, dict] = {s["id"]: s for s in _songs}


@app.get("/api/songs")
def list_songs():
    return _songs


@app.get("/api/songs/{sid}/clip/{duration}")
def get_clip(sid: str, duration: str):
    if duration not in VALID_DURATIONS:
        raise HTTPException(status_code=400, detail=f"duration must be one of {sorted(VALID_DURATIONS)}")
    if sid not in _song_map:
        raise HTTPException(status_code=404, detail="Song not found")
    clip = STATIC / "clips" / f"{sid}_{duration}.mp3"
    if not clip.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    return FileResponse(str(clip), media_type="audio/mpeg", headers={"Cache-Control": "no-cache"})


@app.get("/api/songs/{sid}/art")
def get_art(sid: str):
    if sid not in _song_map:
        raise HTTPException(status_code=404, detail="Song not found")
    art = STATIC / "art" / f"{sid}.jpg"
    if not art.exists():
        raise HTTPException(status_code=404, detail="No album art")
    return FileResponse(str(art), media_type="image/jpeg")
