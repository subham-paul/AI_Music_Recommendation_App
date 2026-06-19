"""
app.py — Flask backend that reads API keys from environment variables.
- Do NOT hardcode API keys here. Set env vars before running.
- Endpoints:
    GET  /, /dashboard, /about, /contact
    POST /api/mood
    GET  /api/mood/history
    POST /api/search_youtube
    POST /api/search_spotify
    POST /api/recommend
    POST /api/check_youtube
    GET  /api/debug_youtube_auto
    GET  /api/debug_spotify
"""

import os
import base64
import time
import urllib.parse
from datetime import datetime
from typing import Optional, Dict, Any
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# In-memory mood history (demo)
mood_history = []

# Read keys from environment (set them in your shell; do not store in code)
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
# Simple Spotify token cache
_spotify_token_cache: Dict[str, Any] = {"access_token": None, "expires_at": 0}


def get_spotify_token() -> Optional[str]:
    """Request and cache Spotify Client Credentials token."""
    if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET):
        app.logger.info("Spotify credentials missing: SPOTIFY_CLIENT_ID=%s, SPOTIFY_CLIENT_SECRET=%s",
                        bool(SPOTIFY_CLIENT_ID), bool(SPOTIFY_CLIENT_SECRET))
        return None
    now = int(time.time())
    # return cached if still valid
    if _spotify_token_cache.get("access_token") and _spotify_token_cache.get("expires_at", 0) > now + 10:
        return _spotify_token_cache["access_token"]

    token_url = "https://accounts.spotify.com/api/token"
    auth = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
    b64 = base64.b64encode(auth.encode("utf-8")).decode("utf-8")
    headers = {"Authorization": f"Basic {b64}", "Content-Type": "application/x-www-form-urlencoded"}
    data = {"grant_type": "client_credentials"}

    try:
        resp = requests.post(token_url, data=data, headers=headers, timeout=10)
        app.logger.info("Spotify token fetch status: %s", resp.status_code)
        app.logger.debug("Spotify token response (truncated): %s", resp.text[:400])
        resp.raise_for_status()
        j = resp.json()
        token = j.get("access_token")
        expires_in = j.get("expires_in", 3600)
        _spotify_token_cache["access_token"] = token
        _spotify_token_cache["expires_at"] = int(time.time()) + int(expires_in)
        return token
    except Exception as e:
        app.logger.exception("Failed to fetch Spotify token: %s", str(e)[:400])
        return None


def youtube_search(q: str, max_results: int = 6):
    """Server-side YouTube search using YOUTUBE_API_KEY."""
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY not configured")
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "q": q,
        "type": "video",
        "maxResults": max_results,
        "key": YOUTUBE_API_KEY
    }
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    items = []
    for it in data.get("items", []):
        vid = None
        if isinstance(it.get("id"), dict):
            vid = it["id"].get("videoId")
        snip = it.get("snippet", {})
        if not vid:
            continue
        items.append({
            "title": snip.get("title"),
            "channel": snip.get("channelTitle"),
            "videoId": vid,
            "url": f"https://www.youtube.com/watch?v={vid}"
        })
    return items


def spotify_search(q: str, max_results: int = 6):
    """Server-side Spotify search using Client Credentials token."""
    token = get_spotify_token()
    if not token:
        raise RuntimeError("Spotify credentials not configured or token fetch failed")
    headers = {"Authorization": f"Bearer {token}"}
    params = {"q": q, "type": "track", "limit": max_results}
    resp = requests.get("https://api.spotify.com/v1/search", headers=headers, params=params, timeout=10)
    # Log status and snippet for debug
    app.logger.info("Spotify search status=%s for q=%s", resp.status_code, q)
    app.logger.debug("Spotify search body (truncated): %s", resp.text[:400])
    resp.raise_for_status()
    j = resp.json()
    tracks = []
    for t in j.get("tracks", {}).get("items", []):
        artists = ", ".join([a["name"] for a in t.get("artists", [])])
        url = t.get("external_urls", {}).get("spotify")
        tracks.append({"title": t.get("name"), "artists": artists, "url": url})
    return tracks


# ---------- Routes ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/contact")
def contact():
    return render_template("contact.html")


@app.route("/api/mood", methods=["POST"])
def receive_mood():
    data = request.get_json() or {}
    mood = data.get("mood")
    source = data.get("source", "client")
    entry = {"mood": mood, "source": source, "timestamp": datetime.utcnow().isoformat() + "Z"}
    mood_history.append(entry)
    if len(mood_history) > 200:
        mood_history.pop(0)
    return jsonify({"status": "ok", "entry": entry})


@app.route("/api/mood/history", methods=["GET"])
def get_history():
    return jsonify(mood_history)


@app.route("/api/search_youtube", methods=["POST"])
def api_search_youtube():
    body = request.get_json() or {}
    q = body.get("q", "").strip()
    if not q:
        return jsonify({"error": "q required"}), 400
    if not YOUTUBE_API_KEY:
        return jsonify({"error": "YOUTUBE_API_KEY not configured on server"}), 503
    try:
        items = youtube_search(q, max_results=8)
        return jsonify({"results": items})
    except requests.HTTPError as e:
        resp_text = ""
        try:
            resp_text = e.response.text[:800]
        except Exception:
            resp_text = str(e)[:800]
        app.logger.warning("YouTube HTTPError: %s", resp_text)
        return jsonify({"error": "YouTube API request failed", "status": e.response.status_code, "body": resp_text}), 500
    except Exception as e:
        app.logger.exception("YouTube search failed")
        return jsonify({"error": "YouTube search failed", "detail": str(e)}), 500


@app.route("/api/search_spotify", methods=["POST"])
def api_search_spotify():
    body = request.get_json() or {}
    q = body.get("q", "").strip()
    if not q:
        return jsonify({"error": "q required"}), 400
    try:
        items = spotify_search(q, max_results=8)
        return jsonify({"results": items})
    except RuntimeError as re:
        app.logger.warning("Spotify configuration/runtime error: %s", str(re))
        return jsonify({"error": "spotify_not_configured", "detail": str(re)}), 503
    except requests.HTTPError as e:
        resp_text = ""
        try:
            resp_text = e.response.text[:800]
        except Exception:
            resp_text = str(e)[:800]
        app.logger.warning("Spotify HTTPError: %s", resp_text)
        return jsonify({"error": "Spotify API request failed", "status": e.response.status_code, "body": resp_text}), 500
    except Exception as e:
        app.logger.exception("Spotify search failed")
        return jsonify({"error": "Spotify search failed", "detail": str(e)}), 500


@app.route("/api/recommend", methods=["POST"])
def recommend():
    data = request.get_json() or {}
    mood = data.get("mood", "neutral")
    platform = data.get("platform", "youtube")

    # Prefer using real APIs when credentials available
    if platform == "youtube" and YOUTUBE_API_KEY:
        qmap = {
            "happy": "happy upbeat songs",
            "excited": "party songs playlist",
            "sad": "sad songs",
            "tired": "relaxing calm songs",
            "angry": "angry rock songs",
            "stressed": "calming instrumental",
            "neutral": "top chart songs"
        }
        q = qmap.get(mood, "top chart songs")
        try:
            items = youtube_search(q, max_results=6)
            recs = [{"title": it["title"], "artist": it["channel"], "source": "youtube", "url": it["url"]} for it in items]
            return jsonify({"mood": mood, "platform": platform, "recommendations": recs})
        except Exception:
            app.logger.exception("youtube recommend failed")

    if platform in ("spotify", "ytmusic") and SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
        qmap = {
            "happy": "happy upbeat",
            "excited": "party",
            "sad": "sad",
            "tired": "chill relaxing",
            "angry": "rock",
            "stressed": "ambient relaxing",
            "neutral": "top hits"
        }
        q = qmap.get(mood, "top hits")
        try:
            items = spotify_search(q, max_results=6)
            recs = [{"title": it["title"], "artist": it["artists"], "source": "spotify", "url": it["url"]} for it in items]
            return jsonify({"mood": mood, "platform": platform, "recommendations": recs})
        except Exception:
            app.logger.exception("spotify recommend failed")

    # fallback mock list
    mock = []
    if mood in ["happy", "excited"]:
        mock = [
            {"title": "Pharrell Williams - Happy", "artist": "Pharrell", "source": platform,
             "url": "https://www.youtube.com/watch?v=ZbZSe6N_BXs"},
            {"title": "Bruno Mars - Uptown Funk", "artist": "Bruno Mars", "source": platform,
             "url": "https://www.youtube.com/watch?v=OPf0YbXqDm0"}
        ]
    elif mood in ["sad", "tired"]:
        mock = [
            {"title": "Adele - Someone Like You", "artist": "Adele", "source": platform,
             "url": "https://www.youtube.com/watch?v=hLQl3WQQoQ0"},
            {"title": "Coldplay - Fix You", "artist": "Coldplay", "source": platform,
             "url": "https://www.youtube.com/watch?v=k4V3Mo61fJM"}
        ]
    elif mood == "angry":
        mock = [
            {"title": "Metallica - Nothing Else Matters", "artist": "Metallica", "source": platform,
             "url": "https://www.youtube.com/watch?v=tAGnKpE4NCI"}
        ]
    else:
        mock = [
            {"title": "Top Chill Track", "artist": "Various", "source": platform,
             "url": "https://www.youtube.com/watch?v=3tmd-ClpJxA"},
            {"title": "Spotify demo track", "artist": "Demo", "source": "spotify",
             "url": "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl"}
        ]
    return jsonify({"mood": mood, "platform": platform, "recommendations": mock})


# Add to app.py (requires YOUTUBE_API_KEY env var to be set)
@app.route("/api/check_youtube", methods=["POST"])
def api_check_youtube():
    """
    Request body: {"videoId": "VIDEO_ID"}
    Response: {"videoId":"...", "embeddable": true/false, "reason": "..." (optional)}
    """
    data = request.get_json() or {}
    vid = data.get("videoId")
    if not vid:
        return jsonify({"error": "videoId required"}), 400
    if not YOUTUBE_API_KEY:
        return jsonify({"error": "YOUTUBE_API_KEY not configured"}), 503

    try:
        url = "https://www.googleapis.com/youtube/v3/videos"
        params = {"part": "status", "id": vid, "key": YOUTUBE_API_KEY}
        resp = requests.get(url, params=params, timeout=8)
        resp.raise_for_status()
        j = resp.json()
        items = j.get("items", [])
        if not items:
            return jsonify({"videoId": vid, "embeddable": False, "reason": "video_not_found"}), 200
        status = items[0].get("status", {})
        embeddable = status.get("embeddable", False)
        return jsonify({"videoId": vid, "embeddable": bool(embeddable), "status": status}), 200
    except Exception as e:
        app.logger.exception("YouTube embed check failed")
        return jsonify({"error": "youtube_check_failed", "detail": str(e)}), 500


@app.route('/api/debug_youtube_auto', methods=['GET'])
def api_debug_youtube_auto():
    """
    Automatically checks:
    - Whether YOUTUBE_API_KEY is loaded on the server.
    - Builds the YouTube API query URL (key masked).
    - Sends a real request to Google and returns full error info (truncated).
    Open in browser: /api/debug_youtube_auto
    """
    q = "Sanam Teri Kasam"  # auto test query
    has_key = bool(YOUTUBE_API_KEY)
    params = {
        'part': 'snippet',
        'q': q,
        'type': 'video',
        'maxResults': 2,
    }
    base = "https://www.googleapis.com/youtube/v3/search"
    url_no_key = base + "?" + urllib.parse.urlencode(params)
    masked_url = url_no_key + "&key=" + ("***MASKED***" if has_key else "***MISSING***")

    try:
        params_with_key = params.copy()
        if has_key:
            params_with_key['key'] = YOUTUBE_API_KEY

        r = requests.get(base, params=params_with_key, timeout=8)

        # Return a safe, truncated response (no key exposure)
        return jsonify({
            'has_key_on_server': has_key,
            'test_query': q,
            'request_url_masked': masked_url,
            'response_status_code': r.status_code,
            'response_text': r.text[:800]
        }), 200

    except Exception as e:
        return jsonify({
            'has_key_on_server': has_key,
            'test_query': q,
            'request_url_masked': masked_url,
            'error': str(e)
        }), 500


# ---------- NEW: Spotify debug endpoint ----------
@app.route('/api/debug_spotify', methods=['GET'])
def api_debug_spotify():
    """
    Diagnostic endpoint for Spotify credentials & token.
    Returns:
      - presence of client id/secret
      - whether a token could be acquired
      - a truncated test search response (if token acquired)
    """
    info = {
        'has_client_id': bool(SPOTIFY_CLIENT_ID),
        'has_client_secret': bool(SPOTIFY_CLIENT_SECRET),
    }
    try:
        token = get_spotify_token()
        info['token_acquired'] = bool(token)
    except Exception as e:
        info['token_acquired'] = False
        info['token_error'] = str(e)[:400]

    # attempt quick search if token exists
    try:
        if info.get('token_acquired'):
            # use current token
            hdr = {'Authorization': 'Bearer ' + get_spotify_token()}
            res = requests.get('https://api.spotify.com/v1/search', headers=hdr, params={'q': 'Sanam Teri Kasam', 'type': 'track', 'limit': 1}, timeout=8)
            info['search_status_code'] = res.status_code
            info['search_body_snippet'] = res.text[:800]
        else:
            info['search_status_code'] = 'skipped - no token'
    except Exception as e:
        info['search_status_code'] = 'error'
        info['search_error'] = str(e)[:400]

    return jsonify(info)


# Static files route (Flask already serves /static)
@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(os.path.join(app.root_path, "static"), filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=True)
