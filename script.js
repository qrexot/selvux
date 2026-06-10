const STORAGE = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (_) {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // Storage may be unavailable in private/restricted browser modes.
    }
  }
};

function readStoredObject(key) {
  try {
    const value = JSON.parse(STORAGE.get(key, '{}'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    STORAGE.remove(key);
    return {};
  }
}

const APP = {
  data: { words: null, texts: null, abkhaziaTexts: null },
  state: {
    section: 'words',
    wordsTopic: 'all',
    textsTopic: 'all',
    textsVariant: STORAGE.get('textsVariant', 'abkhazia') === 'original' ? 'original' : 'abkhazia',
    wordsKnown: readStoredObject('wordsKnown'),
    wordFavorites: readStoredObject('wordFavorites'),
    wordSearch: '',
    favoritesOnly: false
  },
  quiz: {
    questions: [],
    currentIndex: 0,
    score: 0,
    wrong: 0,
    active: false,
    config: { dir: 'de-ru', topic: 'all', count: 10, unknown: 'all' }
  }
};

// ─────────────────────────────────────────────
// INIT & SUPABASE
// ─────────────────────────────────────────────
const supaUrl = 'https://bqvheyzsnlitqdxjenna.supabase.co';
const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdmhleXpzbmxpdHFkeGplbm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjQ5NTcsImV4cCI6MjA5NjM0MDk1N30._Df22SXyi2Ud-X71GgsB2hYGc3P5Xd-Ji18GThx_IxM';

const storedNickname = STORAGE.get('nickname');
let myNickname = /^[a-zA-Z0-9_]{3,15}$/.test(storedNickname || '') ? storedNickname : null;
let remoteNicknameRegistered = STORAGE.get('nicknameRemote', myNickname ? '1' : '0') !== '0';
const deviceId = getOrCreateDeviceId();
let deviceTagPromise = null;
let privacySettings = {
  hideNickname: STORAGE.get('hideNickname', '0') === '1',
  hideTime: STORAGE.get('hideTime', '0') === '1'
};
let privacyApiAvailable = true;
let timeSpent = Number.parseInt(STORAGE.get('timeSpent', '0'), 10);
if (!Number.isFinite(timeSpent) || timeSpent < 0) timeSpent = 0;
let timeTickInterval = null;
let timeSyncInterval = null;

function getOrCreateDeviceId() {
  const stored = STORAGE.get('deviceId');
  if (/^[a-f0-9-]{20,64}$/i.test(stored || '')) return stored;

  const generated = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  STORAGE.set('deviceId', generated);
  return generated;
}

function getDeviceTag() {
  if (!deviceTagPromise) {
    deviceTagPromise = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(deviceId))
      .then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''));
  }
  return deviceTagPromise;
}

async function supabaseRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${supaUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }
    if (!response.ok) {
      throw new Error(data?.message || (typeof data === 'string' ? data : `HTTP ${response.status}`));
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Сервер не ответил вовремя');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findRemoteNickname(nickname) {
  try {
    const result = await supabaseRequest('rpc/nickname_exists', {
      method: 'POST',
      body: JSON.stringify({ p_nickname: nickname })
    });
    return result === true;
  } catch (error) {
    const data = await supabaseRequest(
      `users?select=nickname&nickname=eq.${encodeURIComponent(nickname)}&limit=1`
    );
    return Array.isArray(data) && data.length > 0;
  }
}

async function createRemoteUser(nickname) {
  const payload = {
    nickname,
    time_spent: timeSpent,
    device_id: deviceId,
    hide_nickname: privacySettings.hideNickname,
    hide_time: privacySettings.hideTime
  };

  try {
    await supabaseRequest('rpc/register_user', {
      method: 'POST',
      body: JSON.stringify({
        p_device_id: deviceId,
        p_nickname: nickname,
        p_time_spent: timeSpent,
        p_hide_nickname: privacySettings.hideNickname,
        p_hide_time: privacySettings.hideTime
      })
    });
  } catch (rpcError) {
    if (!/function|schema cache|404/i.test(rpcError.message)) throw rpcError;
    privacyApiAvailable = false;
    try {
      await supabaseRequest('users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([payload])
      });
    } catch (legacySchemaError) {
      if (!/column|schema cache/i.test(legacySchemaError.message)) throw legacySchemaError;
      await supabaseRequest('users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{ nickname, time_spent: timeSpent }])
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initAuth();
  initLeaderboardPrivacy();
  updateBadge('Слова');

  try {
    loadAllData();
    initWords();
    initTexts();
    initQuiz();
    initCustomSelects();
    renderWords();
    renderTexts();
  } catch (e) {
    const container = document.getElementById('wordsList');
    if (container) {
      container.textContent = `Ошибка загрузки данных: ${e.message}`;
      container.classList.add('empty-state');
    }
    console.error('App initialization failed:', e);
  }
});

function getCurrentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function commitTheme(theme, persist) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalized;
  if (persist) STORAGE.set('theme', normalized);

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = normalized === 'light' ? '#f6f6f4' : '#09090b';

  const btn = document.getElementById('themeToggle');
  if (btn) {
    const isLight = normalized === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.setAttribute('aria-label', isLight ? 'Включить тёмную тему' : 'Включить светлую тему');
    btn.title = isLight ? 'Тёмная тема' : 'Светлая тема';
  }
}

function applyTheme(theme, persist = true, animate = false) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const commit = () => commitTheme(normalized, persist);

  if (animate && !reducedMotion) {
    document.documentElement.classList.add('theme-changing');
    commit();
    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-changing');
    }, 190);
    return;
  }

  commit();
}

function initTheme() {
  applyTheme(getCurrentTheme(), false);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark', true, true);
  });
}

function loadAllData() {
  APP.data.words = window.WORDS_DATA;
  APP.data.texts = window.TEXTS_DATA;
  APP.data.abkhaziaTexts = window.ABKHAZIA_TEXTS;
  if (!APP.data.words || !Array.isArray(APP.data.words.topics)) {
    throw new Error('список слов повреждён или отсутствует');
  }
  if (!APP.data.texts || !Array.isArray(APP.data.texts.texts)) {
    throw new Error('список текстов повреждён или отсутствует');
  }
  const missingAdaptations = APP.data.texts.texts.filter(text => !APP.data.abkhaziaTexts?.[text.id]);
  if (missingAdaptations.length > 0) {
    throw new Error('не все адаптации про Абхазию загружены');
  }
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      navigateTo(section);
    });
  });
}

function navigateTo(sectionId) {
  stopSpeech();
  if (APP.quiz.active && sectionId !== 'quiz') {
    if (!confirm('Тест активен. Прервать и выйти?')) return;
    resetQuiz();
  }
  
  APP.state.section = sectionId;
  
  // Update Buttons
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-section="${sectionId}"]`).classList.add('active');
  
  // Update Sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`sec-${sectionId}`).classList.add('active');
  
  window.scrollTo({ top: 0, behavior: 'auto' });
  
  const titles = { words: 'Слова', texts: 'Тексты', quiz: 'Тест', leaderboard: 'Рейтинг' };
  updateBadge(titles[sectionId]);
  
  if (sectionId === 'leaderboard') {
    renderLeaderboard();
  }
}

function updateBadge(text) {
  const badge = document.getElementById('headerBadge');
  if (badge) badge.textContent = text;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function speakerIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6.5 9H3v6h3.5l4.5 4V5z"/>
      <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10"/>
    </svg>
  `;
}

function starIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3z"/>
    </svg>
  `;
}

let activeSpeechButton = null;
let speechSession = 0;
let availableSpeechVoices = [];

function refreshSpeechVoices() {
  availableSpeechVoices = window.speechSynthesis?.getVoices() || [];
}

refreshSpeechVoices();
if ('speechSynthesis' in window) {
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshSpeechVoices);
}

const MALE_VOICE_HINTS = [
  'conrad', 'markus', 'stefan', 'hans', 'martin', 'klaus', 'max',
  'viktor', 'yannick', 'ralf', 'heinz', 'bernd', 'dietrich', 'male',
  'мужской', 'pavel', 'maxim', 'alexander', 'yuri'
];

const FEMALE_VOICE_HINTS = [
  'anna', 'petra', 'katja', 'hedda', 'helena', 'marlene', 'female',
  'женский', 'irina', 'milena', 'alena', 'victoria'
];

function getPreferredVoice(lang) {
  refreshSpeechVoices();
  const voices = availableSpeechVoices;
  const normalizedLang = lang.toLowerCase();
  const prefix = normalizedLang.split('-')[0];
  const matchingVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith(prefix));
  if (matchingVoices.length === 0) return null;

  return matchingVoices
    .map((voice, index) => {
      const details = `${voice.name} ${voice.voiceURI}`.toLowerCase();
      let score = 0;
      if (voice.lang.toLowerCase() === normalizedLang) score += 30;
      if (voice.localService) score += 8;
      if (voice.default) score += 3;
      if (MALE_VOICE_HINTS.some(hint => details.includes(hint))) score += 100;
      if (FEMALE_VOICE_HINTS.some(hint => details.includes(hint))) score -= 80;
      return { voice, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].voice;
}

function splitSpeechText(text, maxLength = 180) {
  const sentences = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const chunks = [];
  let current = '';

  sentences.forEach(sentence => {
    const next = `${current} ${sentence}`.trim();
    if (next.length <= maxLength) {
      current = next;
      return;
    }
    if (current) chunks.push(current);
    current = sentence.trim();
  });
  if (current) chunks.push(current);
  return chunks;
}

function stopSpeech() {
  speechSession++;
  window.speechSynthesis?.cancel();
  if (activeSpeechButton) {
    activeSpeechButton.classList.remove('speaking');
    activeSpeechButton = null;
  }
}

function speakText(text, lang, btn) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    showToast('Озвучивание не поддерживается этим браузером');
    return;
  }
  if (activeSpeechButton === btn && btn.classList.contains('speaking')) {
    stopSpeech();
    return;
  }

  stopSpeech();
  const chunks = splitSpeechText(text);
  if (chunks.length === 0) return;

  const session = speechSession;
  const voice = getPreferredVoice(lang);
  activeSpeechButton = btn;
  btn.classList.add('speaking');

  function speakChunk(index) {
    if (session !== speechSession || index >= chunks.length) {
      if (session === speechSession) stopSpeech();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = lang;
    utterance.rate = lang.startsWith('de') ? 0.86 : 0.9;
    utterance.pitch = lang.startsWith('de') ? 0.88 : 0.92;
    utterance.volume = 0.95;
    if (voice) utterance.voice = voice;
    utterance.onend = () => speakChunk(index + 1);
    utterance.onerror = event => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        showToast('Не удалось воспроизвести произношение');
      }
      if (session === speechSession) stopSpeech();
    };
    window.speechSynthesis.speak(utterance);
  }

  speakChunk(0);
}

function speakGerman(text, btn) {
  speakText(text, 'de-DE', btn);
}

// ─────────────────────────────────────────────
// WORDS SECTION
// ─────────────────────────────────────────────
function initWords() {
  const topics = APP.data.words.topics;
  const filterWrap = document.getElementById('wordsFilter');
  const searchInput = document.getElementById('wordSearchInput');
  const searchClear = document.getElementById('wordSearchClear');
  const favoritesBtn = document.getElementById('favoritesFilterBtn');
  let searchTimer = 0;
  
  // Quiz Topic Dropdown sync
  const csTopicOptions = document.getElementById('csTopicOptions');

  searchInput.addEventListener('input', () => {
    APP.state.wordSearch = searchInput.value.trim();
    searchClear.classList.toggle('show', APP.state.wordSearch.length > 0);
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderWords, 120);
  });
  searchClear.onclick = () => {
    clearTimeout(searchTimer);
    searchInput.value = '';
    APP.state.wordSearch = '';
    searchClear.classList.remove('show');
    searchInput.focus();
    renderWords();
  };
  favoritesBtn.onclick = () => {
    APP.state.favoritesOnly = !APP.state.favoritesOnly;
    favoritesBtn.classList.toggle('active', APP.state.favoritesOnly);
    favoritesBtn.setAttribute('aria-pressed', String(APP.state.favoritesOnly));
    renderWords();
  };
  updateFavoritesCount();
  
  // Fix "Все" (All) button
  const allBtn = filterWrap.querySelector('.filter-chip[data-topic="all"]');
  if (allBtn) {
    allBtn.onclick = () => {
      document.querySelectorAll('#wordsFilter .filter-chip').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      APP.state.wordsTopic = 'all';
      renderWords();
    };
  }
  
  topics.forEach(t => {
    // Filter chip
    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.topic = t.id;
    btn.textContent = t.title.split(' — ')[0]; // short name
    btn.onclick = () => {
      document.querySelectorAll('#wordsFilter .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      APP.state.wordsTopic = t.id;
      renderWords();
    };
    filterWrap.appendChild(btn);
    
    // Quiz Option
    const opt = document.createElement('div');
    opt.className = 'custom-select-option';
    opt.dataset.val = t.id;
    opt.textContent = t.title;
    csTopicOptions.appendChild(opt);
  });
}

function renderWords() {
  const container = document.getElementById('wordsList');
  container.innerHTML = '';
  
  let topicsToRender = APP.data.words.topics;
  if (APP.state.wordsTopic !== 'all') {
    topicsToRender = topicsToRender.filter(t => t.id === APP.state.wordsTopic);
  }
  
  const query = normalizeSearch(APP.state.wordSearch);
  let renderedCount = 0;
  
  topicsToRender.forEach(topic => {
    const matchingWords = topic.words.filter(word => {
      if (APP.state.favoritesOnly && !APP.state.wordFavorites[word.id]) return false;
      if (!query) return true;
      return normalizeSearch(`${word.de} ${word.ru} ${word.example || ''}`).includes(query);
    });
    if (matchingWords.length === 0) return;

    const section = document.createElement('div');
    section.className = 'topic-section';
    
    const label = document.createElement('div');
    label.className = 'topic-label';
    label.textContent = topic.title;
    section.appendChild(label);
    
    matchingWords.forEach(w => {
      const isKnown = APP.state.wordsKnown[w.id];
      const isFavorite = APP.state.wordFavorites[w.id];
      
      const card = document.createElement('div');
      card.className = 'word-card';
      card.innerHTML = `
        <div class="word-card-header">
          <div class="word-card-copy">
            <div class="word-de">${w.de}</div>
            <div class="word-ru">${w.ru}</div>
          </div>
          <div class="word-card-actions">
            <button class="icon-action-btn word-speak-btn" type="button" aria-label="Произнести слово" title="Произнести">
              ${speakerIcon()}
            </button>
            <button class="icon-action-btn word-favorite-btn ${isFavorite ? 'active' : ''}" type="button" aria-label="${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}" aria-pressed="${isFavorite}" title="Избранное">
              ${starIcon()}
            </button>
            <div class="word-level">${w.level || 'A1'}</div>
          </div>
        </div>
        <div class="word-card-body">
          <div class="word-example">${w.example || ''}</div>
          <button class="word-known-btn ${isKnown ? 'known' : ''}" data-id="${w.id}">
            ${isKnown ? '✓ Изучено' : 'Отметить изученным'}
          </button>
        </div>
      `;
      
      const header = card.querySelector('.word-card-header');
      const body = card.querySelector('.word-card-body');
      header.onclick = event => {
        if (!event.target.closest('button')) body.classList.toggle('open');
      };

      const speakBtn = card.querySelector('.word-speak-btn');
      speakBtn.setAttribute('aria-label', `Произнести: ${w.de}`);
      speakBtn.onclick = event => {
        event.stopPropagation();
        speakGerman(w.de, speakBtn);
      };

      const favoriteBtn = card.querySelector('.word-favorite-btn');
      favoriteBtn.onclick = event => {
        event.stopPropagation();
        toggleWordFavorite(w.id, favoriteBtn);
      };
      
      const btn = card.querySelector('.word-known-btn');
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleWordKnown(w.id, btn);
      };
      
      section.appendChild(card);
      renderedCount++;
    });
    container.appendChild(section);
  });

  if (renderedCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state dictionary-empty';
    const title = document.createElement('strong');
    title.textContent = APP.state.favoritesOnly ? 'В избранном пока нет подходящих слов' : 'Ничего не найдено';
    const hint = document.createElement('span');
    hint.textContent = 'Измените запрос или сбросьте выбранные фильтры.';
    const reset = document.createElement('button');
    reset.className = 'btn btn-ghost';
    reset.type = 'button';
    reset.textContent = 'Сбросить фильтры';
    reset.onclick = resetWordFilters;
    empty.append(title, hint, reset);
    container.appendChild(empty);
  }
}

function normalizeSearch(value) {
  return String(value || '').toLocaleLowerCase('de-DE').normalize('NFKC').replace(/ё/g, 'е');
}

function updateFavoritesCount() {
  const count = Object.values(APP.state.wordFavorites).filter(Boolean).length;
  document.getElementById('favoritesCount').textContent = count;
}

function toggleWordFavorite(id, btn) {
  const isFavorite = !APP.state.wordFavorites[id];
  if (isFavorite) {
    APP.state.wordFavorites[id] = true;
  } else {
    delete APP.state.wordFavorites[id];
  }
  STORAGE.set('wordFavorites', JSON.stringify(APP.state.wordFavorites));
  updateFavoritesCount();
  btn.classList.toggle('active', isFavorite);
  btn.setAttribute('aria-pressed', String(isFavorite));
  btn.setAttribute('aria-label', isFavorite ? 'Удалить из избранного' : 'Добавить в избранное');
  showToast(isFavorite ? 'Добавлено в избранное' : 'Удалено из избранного');
  if (APP.state.favoritesOnly && !isFavorite) renderWords();
}

function resetWordFilters() {
  APP.state.wordSearch = '';
  APP.state.favoritesOnly = false;
  APP.state.wordsTopic = 'all';
  const searchInput = document.getElementById('wordSearchInput');
  searchInput.value = '';
  document.getElementById('wordSearchClear').classList.remove('show');
  const favoritesBtn = document.getElementById('favoritesFilterBtn');
  favoritesBtn.classList.remove('active');
  favoritesBtn.setAttribute('aria-pressed', 'false');
  document.querySelectorAll('#wordsFilter .filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.topic === 'all');
  });
  renderWords();
}

function toggleWordKnown(id, btn) {
  if (APP.state.wordsKnown[id]) {
    delete APP.state.wordsKnown[id];
    btn.classList.remove('known');
    btn.innerHTML = 'Отметить изученным';
  } else {
    APP.state.wordsKnown[id] = true;
    btn.classList.add('known');
    btn.innerHTML = '✓ Изучено';
    showToast('Слово добавлено в изученные');
  }
  STORAGE.set('wordsKnown', JSON.stringify(APP.state.wordsKnown));
}

// ─────────────────────────────────────────────
// TEXTS SECTION
// ─────────────────────────────────────────────
function initTexts() {
  const topics = APP.data.words.topics;
  const filterWrap = document.getElementById('textsFilter');
  const countrySwitch = document.getElementById('textsCountrySwitch');
  
  if (!filterWrap) return;

  countrySwitch.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.variant === APP.state.textsVariant);
    btn.onclick = () => {
      if (btn.dataset.variant === APP.state.textsVariant) return;
      stopSpeech();
      APP.state.textsVariant = btn.dataset.variant;
      STORAGE.set('textsVariant', APP.state.textsVariant);
      countrySwitch.querySelectorAll('button').forEach(item => {
        item.classList.toggle('active', item === btn);
      });
      renderTexts();
    };
  });

  const allBtn = filterWrap.querySelector('.filter-chip[data-topic="all"]');
  if (allBtn) {
    allBtn.onclick = () => {
      document.querySelectorAll('#textsFilter .filter-chip').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      APP.state.textsTopic = 'all';
      renderTexts();
    };
  }
  
  topics.forEach(t => {
    const hasText = APP.data.texts.texts.some(text => text.topic === t.id);
    if (!hasText) return;

    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.topic = t.id;
    btn.textContent = t.title.split(' — ')[0];
    btn.onclick = () => {
      document.querySelectorAll('#textsFilter .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      APP.state.textsTopic = t.id;
      renderTexts();
    };
    filterWrap.appendChild(btn);
  });
}

function renderTexts() {
  const container = document.getElementById('textsList');
  container.innerHTML = '';
  
  let texts = APP.data.texts.texts;
  if (!texts || texts.length === 0) {
    container.innerHTML = `<div class="empty-state">Тексты не найдены</div>`;
    return;
  }

  if (APP.state.textsTopic !== 'all') {
    texts = texts.filter(t => t.topic === APP.state.textsTopic);
  }
  
  if (texts.length === 0) {
    container.innerHTML = `<div class="empty-state">Нет текстов для этой темы</div>`;
    return;
  }
  
  texts.forEach((sourceText, i) => {
    const t = getActiveText(sourceText);
    const card = document.createElement('div');
    card.className = `text-card text-card-${APP.state.textsVariant}`;
    
    let kwHTML = '';
    if (t.keywords) {
      kwHTML = `<div class="text-keywords">` + t.keywords.map(k => `<span class="keyword-chip">${k}</span>`).join('') + `</div>`;
    }
    
    card.innerHTML = `
      <div class="text-meta">
        <div>
          <div class="text-variant-label">${APP.state.textsVariant === 'abkhazia' ? 'Адаптация про Абхазию' : 'Исходный учебный текст'}</div>
          <div class="text-title">${t.title}</div>
        </div>
        <div class="text-meta-actions">
          <button class="icon-action-btn text-speak-btn" type="button" aria-label="Озвучить текст" title="Озвучить текст">
            ${speakerIcon()}
          </button>
          <div class="text-topic-tag">${APP.data.words.topics.find(top => top.id === sourceText.topic)?.title.split(' — ')[0] || 'Текст'}</div>
        </div>
      </div>
      
      <div class="text-toggle" id="tt-${i}">
        <button class="text-toggle-btn active" data-target="full">Полный</button>
        <button class="text-toggle-btn" data-target="short">Краткий</button>
        <button class="text-toggle-btn" data-target="trans">Перевод</button>
      </div>
      
      <div class="text-body active" id="tb-${i}-full">${t.full}</div>
      <div class="text-body" id="tb-${i}-short">${t.short || 'Нет краткой версии'}</div>
      <div class="text-body" id="tb-${i}-trans">${t.translation || 'Нет перевода'}</div>
      
      ${kwHTML}
    `;
    container.appendChild(card);
    
    const btns = card.querySelectorAll('.text-toggle-btn');
    const speakBtn = card.querySelector('.text-speak-btn');
    const bodies = [
      card.querySelector(`#tb-${i}-full`),
      card.querySelector(`#tb-${i}-short`),
      card.querySelector(`#tb-${i}-trans`)
    ];

    speakBtn.onclick = () => {
      const activeTarget = card.querySelector('.text-toggle-btn.active')?.dataset.target || 'full';
      const speechContent = activeTarget === 'short' ? t.short : activeTarget === 'trans' ? t.translation : t.full;
      const speechLang = activeTarget === 'trans' ? 'ru-RU' : 'de-DE';
      speakText(speechContent, speechLang, speakBtn);
    };
    
    btns.forEach(btn => {
      btn.onclick = () => {
        stopSpeech();
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        bodies.forEach(b => b.classList.remove('active'));
        card.querySelector(`#tb-${i}-${target}`).classList.add('active');
      };
    });
  });
}

function getActiveText(sourceText) {
  if (APP.state.textsVariant !== 'abkhazia') return sourceText;
  return {
    ...sourceText,
    ...APP.data.abkhaziaTexts[sourceText.id]
  };
}

// ─────────────────────────────────────────────
// QUIZ SECTION
// ─────────────────────────────────────────────
function initQuiz() {
  document.getElementById('startQuizBtn').onclick = startQuiz;
  document.getElementById('retryQuizBtn').onclick = startQuiz;
  document.getElementById('resetQuizBtn').onclick = resetQuiz;
  updateQuizCountOptions(); // Init with initial values
}

// CUSTOM SELECT LOGIC
function initCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(select => {
    const trigger = select.querySelector('.custom-select-trigger');
    const span = trigger.querySelector('span');
    
    // Toggle open/close
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close others
      document.querySelectorAll('.custom-select').forEach(s => {
        if (s !== select) s.classList.remove('open');
      });
      select.classList.toggle('open');
    });
    
    // Select option (Event Delegation)
    select.addEventListener('click', (e) => {
      const opt = e.target.closest('.custom-select-option');
      if (!opt) return;
      e.stopPropagation();
      const options = select.querySelectorAll('.custom-select-option');
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      span.textContent = opt.textContent;
      select.dataset.value = opt.dataset.val;
      select.classList.remove('open');
      
      // If we changed topic, type or unknown filter, update the count options
      if (['csTopic', 'csUnknown', 'csQuizType'].includes(select.id)) {
        updateQuizCountOptions();
      }
    });
  });

  // Close when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
  });
}

function updateQuizCountOptions() {
  const type = document.getElementById('csQuizType')?.dataset.value || 'words';
  const topicId = document.getElementById('csTopic').dataset.value;
  const unknownFilter = document.getElementById('csUnknown').dataset.value;
  
  let pool = [];
  if (type === 'words') {
    document.getElementById('rowUnknown').style.display = 'flex';
    APP.data.words.topics.forEach(t => {
      if (topicId === 'all' || topicId === t.id) {
        pool = pool.concat(t.words);
      }
    });
    if (unknownFilter === 'unknown') {
      pool = pool.filter(w => !APP.state.wordsKnown[w.id]);
    }
  } else {
    document.getElementById('rowUnknown').style.display = 'none';
    pool = getSentencesPool(topicId);
  }
  
  const total = pool.length;
  const container = document.getElementById('csCountOptions');
  const countSelect = document.getElementById('csCount');
  const span = countSelect.querySelector('.custom-select-trigger span');
  
  container.innerHTML = '';
  
  let options = [];
  if (total <= 10) {
    options = [total];
  } else if (total <= 20) {
    options = [10, total];
  } else if (total <= 40) {
    options = [10, 20, total];
  } else {
    options = [10, 20, 50, total];
  }
  // limit to 3 options max (10, 20/50, All)
  if (options.length > 3) {
    options = [10, 50, total];
  }
  
  // Create elements
  options.forEach((num, index) => {
    // If num is 0, don't show any, or show 0
    const opt = document.createElement('div');
    opt.className = 'custom-select-option';
    opt.dataset.val = num;
    opt.textContent = num === total ? `Все (${total})` : num;
    if (index === 0) {
      opt.classList.add('selected');
      countSelect.dataset.value = num;
      span.textContent = opt.textContent;
    }
    container.appendChild(opt);
  });
  
  if (total === 0) {
    const opt = document.createElement('div');
    opt.className = 'custom-select-option selected';
    opt.dataset.val = 0;
    opt.textContent = 'Нет слов';
    container.appendChild(opt);
    countSelect.dataset.value = 0;
    span.textContent = 'Нет слов';
  }
}

function getQuizConfig() {
  return {
    type: document.getElementById('csQuizType')?.dataset.value || 'words',
    dir: document.getElementById('csDir').dataset.value,
    topic: document.getElementById('csTopic').dataset.value,
    count: parseInt(document.getElementById('csCount').dataset.value) || 10,
    unknown: document.getElementById('csUnknown').dataset.value
  };
}

function startQuiz() {
  const cfg = getQuizConfig();
  APP.quiz.config = cfg;
  
  let pool = [];
  if (cfg.type === 'words') {
    APP.data.words.topics.forEach(t => {
      if (cfg.topic === 'all' || cfg.topic === t.id) {
        pool = pool.concat(t.words);
      }
    });
    if (cfg.unknown === 'unknown') {
      pool = pool.filter(w => !APP.state.wordsKnown[w.id]);
    }
  } else {
    pool = getSentencesPool(cfg.topic);
  }
  
  if (pool.length < 4) {
    showToast('Недостаточно данных для теста (минимум 4)');
    return;
  }
  
  // Shuffle & pick
  pool.sort(() => 0.5 - Math.random());
  APP.quiz.questions = pool.slice(0, Math.min(cfg.count, pool.length));
  
  // Full random pool for distractors
  let allDistractors = [];
  if (cfg.type === 'words') {
    APP.data.words.topics.forEach(t => allDistractors = allDistractors.concat(t.words));
  } else {
    allDistractors = getSentencesPool('all');
  }
  
  APP.quiz.questions = APP.quiz.questions.map(q => {
    const isDe2Ru = cfg.dir === 'de-ru';
    const qText = isDe2Ru ? q.de : q.ru;
    const correctA = isDe2Ru ? q.ru : q.de;
    
    // Pick 3 random wrong answers
    let distractors = [];
    let attempts = 0;
    while (distractors.length < 3 && attempts < 100) {
      const rnd = allDistractors[Math.floor(Math.random() * allDistractors.length)];
      const rndA = isDe2Ru ? rnd.ru : rnd.de;
      if (rndA !== correctA && !distractors.includes(rndA)) {
        distractors.push(rndA);
      }
      attempts++;
    }
    
    const answers = [correctA, ...distractors];
    answers.sort(() => 0.5 - Math.random()); // shuffle
    
    return { q: qText, a: correctA, options: answers };
  });
  
  APP.quiz.currentIndex = 0;
  APP.quiz.score = 0;
  APP.quiz.wrong = 0;
  APP.quiz.active = true;
  
  document.getElementById('quizSetup').style.display = 'none';
  document.getElementById('quizResults').classList.remove('show');
  document.getElementById('quizActive').classList.add('running');
  
  updateBadge('Тест идёт');
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const qObj = APP.quiz.questions[APP.quiz.currentIndex];
  const total = APP.quiz.questions.length;
  const current = APP.quiz.currentIndex + 1;
  
  // Progress
  const pct = ((current - 1) / total) * 100;
  document.getElementById('quizProgressFill').style.width = pct + '%';
  document.getElementById('quizCounter').textContent = `${current} / ${total}`;
  
  // Question
  document.getElementById('quizLabel').textContent = APP.quiz.config.dir === 'de-ru' ? 'Переведи на русский' : 'Переведи на немецкий';
  const quizWordEl = document.getElementById('quizWord');
  quizWordEl.textContent = qObj.q;
  
  if (APP.quiz.config.type === 'sentences') {
    quizWordEl.style.fontSize = '1.1rem';
    quizWordEl.style.fontFamily = 'var(--font)';
    quizWordEl.style.fontWeight = '600';
    quizWordEl.style.lineHeight = '1.4';
  } else {
    quizWordEl.style.fontSize = '';
    quizWordEl.style.fontFamily = '';
    quizWordEl.style.fontWeight = '';
    quizWordEl.style.lineHeight = '';
  }
  
  // Answers
  const container = document.getElementById('quizAnswers');
  container.innerHTML = '';
  
  if (APP.quiz.config.type === 'sentences') {
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
  } else {
    container.style.display = '';
    container.style.flexDirection = '';
  }
  
  qObj.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-answer-btn';
    btn.textContent = opt;
    if (APP.quiz.config.type === 'sentences') {
      btn.style.fontSize = '0.8rem';
      btn.style.lineHeight = '1.35';
      btn.style.textAlign = 'left';
    }
    btn.onclick = () => handleQuizAnswer(btn, opt === qObj.a);
    container.appendChild(btn);
  });
}

function handleQuizAnswer(btn, isCorrect) {
  const container = document.getElementById('quizAnswers');
  const allBtns = container.querySelectorAll('.quiz-answer-btn');
  allBtns.forEach(b => b.disabled = true); // lock
  
  if (isCorrect) {
    btn.classList.add('correct');
    APP.quiz.score++;
  } else {
    btn.classList.add('wrong');
    APP.quiz.wrong++;
    // highlight correct
    const qObj = APP.quiz.questions[APP.quiz.currentIndex];
    allBtns.forEach(b => {
      if (b.textContent === qObj.a) b.classList.add('correct');
    });
  }
  
  setTimeout(() => {
    APP.quiz.currentIndex++;
    if (APP.quiz.currentIndex >= APP.quiz.questions.length) {
      endQuiz();
    } else {
      renderQuizQuestion();
    }
  }, 1200);
}

function endQuiz() {
  document.getElementById('quizActive').classList.remove('running');
  document.getElementById('quizResults').classList.add('show');
  APP.quiz.active = false;
  
  const total = APP.quiz.questions.length;
  const pct = Math.round((APP.quiz.score / total) * 100);
  
  document.getElementById('quizScoreNum').textContent = pct + '%';
  document.getElementById('scoreCorrect').textContent = APP.quiz.score;
  document.getElementById('scoreWrong').textContent = APP.quiz.wrong;
  document.getElementById('scoreTotal').textContent = total;
  
  updateBadge('Тест завершён');
}

function resetQuiz() {
  APP.quiz.active = false;
  document.getElementById('quizActive').classList.remove('running');
  document.getElementById('quizResults').classList.remove('show');
  document.getElementById('quizSetup').style.display = 'block';
  updateBadge('Тест');
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function getSentencesPool(topicId) {
  let sentences = [];
  let textsToProcess = APP.data.texts.texts;
  if (topicId !== 'all') {
    textsToProcess = textsToProcess.filter(t => t.topic === topicId);
  }
  
  textsToProcess.forEach(sourceText => {
    const t = getActiveText(sourceText);
    let deText = t.full.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    let ruText = t.translation.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    let deArr = deText.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜА-ЯЁ«"'])/).map(s => s.trim()).filter(s => s.length > 5);
    let ruArr = ruText.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜА-ЯЁ«"'])/).map(s => s.trim()).filter(s => s.length > 5);
    
    let len = Math.min(deArr.length, ruArr.length);
    for (let i = 0; i < len; i++) {
      sentences.push({
        id: sourceText.id + '_' + APP.state.textsVariant + '_s' + i,
        de: deArr[i],
        ru: ruArr[i]
      });
    }
  });
  return sentences;
}

// ─────────────────────────────────────────────
// AUTH & LEADERBOARD LOGIC
// ─────────────────────────────────────────────
function initAuth() {
  const overlay = document.getElementById('authOverlay');
  const btn = document.getElementById('authBtn');
  const offlineBtn = document.getElementById('authOfflineBtn');
  const inp = document.getElementById('nicknameInput');
  const err = document.getElementById('authError');

  if (!myNickname) {
    overlay.classList.add('show');
    setTimeout(() => inp.focus(), 100);
  } else {
    overlay.classList.remove('show');
    startTimeTracking();
    updateSupabaseTime();
  }

  function validateNickname() {
    const val = inp.value.trim();
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(val)) {
      err.textContent = 'Используйте a-z, 0-9 и _. Длина: 3-15 символов.';
      return null;
    }
    return val;
  }

  function finishAuth(val, isRemote) {
    myNickname = val;
    remoteNicknameRegistered = isRemote;
    STORAGE.set('nickname', val);
    STORAGE.set('nicknameRemote', isRemote ? '1' : '0');
    overlay.classList.remove('show');
    offlineBtn.classList.remove('show');
    startTimeTracking();
    if (APP.state.section === 'leaderboard') renderLeaderboard();
  }

  btn.onclick = async () => {
    const val = validateNickname();
    if (!val) return;

    btn.disabled = true;
    btn.textContent = 'Проверка...';
    err.textContent = '';
    offlineBtn.classList.remove('show');

    try {
      if (await findRemoteNickname(val)) {
        err.textContent = 'Никнейм уже занят. Придумайте другой.';
        return;
      }
      await createRemoteUser(val);
      finishAuth(val, true);
    } catch (error) {
      console.warn('Nickname registration failed:', error);
      err.textContent = 'Рейтинг сейчас недоступен. Сайт можно использовать без него.';
      offlineBtn.classList.add('show');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  };

  offlineBtn.onclick = () => {
    const enteredNickname = inp.value.trim();
    const localNickname = /^[a-zA-Z0-9_]{3,15}$/.test(enteredNickname)
      ? enteredNickname
      : `guest_${deviceId.replace(/-/g, '').slice(0, 8)}`;
    err.textContent = '';
    finishAuth(localNickname, false);
  };

  inp.addEventListener('input', () => {
    err.textContent = '';
    offlineBtn.classList.remove('show');
  });
  inp.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !btn.disabled) btn.click();
  });
}

function startTimeTracking() {
  if (timeTickInterval) clearInterval(timeTickInterval);
  if (timeSyncInterval) clearInterval(timeSyncInterval);
  
  // Local increment every 1 second
  timeTickInterval = setInterval(() => {
    timeSpent++;
    STORAGE.set('timeSpent', timeSpent);
  }, 1000);

  // Sync with Supabase every 10 seconds
  timeSyncInterval = setInterval(updateSupabaseTime, 10000);
}

async function updateSupabaseTime() {
  if (!myNickname || !remoteNicknameRegistered) return;
  try {
    await supabaseRequest('rpc/sync_user', {
      method: 'POST',
      body: JSON.stringify({
        p_device_id: deviceId,
        p_nickname: myNickname,
        p_time_spent: timeSpent,
        p_hide_nickname: privacySettings.hideNickname,
        p_hide_time: privacySettings.hideTime
      })
    });
    privacyApiAvailable = true;
  } catch (error) {
    if (!/function|schema cache|404/i.test(error.message)) {
      console.warn('Time sync failed:', error);
      return;
    }
    privacyApiAvailable = false;
    try {
      await supabaseRequest(`users?nickname=eq.${encodeURIComponent(myNickname)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ time_spent: timeSpent })
      });
    } catch (fallbackError) {
      console.warn('Time sync failed:', fallbackError);
    }
  }
}

function initLeaderboardPrivacy() {
  const nicknameToggle = document.getElementById('hideNicknameToggle');
  const timeToggle = document.getElementById('hideTimeToggle');
  if (!nicknameToggle || !timeToggle) return;

  nicknameToggle.checked = privacySettings.hideNickname;
  timeToggle.checked = privacySettings.hideTime;

  const save = async () => {
    privacySettings = {
      hideNickname: nicknameToggle.checked,
      hideTime: timeToggle.checked
    };
    STORAGE.set('hideNickname', privacySettings.hideNickname ? '1' : '0');
    STORAGE.set('hideTime', privacySettings.hideTime ? '1' : '0');
    setPrivacyStatus('Сохранение...');
    await updateSupabaseTime();
    setPrivacyStatus(
      !remoteNicknameRegistered
        ? 'Только на устройстве'
        : privacyApiAvailable
          ? 'Сохранено'
          : 'Нужна SQL-миграция'
    );
    if (APP.state.section === 'leaderboard') renderLeaderboard();
  };

  nicknameToggle.addEventListener('change', save);
  timeToggle.addEventListener('change', save);
}

function setPrivacyStatus(text) {
  const status = document.getElementById('privacySyncStatus');
  if (status) status.textContent = text;
}

function formatTime(secs) {
  secs = Math.max(0, Number.parseInt(secs, 10) || 0);
  if (secs < 60) return secs + 'с';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}м ${s}с`;
  const h = Math.floor(m / 60);
  const m2 = m % 60;
  return `${h}ч ${m2}м`;
}

async function renderLeaderboard() {
  const container = document.getElementById('leaderboardList');
  container.innerHTML = '<div class="empty-state">Загрузка рейтинга...</div>';
  const deviceTag = await getDeviceTag();

  let data;
  try {
    try {
      data = await supabaseRequest('rpc/get_public_leaderboard', {
        method: 'POST',
        body: JSON.stringify({ p_limit: 50 })
      });
      privacyApiAvailable = true;
    } catch (error) {
      if (!/function|schema cache|404/i.test(error.message)) throw error;
      privacyApiAvailable = false;
      setPrivacyStatus('Нужна SQL-миграция');
      data = await supabaseRequest('users?select=nickname,time_spent&order=time_spent.desc&limit=50');
    }
  } catch (error) {
    console.warn('Leaderboard loading failed:', error);
    container.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.textContent = 'Рейтинг временно недоступен. Остальные разделы работают без него.';
    container.appendChild(message);
    return;
  }
  
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state">Пока нет никого в рейтинге</div>`;
    return;
  }

  container.innerHTML = '';
  data.forEach((user, idx) => {
    const isMe = user.device_tag
      ? user.device_tag === deviceTag
      : user.nickname === myNickname;
    const nicknameHidden = Boolean(user.nickname_hidden ?? user.hide_nickname);
    const timeHidden = Boolean(user.time_hidden ?? user.hide_time);
    const el = document.createElement('div');
    el.className = 'lb-item' + (isMe ? ' is-me' : '');

    const rank = document.createElement('div');
    rank.className = 'lb-rank';
    rank.textContent = `#${user.rank || idx + 1}`;
    const identity = document.createElement('div');
    identity.className = 'lb-identity';
    const name = document.createElement('div');
    name.className = 'lb-name';
    name.textContent = isMe
      ? String(myNickname || 'Вы')
      : String(user.display_name || user.nickname || 'Анонимный участник');
    if (isMe) {
      const me = document.createElement('span');
      me.className = 'lb-me';
      me.textContent = 'Вы';
      name.appendChild(me);
    }
    const detail = document.createElement('div');
    detail.className = 'lb-detail';
    detail.textContent = nicknameHidden ? 'Ник скрыт' : 'Участник рейтинга';
    identity.append(name, detail);
    const time = document.createElement('div');
    time.className = 'lb-time';
    const publicTime = user.display_time ?? user.time_spent;
    if ((timeHidden && !isMe) || publicTime == null) {
      time.classList.add('is-private');
      time.textContent = 'Скрыто';
    } else {
      time.textContent = formatTime(isMe ? timeSpent : publicTime);
    }
    el.append(rank, identity, time);
    container.appendChild(el);
  });
}
