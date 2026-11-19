/* Employee + moderator scene narration. Studio AI WAVs are optional; browser speech is free. */
'use strict';
window.SceneAudio = (() => {
  let generation = 0;
  let player = null;
  let playing = false;
  let roomCode = '';
  let roundNumber = -1;
  let status = 'Ready to play';

  function matches(game) {
    return Boolean(game && roomCode === game.code && roundNumber === game.round);
  }

  function updateButtons() {
    document.querySelectorAll('[data-scene-audio-status]').forEach(el => { el.textContent = status; });
    document.querySelectorAll('[data-action="stop-scene-audio"]').forEach(el => {
      el.disabled = !playing;
    });
  }

  function setStatus(message) {
    status = message;
    updateButtons();
  }

  function stop(message = 'Audio stopped') {
    generation += 1;
    if (player) {
      player.onended = null;
      player.onerror = null;
      player.onplaying = null;
      player.pause();
      player.removeAttribute('src');
      player.load();
      player = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    playing = false;
    setStatus(message);
  }

  function scenePanel(game, compact = false) {
    const current = matches(game) && playing;
    const message = matches(game) ? status : 'Ready to play';
    return `<section class="scene-audio ${compact ? 'scene-audio-compact' : ''}" aria-label="Listen to the scenario">
      <div class="scene-audio-heading"><strong>🎙️ Hear the conversation</strong><span class="scene-audio-voices">Employee → Moderator</span></div>
      <p class="scene-audio-intro">First, the employee speaks. Then a moderator asks how you would respond as their manager.</p>
      <div class="scene-audio-controls">
        <button type="button" class="btn smallbtn" data-action="play-scene-audio" data-audio-mode="studio">▶ Play character voices</button>
        <button type="button" class="btn secondary smallbtn" data-action="play-scene-audio" data-audio-mode="device">Play device voices</button>
        <button type="button" class="btn ghost smallbtn" data-action="stop-scene-audio" ${current ? '' : 'disabled'}>■ Stop</button>
      </div>
      <div class="scene-audio-status" role="status" aria-live="polite" data-scene-audio-status>${message}</div>
      <p class="scene-audio-disclosure">AI-generated character voices are selected to match the people pictured, not to imitate their actual voices. Uses your connected OpenAI API (separately billed; clips cached). Free device voices are selected where available and may differ by browser. Playback is optional.</p>
    </section>`;
  }

  function start(game, mode) {
    if (!game || !game.scenario || !Number.isInteger(game.round)) return;
    stop('Ready to play');
    roomCode = game.code;
    roundNumber = game.round;
    playing = true;
    const id = generation;
    if (mode === 'device') playDeviceSpeech(game, id);
    else playStudioSpeech(game, id);
    updateButtons();
  }

  function playStudioSpeech(game, id) {
    const media = new Audio();
    player = media;
    media.preload = 'auto';
    media.src = `/api/scenario-audio?round=${encodeURIComponent(game.round)}&code=${encodeURIComponent(game.code)}&voice_version=3`;
    setStatus('Preparing character voices…');
    media.onplaying = () => {
      if (id === generation) setStatus('Playing employee and moderator voices…');
    };
    media.onended = () => {
      if (id === generation) stop('Scene finished · replay any time');
    };
    media.onerror = () => {
      if (id === generation) stop('Studio voices unavailable. Select “Play device voices” instead.');
    };
    try {
      const attempt = media.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          if (id === generation) stop('Could not play studio audio. Try device voices or check browser audio settings.');
        });
      }
    } catch (_) {
      if (id === generation) stop('Audio playback is unavailable. Try device voices.');
    }
  }

  function chooseDeviceVoices(index, scenario) {
    const available = window.speechSynthesis.getVoices();
    const english = available.filter(v => /^en(?:-|$)/i.test(v.lang));
    const usable = english.length ? english : available;

    // Browsers do not expose voice gender. Prefer voices with recognizable
    // masculine/feminine names, then use pitch as a best-effort fallback.
    const maleNames = /\b(?:alex|aaron|alfie|andrew|arthur|brian|charles|christopher|daniel|david|davis|eric|fred|george|guy|jacob|james|john|mark|matthew|oliver|roger|ryan|steffan|thomas|tony|male)\b/i;
    const femaleNames = /\b(?:alice|ana|aria|ava|clara|elizabeth|emma|fiona|hazel|jenny|karen|libby|lisa|michelle|mia|moira|nancy|natasha|samantha|sarah|sonia|susan|tessa|victoria|zira|female)\b/i;
    function pick(style, excluded, offset) {
      const pattern = style === 'female' ? femaleNames : maleNames;
      const matched = usable.filter(v => pattern.test(v.name));
      const pool = matched.length ? matched : usable;
      const distinct = pool.filter(v => !excluded || v.voiceURI !== excluded.voiceURI);
      const options = distinct.length ? distinct : pool;
      return options.length ? options[offset % options.length] : null;
    }
    const employee = pick(scenario.employee_voice_style || 'male', null, index);
    const moderator = pick(scenario.moderator_voice_style || 'male', employee, index + 2);
    return {employee, moderator};
  }

  function playDeviceSpeech(game, id) {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      stop('Speech playback is not supported in this browser.');
      return;
    }
    const synth = window.speechSynthesis;
    const {employee: employeeVoice, moderator: moderatorVoice} = chooseDeviceVoices(game.round, game.scenario);
    const employee = new SpeechSynthesisUtterance(game.scenario.employee);
    employee.lang = 'en-US';
    if (employeeVoice) employee.voice = employeeVoice;
    employee.rate = 0.96;
    employee.pitch = game.scenario.employee_voice_style === 'female' ? 1.12 : 0.82;

    const question = `You're the manager in this conversation. ${game.scenario.question} How would you respond?`;
    const moderator = new SpeechSynthesisUtterance(question);
    moderator.lang = 'en-US';
    if (moderatorVoice) moderator.voice = moderatorVoice;
    moderator.rate = 0.91;
    moderator.pitch = game.scenario.moderator_voice_style === 'female' ? 1.12 : 0.78;

    employee.onstart = () => { if (id === generation) setStatus('Employee speaking…'); };
    employee.onend = () => {
      if (id !== generation) return;
      setStatus('Moderator asking the coaching question…');
      synth.speak(moderator);
    };
    employee.onerror = () => { if (id === generation) stop('Device voice playback failed. Check your sound settings.'); };
    moderator.onend = () => { if (id === generation) stop('Scene finished · replay any time'); };
    moderator.onerror = () => { if (id === generation) stop('Device voice playback failed. Check your sound settings.'); };
    setStatus('Starting device narration…');
    try { synth.speak(employee); }
    catch (_) { if (id === generation) stop('Device speech is unavailable in this browser.'); }
  }

  function onGameUpdate(next) {
    if (playing && !matches(next)) stop('Ready to play');
  }

  return {panel: scenePanel, start, stop, onGameUpdate, updateButtons};
})();
