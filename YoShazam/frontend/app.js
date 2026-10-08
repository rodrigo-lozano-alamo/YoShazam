(() => {
  const API_BASE = window.__YOSHAZAM_BACKEND_BASE__ || `${window.location.protocol}//${window.location.hostname}:3001`;
  const STORAGE = {
    session: 'yoshazam.spotify.session',
    playlist: 'yoshazam.spotify.selectedPlaylist',
    playerName: 'yoshazam.player.name',
    roomCode: 'yoshazam.room.code',
  };
  const ROUND_SECONDS = 15;
  const AVATAR_COLORS = ['#c6ff3d', '#ff3ea5', '#22e1ff', '#ff8a3d', '#ffd23f', '#a78bfa', '#6dffb0'];

  const app = document.getElementById('app');
  const toastRoot = document.getElementById('toast-root');
  let socketRetryId = null;
  let toastTimer = null;

  const state = {
    session: loadJson(STORAGE.session),
    selectedPlaylist: loadJson(STORAGE.playlist),
    playlists: [],
    playlistsLoading: false,
    playlistsError: '',
    playerName: safeGet(STORAGE.playerName),
    roomCodeInput: safeGet(STORAGE.roomCode),
    room: null,
    currentRound: null,
    secondsLeft: ROUND_SECONDS,
    selectedAnswer: '',
    guessLocked: false,
    guessResult: null,
    lastCorrectAnswer: '',
    socket: null,
    socketConnected: false,
    finalRanking: [],
    roundTimer: null,
    audio: null,
    audioPlaying: false,
    audioBlocked: false,
  };

  init();

  function init() {
    hydrateSpotifyCallback();

    if (state.session && !isSessionFresh(state.session)) {
      clearSession();
      safeRemove(STORAGE.playlist);
      state.session = null;
      state.selectedPlaylist = null;
      showToast('Tu sesión de Spotify ha caducado. Vuelve a entrar.', 'bad');
    }

    connectSocket();
    if (state.session) {
      loadPlaylists();
    }
    render();
  }

  function hydrateSpotifyCallback() {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const spotifyError = params.get('spotify_error');

    if (spotifyError) {
      showToast(`Spotify devolvió un error: ${spotifyError}`, 'bad');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!accessToken) {
      return;
    }

    const session = {
      accessToken,
      refreshToken: params.get('refresh_token') || '',
      tokenType: params.get('token_type') || 'Bearer',
      scope: params.get('scope') || '',
      expiresAt: Date.now() + Number(params.get('expires_in') || '3600') * 1000,
    };

    saveJson(STORAGE.session, session);
    safeRemove(STORAGE.playlist);
    state.session = session;
    state.selectedPlaylist = null;
    showToast('¡Conectado con Spotify! 🎧', 'good');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // ---------- Socket ----------

  function connectSocket() {
    if (state.socket) {
      return;
    }

    if (!window.io) {
      if (!socketRetryId) {
        socketRetryId = window.setTimeout(() => {
          socketRetryId = null;
          connectSocket();
        }, 250);
      }
      return;
    }

    const socket = window.io(API_BASE, { transports: ['websocket'] });
    state.socket = socket;

    socket.on('connect', () => {
      state.socketConnected = true;
      render();
    });

    socket.on('disconnect', () => {
      state.socketConnected = false;
      render();
    });

    socket.on('connect_error', () => {
      if (state.socketConnected) {
        state.socketConnected = false;
        render();
      }
    });

    socket.on('room:state', (room) => {
      if (state.room && room.code !== state.room.code) {
        return;
      }
      state.room = room;
      state.finalRanking = room.ranking || [];
      if (room.currentRound) {
        state.currentRound = room.currentRound;
      }
      render();
    });

    socket.on('game:round', (round) => {
      state.currentRound = round;
      state.selectedAnswer = '';
      state.guessLocked = false;
      state.guessResult = null;
      state.lastCorrectAnswer = '';
      state.secondsLeft = ROUND_SECONDS;
      startRoundTimer(round.endsAt);
      playPreview(round.previewUrl);
      render();
    });

    socket.on('game:score-update', ({ player, points }) => {
      if (player && player.socketId !== state.socket.id) {
        showToast(`${player.name} acertó (+${points})`);
      }
    });

    socket.on('game:round-ended', ({ correctAnswer }) => {
      state.guessLocked = true;
      state.lastCorrectAnswer = correctAnswer;
      if (!state.selectedAnswer) {
        state.guessResult = 'timeout';
      }
      stopRoundTimer();
      stopPreview();
      render();
    });

    socket.on('game:finished', (room) => {
      state.room = room;
      state.currentRound = null;
      state.finalRanking = room.ranking || [];
      stopRoundTimer();
      stopPreview();
      render();
      launchConfetti();
    });

    socket.on('room:deleted', ({ roomCode }) => {
      if (!state.room || state.room.code !== roomCode) {
        return;
      }
      resetRoom();
      showToast('La sala se ha cerrado.', 'bad');
      render();
    });
  }

  function socketEmit(event, payload, ack) {
    if (!state.socket || !state.socketConnected) {
      showToast('No hay conexión con el servidor. ¿Está el backend encendido?', 'bad');
      return;
    }
    state.socket.emit(event, payload, ack);
  }

  // ---------- Datos ----------

  async function loadPlaylists() {
    if (!state.session) {
      return;
    }

    state.playlistsLoading = true;
    state.playlistsError = '';
    render();

    try {
      const response = await fetch(`${API_BASE}/api/spotify/playlists`, {
        headers: { Authorization: `Bearer ${state.session.accessToken}` },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          logout();
          showToast('Tu sesión de Spotify ha caducado. Vuelve a entrar.', 'bad');
          return;
        }
        throw new Error(payload.detail || payload.message || 'Respuesta no válida del servidor.');
      }

      const payload = await response.json();
      state.playlists = payload.playlists || [];
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido.';
      state.playlistsError = `No se pudieron cargar tus playlists. ${detail}`;
    } finally {
      state.playlistsLoading = false;
      render();
    }
  }

  // ---------- Audio ----------

  function playPreview(url) {
    stopPreview();
    state.audioBlocked = false;

    if (!url) {
      return;
    }

    const audio = new Audio(url);
    audio.volume = 0.85;
    audio.addEventListener('play', () => { state.audioPlaying = true; updatePlayerUI(); });
    audio.addEventListener('pause', () => { state.audioPlaying = false; updatePlayerUI(); });
    audio.addEventListener('ended', () => { state.audioPlaying = false; updatePlayerUI(); });
    state.audio = audio;

    audio.play().catch(() => {
      state.audioBlocked = true;
      updatePlayerUI();
    });
  }

  function stopPreview() {
    if (state.audio) {
      state.audio.pause();
      state.audio.src = '';
      state.audio = null;
    }
    state.audioPlaying = false;
  }

  function toggleAudio() {
    if (!state.audio) return;
    if (state.audio.paused) {
      state.audioBlocked = false;
      state.audio.play().catch(() => {});
    } else {
      state.audio.pause();
    }
  }

  function updatePlayerUI() {
    const eq = app.querySelector('[data-eq]');
    const btn = app.querySelector('[data-action="toggle-audio"]');
    const label = app.querySelector('[data-audio-label]');
    if (eq) eq.classList.toggle('playing', state.audioPlaying);
    if (btn) btn.textContent = state.audioPlaying ? '❚❚' : '▶';
    if (label) label.textContent = audioLabel();
  }

  function audioLabel() {
    if (state.audioPlaying) return 'Sonando… ¡escucha bien!';
    if (state.audioBlocked) return 'Pulsa play para escuchar';
    return 'Pausado';
  }

  // ---------- Timer ----------

  function startRoundTimer(endsAt) {
    stopRoundTimer();
    const tick = () => {
      state.secondsLeft = Math.max(Math.ceil((endsAt - Date.now()) / 1000), 0);
      updateTimerUI();
      if (state.secondsLeft <= 0) stopRoundTimer();
    };
    tick();
    state.roundTimer = window.setInterval(tick, 200);
  }

  function stopRoundTimer() {
    if (state.roundTimer) {
      window.clearInterval(state.roundTimer);
      state.roundTimer = null;
    }
  }

  function updateTimerUI() {
    const ring = app.querySelector('[data-timer]');
    if (!ring) return;
    ring.style.setProperty('--p', String(state.secondsLeft / ROUND_SECONDS));
    ring.classList.toggle('warn', state.secondsLeft <= 7 && state.secondsLeft > 3);
    ring.classList.toggle('danger', state.secondsLeft <= 3 && !state.guessLocked);
    ring.querySelector('.value').textContent = String(state.secondsLeft);
  }

  // ---------- Render ----------

  function render() {
    const focus = captureFocus();
    const phase = state.room?.phase || 'lobby';
    let screen;

    if (!state.session) {
      screen = renderLanding();
    } else if (state.room && phase === 'finished') {
      screen = renderFinal();
    } else if (state.room && phase === 'playing') {
      screen = renderGame();
    } else if (state.selectedPlaylist) {
      screen = renderLobby();
    } else {
      screen = renderDashboard();
    }

    app.innerHTML = `
      <div class="app-shell">
        <div class="bg-blobs"><span></span><span></span><span></span></div>
        <div class="bg-grid"></div>
        <div class="container">
          ${renderTopbar()}
          ${screen}
        </div>
      </div>
    `;

    bindUI();
    updateTimerUI();
    restoreFocus(focus);
  }

  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.input) return null;
    return { key: el.dataset.input, start: el.selectionStart, end: el.selectionEnd };
  }

  function restoreFocus(focus) {
    if (!focus) return;
    const el = app.querySelector(`[data-input="${focus.key}"]`);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(focus.start, focus.end); } catch { /* ignore */ }
  }

  function renderTopbar() {
    return `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">${eqBars(4)}</div>
          <div class="brand-title">Yo<b>Shazam</b></div>
        </div>
        <div class="chip-row">
          <span class="chip"><span class="dot ${state.socketConnected ? 'on' : 'off'}"></span>${state.socketConnected ? 'Online' : 'Sin conexión'}</span>
          ${state.session ? '<span class="chip"><span class="dot on"></span>Spotify</span>' : ''}
          ${state.room ? `<span class="chip">Sala ${escapeHtml(state.room.code)}</span>` : ''}
          ${state.session ? '<button class="btn btn-ghost btn-sm" data-action="logout">Salir</button>' : ''}
        </div>
      </header>
    `;
  }

  function renderLanding() {
    return `
      <section class="hero">
        <div>
          <span class="sticker">🔥 Juego musical multijugador</span>
          <h1>¿Cuánto sabes <span class="gradient-text">de música</span> de <span class="strike">verdad</span>?</h1>
          <p class="hero-lead">
            Conecta tu Spotify, elige tu playlist favorita y reta a tus amigos.
            15 segundos por canción. El más rápido se lleva los puntos. 🏆
          </p>
          <div class="hero-actions">
            <a class="btn btn-spotify" href="${getSpotifyLoginUrl()}">
              ${spotifyIcon()} Entrar con Spotify
            </a>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="vinyl"></div>
          <div class="float-tag t1">+100 pts ⚡</div>
          <div class="float-tag t2">¡Acertaste! 🎉</div>
          <div class="float-tag t3">0:15 ⏱</div>
        </div>
      </section>
      <section class="steps">
        <div class="step">
          <div class="step-num">🎧</div>
          <h3>Conecta</h3>
          <p>Entra con tu cuenta de Spotify en un clic.</p>
        </div>
        <div class="step">
          <div class="step-num">💿</div>
          <h3>Elige playlist</h3>
          <p>Las canciones de todos se mezclan en la partida.</p>
        </div>
        <div class="step">
          <div class="step-num">⚡</div>
          <h3>Compite</h3>
          <p>Crea una sala, pasa el código y que gane el mejor.</p>
        </div>
      </section>
    `;
  }

  function renderDashboard() {
    let content;

    if (state.playlistsLoading) {
      content = `<div class="grid-playlists">${Array.from({ length: 8 }, () => `
        <div class="skeleton"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>
      `).join('')}</div>`;
    } else if (state.playlistsError) {
      content = `<div class="error-box">${escapeHtml(state.playlistsError)}</div>`;
    } else if (!state.playlists.length) {
      content = '<div class="empty"><span class="big">🫥</span>No encontramos playlists en tu cuenta.<br />Crea o guarda una en Spotify y dale a recargar.</div>';
    } else {
      content = `<div class="grid-playlists">${state.playlists.map(renderPlaylistCard).join('')}</div>`;
    }

    return `
      <section class="card" style="animation: rise 420ms ease both;">
        <div class="screen-head">
          <div>
            <span class="eyebrow">Paso 1 de 2</span>
            <h2>Elige tu <span class="gradient-text">playlist</span></h2>
            <div class="hint">Será tu aporte a la partida: las canciones de todos los jugadores se mezclan.</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="refresh-playlists" ${state.playlistsLoading ? 'disabled' : ''}>↻ Recargar</button>
        </div>
        ${content}
      </section>
    `;
  }

  function renderPlaylistCard(playlist, index) {
    const selected = state.selectedPlaylist?.id === playlist.id;
    return `
      <button class="playlist-card ${selected ? 'selected' : ''}" data-action="select-playlist" data-index="${index}">
        <div class="playlist-cover">
          ${playlist.imageUrl ? `<img src="${escapeAttr(playlist.imageUrl)}" alt="" loading="lazy" />` : '♪'}
          <span class="play-hover">▶</span>
        </div>
        <div class="playlist-title">${escapeHtml(playlist.name)}</div>
        <div class="playlist-meta">${playlist.trackCount} canciones · ${escapeHtml(playlist.ownerName || 'Spotify')}</div>
      </button>
    `;
  }

  function renderLobby() {
    const room = state.room;
    const players = room?.players || [];
    const playlist = state.selectedPlaylist;

    const mainContent = room
      ? `
        <div class="room-hero">
          <span class="eyebrow" style="color:#fff;">Código de la sala</span>
          <div class="room-code">${escapeHtml(room.code)}</div>
          <div class="tiny" style="color:#e7dcff;">Pásaselo a tus amigos para que se unan</div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-action="copy-code">📋 Copiar código</button>
            <button class="btn btn-ghost btn-sm" data-action="leave-room">Salir de la sala</button>
          </div>
          ${isHost()
            ? `<div style="margin-top:20px;"><button class="btn btn-primary btn-lg" data-action="start-game">🚀 ¡Empezar partida!</button></div>
               <div class="tiny" style="margin-top:10px;color:#e7dcff;">${players.length === 1 ? 'Puedes jugar solo o esperar a más gente.' : `${players.length} jugadores listos.`}</div>`
            : `<div class="waiting">${eqBars(4, true)} Esperando a que el anfitrión empiece…</div>`}
        </div>
      `
      : `
        <div class="field" style="margin-top:18px;">
          <label for="player-name">Tu nombre de jugador</label>
          <input id="player-name" data-input="playerName" maxlength="20" value="${escapeAttr(state.playerName)}" placeholder="Ej. DJ Rodri" autocomplete="nickname" />
        </div>
        <div class="lobby-split">
          <div class="lobby-option create">
            <h3>🎉 Crea una sala</h3>
            <div class="tiny">Tú serás el anfitrión y decides cuándo empezar.</div>
            <button class="btn btn-primary" data-action="create-room" ${canCreateRoom() ? '' : 'disabled'}>Crear sala</button>
          </div>
          <div class="lobby-option join">
            <h3>🔑 Únete con código</h3>
            <div class="field">
              <input class="code-input" data-input="roomCodeInput" maxlength="6" value="${escapeAttr(state.roomCodeInput)}" placeholder="ABC123" aria-label="Código de sala" autocomplete="off" />
            </div>
            <button class="btn btn-hot" data-action="join-room" ${canJoinRoom() ? '' : 'disabled'}>Unirme</button>
          </div>
        </div>
      `;

    return `
      <section class="layout">
        <div class="card">
          <span class="eyebrow">${room ? 'Sala de espera' : 'Paso 2 de 2'}</span>
          <h2 style="margin-top:8px;">${room ? '¡Todo listo! 🙌' : 'Monta la <span class="gradient-text">fiesta</span>'}</h2>
          <div class="selected-playlist" style="margin-top:18px;">
            <div class="cover">${playlist.imageUrl ? `<img src="${escapeAttr(playlist.imageUrl)}" alt="" />` : '♪'}</div>
            <div class="info">
              <div class="tiny">Tu playlist</div>
              <strong>${escapeHtml(playlist.name)}</strong>
            </div>
            ${room ? '' : '<button class="btn btn-ghost btn-sm" data-action="clear-playlist">Cambiar</button>'}
          </div>
          ${mainContent}
        </div>
        <aside class="sidebar">
          <div class="card">
            <span class="eyebrow">Jugadores · ${players.length}</span>
            <div class="players-list">
              ${players.length ? players.map(renderPlayerRow).join('') : '<div class="empty"><span class="big">👀</span>Cuando entres en una sala verás aquí a todos.</div>'}
            </div>
          </div>
          <div class="card">
            <span class="eyebrow">Cómo se juega</span>
            <p>Suena un trozo de canción y tienes <strong>15 segundos</strong> para elegir la respuesta. Solo tienes un intento.</p>
            <p>🥇 100 · 🥈 80 · 🥉 60 · resto 40 puntos según el orden en que aciertes.</p>
          </div>
        </aside>
      </section>
    `;
  }

  function renderPlayerRow(player) {
    const me = player.socketId === state.socket?.id;
    return `
      <div class="player-row ${me ? 'me' : ''}">
        ${avatar(player.name)}
        <div class="info">
          <strong>${escapeHtml(player.name)}${me ? ' (tú)' : ''}</strong>
          <span class="tiny">${player.selectedPlaylist ? `💿 ${escapeHtml(player.selectedPlaylist.name)}` : 'Sin playlist'}</span>
        </div>
        ${player.isHost ? '<span class="badge">HOST</span>' : ''}
      </div>
    `;
  }

  function renderGame() {
    const ranking = state.room?.ranking || [];
    const round = state.currentRound;

    if (!round) {
      return `
        <section class="card" style="text-align:center;padding:60px 20px;">
          <div class="eq playing" style="justify-content:center;height:60px;">${'<i></i>'.repeat(7)}</div>
          <h2 style="margin-top:20px;">Preparando la partida…</h2>
          <p class="muted">Mezclando las canciones de todos 🎛️</p>
        </section>
      `;
    }

    const question = round.promptType === 'artist'
      ? `¿Quién canta <strong>${escapeHtml(round.hint)}</strong>?`
      : `¿Cómo se llama esta canción de <strong>${escapeHtml(round.hint)}</strong>?`;

    return `
      <section class="layout">
        <div class="card">
          <div class="game-top">
            <div>
              <span class="eyebrow">Ronda ${round.roundNumber} de ${round.totalRounds}</span>
              <h2 style="margin-top:8px;">${round.promptType === 'artist' ? '🎤 Adivina el artista' : '🎵 Adivina la canción'}</h2>
              <div class="prompt-hint">${question}</div>
            </div>
            <div class="timer-ring" data-timer><span class="value">${state.secondsLeft}</span></div>
          </div>
          <div class="round-progress"><span style="width:${(round.roundNumber / round.totalRounds) * 100}%"></span></div>

          <div class="player-box">
            ${round.previewUrl
              ? `<button class="play-btn" data-action="toggle-audio" aria-label="Reproducir o pausar">${state.audioPlaying ? '❚❚' : '▶'}</button>
                 <div class="eq ${state.audioPlaying ? 'playing' : ''}" data-eq>${'<i></i>'.repeat(7)}</div>
                 <div class="label" data-audio-label>${audioLabel()}</div>`
              : '<div class="label">🙊 Esta canción no tiene preview. ¡Confía en tu instinto!</div>'}
          </div>

          <div class="answers">
            ${round.options.map((option, index) => renderAnswer(option, index)).join('')}
          </div>

          ${renderFeedback()}
        </div>

        <aside class="sidebar">
          <div class="card">
            <span class="eyebrow">Marcador</span>
            <div class="scoreboard">
              ${ranking.map(renderScoreRow).join('')}
            </div>
          </div>
        </aside>
      </section>
    `;
  }

  function renderAnswer(option, index) {
    const letter = 'ABCD'[index] || '?';
    const picked = state.selectedAnswer === option;
    const revealed = Boolean(state.lastCorrectAnswer);
    const isCorrect = revealed && option === state.lastCorrectAnswer;
    let cls = '';

    if (revealed) {
      if (isCorrect) cls = 'correct';
      else if (picked) cls = 'wrong';
      else cls = 'dim';
    } else if (state.guessLocked) {
      if (picked) cls = state.guessResult === 'wrong' ? 'wrong' : state.guessResult === 'correct' ? 'correct' : 'picked';
      else cls = 'dim';
    }

    return `
      <button class="answer ${cls}" data-action="guess" data-index="${index}" ${state.guessLocked ? 'disabled' : ''}>
        <span class="letter">${letter}</span>
        <span class="text">${escapeHtml(option)}</span>
      </button>
    `;
  }

  function renderFeedback() {
    if (state.lastCorrectAnswer) {
      const msg = state.guessResult === 'correct'
        ? '¡Bien! 🔥 Siguiente canción en nada…'
        : `Era: ${escapeHtml(state.lastCorrectAnswer)}`;
      return `<div class="feedback ${state.guessResult === 'correct' ? 'good' : 'bad'}">${msg}</div>`;
    }
    if (state.guessResult === 'correct') return '<div class="feedback good">¡Correcto! 🎯 Espera al resto…</div>';
    if (state.guessResult === 'wrong') return '<div class="feedback bad">Ups, esa no era 😬</div>';
    if (state.guessLocked) return '<div class="feedback">Enviando respuesta…</div>';
    return '';
  }

  function renderScoreRow(player, index) {
    const me = player.socketId === state.socket?.id;
    return `
      <div class="player-row ${me ? 'me' : ''}">
        <span class="rank-num">${index + 1}</span>
        ${avatar(player.name)}
        <div class="info"><strong>${escapeHtml(player.name)}</strong></div>
        <span class="points">${player.score}</span>
      </div>
    `;
  }

  function renderFinal() {
    const ranking = state.room?.ranking || state.finalRanking || [];
    const meIndex = ranking.findIndex((p) => p.socketId === state.socket?.id);
    const headline = meIndex === 0 ? '¡Has ganado! 👑' : meIndex >= 0 ? `Quedaste ${meIndex + 1}º 💪` : 'Partida terminada';

    return `
      <section class="final-head">
        <span class="eyebrow">Resultados</span>
        <h2>${headline}</h2>
        <div class="row-actions">
          <button class="btn btn-primary" data-action="back-lobby">🔁 Jugar otra vez</button>
          <button class="btn btn-ghost" data-action="clear-playlist">Cambiar playlist</button>
        </div>
      </section>
      <section class="podium">
        ${[0, 1, 2].map((i) => ranking[i] ? renderPodium(ranking[i], i + 1) : '<div></div>').join('')}
      </section>
      ${ranking.length > 3 ? `
        <section class="card final-list-card">
          <span class="eyebrow">Clasificación completa</span>
          <div class="scoreboard">${ranking.map(renderScoreRow).join('')}</div>
        </section>` : ''}
    `;
  }

  function renderPodium(player, position) {
    return `
      <div class="podium-col p${position}">
        ${position === 1 ? '<div class="crown">👑</div>' : ''}
        ${avatar(player.name)}
        <div class="podium-name">${escapeHtml(player.name)}</div>
        <div class="podium-block">
          <span class="place">${position}</span>
          <span class="pts">${player.score} pts</span>
        </div>
      </div>
    `;
  }

  // ---------- Eventos ----------

  function bindUI() {
    on('logout', 'click', () => {
      logout();
      render();
    });

    on('refresh-playlists', 'click', loadPlaylists);

    app.querySelectorAll('[data-action="select-playlist"]').forEach((button) => {
      button.addEventListener('click', () => {
        const playlist = state.playlists[Number(button.dataset.index)];
        if (!playlist) return;
        state.selectedPlaylist = playlist;
        saveJson(STORAGE.playlist, playlist);
        render();
      });
    });

    bindInput('playerName', STORAGE.playerName, (v) => v);
    bindInput('roomCodeInput', STORAGE.roomCode, (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''));

    on('create-room', 'click', () => {
      if (!canCreateRoom()) return;
      socketEmit('room:create', {
        playerName: state.playerName.trim(),
        accessToken: state.session.accessToken,
        selectedPlaylist: state.selectedPlaylist,
      }, (ack) => handleRoomAck(ack, '¡Sala creada!'));
    });

    on('join-room', 'click', () => {
      if (!canJoinRoom()) return;
      socketEmit('room:join', {
        roomCode: state.roomCodeInput.trim(),
        playerName: state.playerName.trim(),
        accessToken: state.session.accessToken,
        selectedPlaylist: state.selectedPlaylist,
      }, (ack) => handleRoomAck(ack, '¡Dentro! 🙌'));
    });

    on('copy-code', 'click', () => {
      if (!state.room) return;
      navigator.clipboard?.writeText(state.room.code)
        .then(() => showToast('Código copiado 📋', 'good'))
        .catch(() => showToast(`Código: ${state.room.code}`));
    });

    on('leave-room', 'click', () => {
      leaveRoom();
      render();
    });

    on('start-game', 'click', (button) => {
      if (!state.room) return;
      button.disabled = true;
      button.textContent = 'Cargando canciones…';
      socketEmit('room:start', { roomCode: state.room.code }, (ack) => {
        if (!ack || !ack.ok) {
          showToast(ack?.message || 'No se pudo empezar la partida.', 'bad');
          render();
        }
      });
    });

    on('toggle-audio', 'click', toggleAudio);

    app.querySelectorAll('[data-action="guess"]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.currentRound || state.guessLocked) return;
        const answer = state.currentRound.options[Number(button.dataset.index)];
        state.selectedAnswer = answer;
        state.guessLocked = true;
        render();
        socketEmit('game:guess', { roomCode: state.room.code, answer }, (ack) => {
          if (!ack || !ack.ok) {
            showToast(ack?.message || 'No se pudo registrar la respuesta.', 'bad');
            return;
          }
          if (state.lastCorrectAnswer) return;
          state.guessResult = ack.correct ? 'correct' : 'wrong';
          if (ack.correct) showToast(`+${ack.points} puntos ⚡`, 'good');
          render();
        });
      });
    });

    on('back-lobby', 'click', () => {
      leaveRoom();
      render();
    });

    on('clear-playlist', 'click', () => {
      leaveRoom();
      safeRemove(STORAGE.playlist);
      state.selectedPlaylist = null;
      if (!state.playlists.length) loadPlaylists();
      render();
    });
  }

  function on(action, event, handler) {
    app.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
      el.addEventListener(event, () => handler(el));
    });
  }

  function bindInput(key, storageKey, normalize) {
    const input = app.querySelector(`[data-input="${key}"]`);
    if (!input) return;
    input.addEventListener('input', () => {
      const value = normalize(input.value);
      if (value !== input.value) input.value = value;
      state[key] = value;
      safeSet(storageKey, value);
      updateFormButtons();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const target = key === 'roomCodeInput' ? 'join-room' : 'create-room';
      app.querySelector(`[data-action="${target}"]:not(:disabled)`)?.click();
    });
  }

  function updateFormButtons() {
    const create = app.querySelector('[data-action="create-room"]');
    const join = app.querySelector('[data-action="join-room"]');
    if (create) create.disabled = !canCreateRoom();
    if (join) join.disabled = !canJoinRoom();
  }

  function handleRoomAck(ack, successLabel) {
    if (!ack || !ack.ok || !ack.room) {
      showToast(ack?.message || 'No se pudo completar la acción.', 'bad');
      return;
    }

    state.room = ack.room;
    state.finalRanking = ack.room.ranking || [];
    safeSet(STORAGE.roomCode, ack.room.code);
    state.roomCodeInput = ack.room.code;
    showToast(successLabel, 'good');
    render();
  }

  function leaveRoom() {
    if (state.room && state.socketConnected) {
      state.socket.emit('room:leave', { roomCode: state.room.code });
    }
    resetRoom();
  }

  function resetRoom() {
    stopRoundTimer();
    stopPreview();
    state.room = null;
    state.currentRound = null;
    state.finalRanking = [];
    state.selectedAnswer = '';
    state.guessLocked = false;
    state.guessResult = null;
    state.lastCorrectAnswer = '';
  }

  function logout() {
    leaveRoom();
    clearSession();
    safeRemove(STORAGE.playlist);
    state.session = null;
    state.selectedPlaylist = null;
    state.playlists = [];
  }

  function canCreateRoom() {
    return Boolean(state.socketConnected && state.session && state.selectedPlaylist && state.playerName.trim());
  }

  function canJoinRoom() {
    return Boolean(canCreateRoom() && state.roomCodeInput.trim().length >= 4);
  }

  function isHost() {
    return Boolean(state.room && state.socket && state.room.hostSocketId === state.socket.id);
  }

  // ---------- Extras visuales ----------

  function showToast(message, kind = '') {
    if (!toastRoot) return;
    window.clearTimeout(toastTimer);
    toastRoot.innerHTML = `<div class="toast ${kind}">${escapeHtml(message)}</div>`;
    toastTimer = window.setTimeout(() => {
      const el = toastRoot.firstElementChild;
      if (!el) return;
      el.classList.add('out');
      toastTimer = window.setTimeout(() => { toastRoot.innerHTML = ''; }, 260);
    }, 2800);
  }

  function launchConfetti() {
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const colors = ['#c6ff3d', '#ff3ea5', '#22e1ff', '#ffd23f', '#8b5cf6', '#ff8a3d'];
    for (let i = 0; i < 90; i += 1) {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${2.2 + Math.random() * 2}s`;
      piece.style.animationDelay = `${Math.random() * 0.8}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 5000);
  }

  function avatar(name) {
    const clean = String(name || '?').trim();
    let hash = 0;
    for (const ch of clean) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
    const initials = clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    return `<span class="avatar" style="background:${color}">${escapeHtml(initials)}</span>`;
  }

  function eqBars(count, playing = true) {
    return `<span class="eq ${playing ? 'playing' : ''}">${'<i></i>'.repeat(count)}</span>`;
  }

  function spotifyIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.85-1.74-6.45-2.14-10.68-1.17a.75.75 0 1 1-.33-1.46c4.63-1.06 8.6-.6 11.77 1.34.36.22.47.68.25 1.04Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.27-2-8.25-2.59-12.11-1.42a.94.94 0 0 1-.55-1.8c4.41-1.33 9.9-.68 13.64 1.62.44.27.58.85.31 1.29Zm.13-3.4C15.18 8.3 8.73 8.08 5 9.22a1.13 1.13 0 1 1-.66-2.16c4.28-1.3 11.39-1.05 15.9 1.62a1.13 1.13 0 0 1-1.15 1.95Z"/></svg>';
  }

  // ---------- Utilidades ----------

  function getSpotifyLoginUrl() {
    return `${API_BASE}/api/auth/spotify/login`;
  }

  function isSessionFresh(session) {
    return Boolean(session?.accessToken && Number(session.expiresAt) > Date.now() + 60_000);
  }

  function clearSession() {
    safeRemove(STORAGE.session);
  }

  function safeGet(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  function loadJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveJson(key, value) {
    safeSet(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#96;');
  }
})();
