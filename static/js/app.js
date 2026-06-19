// static/js/app.js (full replacement)
// Responsible for UI glue: search, speech-to-text, recommendations, and robust play behavior.

document.addEventListener('DOMContentLoaded', () => {

  // ---------- UI elements ----------
  const startCamBtn = document.getElementById('startCamBtn');
  const stopCamBtn = document.getElementById('stopCamBtn');
  const startVoiceBtn = document.getElementById('startVoiceBtn');
  const stopVoiceBtn = document.getElementById('stopVoiceBtn');

  const getRecoBtn = document.getElementById('getRecoBtn');
  const platformSelect = document.getElementById('platformSelect');
  const recoList = document.getElementById('recoList');
  const playerArea = document.getElementById('playerArea');

  // Search UI
  const searchQuery = document.getElementById('searchQuery');
  const searchPlatform = document.getElementById('searchPlatform');
  const searchBtn = document.getElementById('searchBtn');
  const searchResults = document.getElementById('searchResults');

  // Speech UI
  const listenBtn = document.getElementById('listenBtn');
  const listenStatus = document.getElementById('listenStatus');
  const transcriptEl = document.getElementById('transcript');

  // ---------- Exposed callbacks for face.js / voice.js ----------
  window.updateFaceMood = (m) => {
    const el = document.getElementById('faceMood'); if (el) el.innerText = m;
    updateCombined();
  };
  window.updateVoiceMood = (m) => {
    const el = document.getElementById('voiceMood'); if (el) el.innerText = m;
    updateCombined();
  };

  // ---------- Combined mood logic ----------
  function updateCombined(){
    const f = (document.getElementById('faceMood') || {}).innerText || 'neutral';
    const v = (document.getElementById('voiceMood') || {}).innerText || 'neutral';
    const priority = ['excited','happy','neutral','tired','stressed','sad','angry'];
    let combined = 'neutral';
    for (const p of priority) { if (f === p || v === p) { combined = p; break; } }
    const lm = document.getElementById('liveMood'); if (lm) lm.innerText = combined;
    // Send combined mood (non-blocking)
    fetch('/api/mood', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ mood: combined, source: 'combined' }) }).catch(()=>{});
  }

  // ---------- Speech recognition (Web Speech API) ----------
  let recognition = null;
  let listening = false;
  function initSpeechRecognition(){
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (listenStatus) listenStatus.innerText = 'Speech recognition not supported in this browser.';
      if (listenBtn) listenBtn.disabled = true;
      return null;
    }
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;

    r.onstart = () => {
      listening = true;
      if (listenStatus) listenStatus.innerText = 'Listening...';
      if (listenBtn) listenBtn.innerText = '🎙️ Listening';
      if (transcriptEl) transcriptEl.innerText = '';
    };
    r.onend = () => {
      listening = false;
      if (listenStatus) listenStatus.innerText = 'Click Listen to try again.';
      if (listenBtn) listenBtn.innerText = '🎤 Listen';
    };
    r.onerror = (evt) => {
      console.warn('Speech recognition error', evt);
      if (listenStatus) listenStatus.innerText = 'Recognition error: ' + (evt.error || 'unknown');
    };
    r.onresult = (ev) => {
      if (!ev.results || !ev.results[0]) return;
      const text = ev.results[0][0].transcript.trim();
      if (transcriptEl) transcriptEl.innerText = '"' + text + '"';
      // Fill search input and run search for currently selected searchPlatform
      if (searchQuery) searchQuery.value = text;
      doSearchForPlatform(searchPlatform.value);
    };
    return r;
  }
  recognition = initSpeechRecognition();

  if (listenBtn) {
    listenBtn.addEventListener('click', () => {
      if (!recognition) {
        if (listenStatus) listenStatus.innerText = 'Speech recognition not supported in this browser.';
        return;
      }
      try {
        if (listening) recognition.stop();
        else recognition.start();
      } catch (e) {
        console.warn('Speech recognition start error', e);
        if (listenStatus) listenStatus.innerText = 'Failed to start recognition.';
      }
    });
  }

  // ---------- Search handlers ----------
  if (searchBtn) searchBtn.addEventListener('click', () => { doSearchForPlatform(searchPlatform.value); });

  async function doSearchForPlatform(platform) {
    const q = (searchQuery.value || '').trim();
    if (!q) {
      searchResults.innerHTML = '<div class="muted">Type or speak a search phrase first.</div>';
      return;
    }
    searchResults.innerHTML = '<div class="muted">Searching...</div>';

    try {
      if (platform === 'youtube' || platform === 'ytmusic') {
        // YouTube search (server-side)
        const res = await fetch('/api/search_youtube', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ q })
        });
        const data = await res.json().catch(()=>({}));
        console.debug('YouTube search response', res.status, data);
        if (!res.ok) {
          const msg = data && data.error ? (data.error + (data.detail ? ': ' + data.detail : '')) : 'YouTube search failed';
          searchResults.innerHTML = `<div class="muted">Error: ${escapeHtml(msg)}</div>`;
          return;
        }
        if (data.results && data.results.length) {
          renderSearchResults(platform === 'ytmusic' ? 'ytmusic' : 'youtube', data.results);
          // Auto-play top result (user triggered search)
          playUrl(data.results[0].url || (data.results[0].videoId ? `https://www.youtube.com/watch?v=${data.results[0].videoId}` : ''));
        } else {
          searchResults.innerHTML = '<div class="muted">No YouTube results</div>';
        }
        return;
      }

      if (platform === 'spotify') {
        const res = await fetch('/api/search_spotify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ q })
        });
        const data = await res.json().catch(()=>({}));
        console.debug('Spotify search response', res.status, data);
        if (!res.ok) {
          const msg = data && data.error ? (data.error + (data.detail ? ': ' + data.detail : '')) : 'Spotify search failed';
          searchResults.innerHTML = `<div class="muted">Error: ${escapeHtml(msg)}</div>`;
          return;
        }
        if (data.results && data.results.length) {
          renderSearchResults('spotify', data.results);
          playUrl(data.results[0].url || (data.results[0].external_urls && data.results[0].external_urls.spotify) || '');
        } else {
          searchResults.innerHTML = '<div class="muted">No Spotify results</div>';
        }
        return;
      }

      searchResults.innerHTML = '<div class="muted">Unknown platform selected</div>';
    } catch (err) {
      console.error('Search exception', err);
      searchResults.innerHTML = `<div class="muted">Search failed: ${escapeHtml(err.message || String(err))}</div>`;
    }
  }

  function renderSearchResults(kind, list) {
    // kind: 'youtube' | 'ytmusic' | 'spotify'
    searchResults.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      searchResults.innerHTML = '<div class="muted">No results</div>';
      return;
    }
    list.forEach(item => {
      let title = item.title || item.name || item.track || 'Untitled';
      let subtitle = item.channel || item.artists || item.artists_name || '';
      let url = item.url || (item.external_urls && item.external_urls.spotify) || item.uri || '';
      if (!url && item.videoId) url = `https://www.youtube.com/watch?v=${item.videoId}`;

      const row = document.createElement('div');
      row.className = 'reco-card';
      row.innerHTML = `<div><strong>${escapeHtml(title)}</strong><div class="muted">${escapeHtml(subtitle)} • ${escapeHtml(kind)}</div></div>
                       <div><button class="btn playBtn">Play</button> <a class="link" href="${escapeAttr(url)}" target="_blank" rel="noopener">Open</a></div>`;
      searchResults.appendChild(row);

      const playBtn = row.querySelector('.playBtn');
      playBtn.addEventListener('click', () => {
        if (!url) {
          if (kind === 'spotify') window.open(`https://open.spotify.com/search/${encodeURIComponent(title)}`, '_blank');
          else window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`, '_blank');
          return;
        }
        playUrl(url);
      });
    });
  }

  // ---------- Recommendations (selected platform only) ----------
  if (getRecoBtn) {
    getRecoBtn.addEventListener('click', async () => {
      const mood = (document.getElementById('liveMood') || {}).innerText || 'neutral';
      const platform = platformSelect.value || 'youtube';
      recoList.innerHTML = '<div class="muted">Loading...</div>';
      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ mood, platform })
        });
        const data = await res.json().catch(()=>({}));
        renderRecommendations(data.recommendations || []);
      } catch (err) {
        console.error('Recommend error', err);
        recoList.innerHTML = '<div class="muted">Failed to load recommendations.</div>';
      }
    });
  }

  function renderRecommendations(list) {
    recoList.innerHTML = '';
    if (!list || !list.length) {
      recoList.innerHTML = '<div class="muted">No recommendations</div>';
      return;
    }
    list.forEach(r => {
      const div = document.createElement('div'); div.className = 'reco-card';
      const title = escapeHtml(r.title || '');
      const artist = escapeHtml(r.artist || r.channel || '');
      const url = r.url || '#';
      div.innerHTML = `<div><strong>${title}</strong><div class="muted">${artist} • ${escapeHtml(r.source||'')}</div></div>
                       <div><button class="btn playBtn">Play</button> <a class="link" href="${escapeAttr(url)}" target="_blank" rel="noopener">Open</a></div>`;
      recoList.appendChild(div);
      div.querySelector('.playBtn').addEventListener('click', ()=> playUrl(url));
    });
  }

  // ---------- Robust playUrl() ----------
  // Uses server-side embed check for YouTube, handles Spotify embed, direct media, and fallback to new tab
  async function playUrl(rawUrl) {
    if (!rawUrl) return;
    rawUrl = String(rawUrl);
    // Clear current player
    playerArea.innerHTML = '';

    try {
      const u = new URL(rawUrl);
      const host = u.hostname.toLowerCase();

      // YouTube cases
      let vid = null;
      if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('music.youtube.com')) {
        if (u.searchParams.get('v')) vid = u.searchParams.get('v');
        else if (host.includes('youtu.be')) vid = u.pathname.split('/').filter(Boolean)[0];
        else if (u.pathname.includes('/shorts/')) vid = u.pathname.split('/shorts/')[1].split('/')[0];
      }
      if (vid) {
        // Ask server whether this video is embeddable
        try {
          const res = await fetch('/api/check_youtube', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ videoId: vid })
          });
          const j = await res.json().catch(()=>({}));
          if (res.ok && j.embeddable) {
            const src = `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`;
            const iframe = document.createElement('iframe');
            iframe.width = '100%'; iframe.height = '360'; iframe.src = src; iframe.frameBorder = '0';
            iframe.allow = 'autoplay; encrypted-media; fullscreen'; iframe.allowFullscreen = true;
            playerArea.appendChild(iframe);
            setTimeout(()=> {
              const fallback = document.createElement('div'); fallback.style.marginTop='8px'; fallback.className='muted';
              fallback.innerHTML = `If the video did not start, <a class="link" href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener">open on YouTube</a>.`;
              if (!playerArea.querySelector('.muted')) playerArea.appendChild(fallback);
            }, 1200);
            return;
          } else {
            // Not embeddable or server couldn't verify — open watch page
            window.open(`https://www.youtube.com/watch?v=${vid}`, '_blank', 'noopener');
            return;
          }
        } catch (err) {
          console.warn('Embed check failed, opening watch page', err);
          window.open(`https://www.youtube.com/watch?v=${vid}`, '_blank', 'noopener');
          return;
        }
      }

      // Spotify track embed
      if (host.includes('spotify.com') || host.includes('open.spotify.com')) {
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('track');
        if (idx !== -1 && parts[idx+1]) {
          const id = parts[idx+1];
          const src = `https://open.spotify.com/embed/track/${id}`;
          const iframe = document.createElement('iframe');
          iframe.width = '100%'; iframe.height = '200'; iframe.src = src;
          iframe.frameBorder = '0'; iframe.allow = 'autoplay; encrypted-media; fullscreen'; iframe.allowFullscreen = true;
          playerArea.appendChild(iframe);
          setTimeout(()=> {
            const fallback = document.createElement('div'); fallback.style.marginTop='8px'; fallback.className='muted';
            fallback.innerHTML = `If playback didn't start, <a class="link" href="${rawUrl}" target="_blank" rel="noopener">open on Spotify</a>.`;
            if (!playerArea.querySelector('.muted')) playerArea.appendChild(fallback);
          }, 1200);
          return;
        }
      }

      // Direct media fallback (.mp3 .wav .mp4 .webm)
      const pathLower = u.pathname.toLowerCase();
      if (pathLower.endsWith('.mp3') || pathLower.endsWith('.wav') || pathLower.endsWith('.ogg')) {
        const audio = document.createElement('audio'); audio.controls = true; audio.autoplay = true; audio.src = rawUrl;
        playerArea.appendChild(audio); return;
      }
      if (pathLower.endsWith('.mp4') || pathLower.endsWith('.webm')) {
        const video = document.createElement('video'); video.controls = true; video.autoplay = true; video.width = playerArea.clientWidth || 640; video.src = rawUrl;
        playerArea.appendChild(video); return;
      }

      // Unknown URL: open in a new tab
      window.open(rawUrl, '_blank', 'noopener');
    } catch (err) {
      console.warn('playUrl parse error', err);
      window.open(rawUrl, '_blank', 'noopener');
    }
  }

  // ---------- Utility helpers ----------
  function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
  function escapeAttr(s){ return (s||'').replace(/"/g, '&quot;'); }

  // ---------- Wire camera & mic buttons (face.js / voice.js) ----------
  startCamBtn && startCamBtn.addEventListener('click', ()=>{ if (window.startCamera) window.startCamera(); });
  stopCamBtn && stopCamBtn.addEventListener('click', ()=>{ if (window.stopCamera) window.stopCamera(); if (document.getElementById('faceMood')) document.getElementById('faceMood').innerText='off'; });

  startVoiceBtn && startVoiceBtn.addEventListener('click', ()=>{ if (window.initVoiceCapture) window.initVoiceCapture(); });
  stopVoiceBtn && stopVoiceBtn.addEventListener('click', ()=>{ if (window.stopVoice) window.stopVoice(); if (document.getElementById('voiceMood')) document.getElementById('voiceMood').innerText='stopped'; });

  // ---------- End of DOMContentLoaded ----------
});
