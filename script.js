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
    builderMistake: false,
    config: { dir: 'de-ru', topic: 'all', count: 10, unknown: 'all' }
  },
  translationPrep: {
    tab: 'words',
    wordsOffset: 0,
    phrasesOffset: 0
  },
  exam: {
    selectedTopics: [],
    questions: [],
    currentIndex: 0,
    score: 0,
    mistakes: [],
    topicStats: {},
    active: false,
    locked: false
  }
};

// ─────────────────────────────────────────────
// INIT & SUPABASE
// ─────────────────────────────────────────────
const TEXT_STUDY_MAP = {
  t14: {
    theme: 'Распорядок учебного дня от подъёма до сна.',
    people: 'Студент юридического факультета.',
    places: 'Schellingstraße, Universität, Mensa, Bibliothek.',
    numbers: '6:30, 7:00, 7:30, 8:00–15:30, 20:00, 23:00.',
    markers: ['Tagesablauf', 'aufstehen', 'Frühstück', 'Haltestelle', 'Jura', 'Universität', 'Unterricht', 'Mensa', 'Bibliothek', 'einschlafen'],
    confused: 'С работой: здесь университет, Mensa и учёба. Со свободным временем: действия идут по времени в течение одного дня.'
  },
  t16: {
    theme: 'Свободное время в будни, выходные и отпуск.',
    people: 'Рассказчик и его семья.',
    places: 'Kino, Theater, Café, Restaurant, Fluss, Natur.',
    numbers: 'Выходные; конкретного расписания почти нет.',
    markers: ['Freizeit', 'Wochenende', 'ausgehen', 'Ausstellung', 'spazieren', 'Familie', 'ins Grüne', 'Picknick', 'Fluss', 'Boot fahren'],
    confused: 'С временами года: погода здесь определяет досуг. С распорядком дня: ключевой признак — Wochenende и занятия для отдыха.'
  },
  t17: {
    theme: 'Новая квартира Анны и обстановка комнат.',
    people: 'Anna Meier.',
    places: 'Schellingstraße, Flur, Badezimmer, Küche, Schlafzimmer, Kinderzimmer, Wohnzimmer.',
    numbers: '4-й этаж, 82 m², 3 комнаты, гостиная 5 × 4 м, 4 стула.',
    markers: ['Anna Meier', 'Wohnung', 'umziehen', 'Stock', 'Fahrstuhl', 'Quadratmeter', 'Badewanne', 'Geschirrspüler', 'Kleiderschrank', 'Ecksofa'],
    confused: 'С письмом: там тоже есть уютная комната, но здесь перечисляют всю квартиру, мебель и размеры.'
  },
  t19: {
    theme: 'Письмо о практике и жизни в Испании.',
    people: 'Автор письма, Walter, клиент из Германии.',
    places: 'Spanien, Barcelona, Meer, Strand, Sagrada Familia, Juristenbüro.',
    numbers: 'Две недели в Испании; события прошлой недели.',
    markers: ['Lieber Walter', 'Brief', 'Spanien', 'Barcelona', 'Praktikum', 'Meer', 'Sagrada Familia', 'Juristenbüro', 'Klient', 'Sprache'],
    confused: 'С квартирой: уютная комната относится к съёмному жилью в Барселоне. С работой: это практика в юридическом бюро.'
  },
  t20: {
    theme: 'Работа секретаря после декретного отпуска.',
    people: 'Секретарь, её сын Franz, начальник, коллеги и деловые партнёры.',
    places: 'Firma STEIFF, Büro, Kindergarten.',
    numbers: 'Работа 8:00–13:00, подъём в 6:00, зарплата около 1200 евро.',
    markers: ['Franz', 'Kindergarten', 'Sekretärin', 'STEIFF', 'Teilzeit', 'Büroarbeit', 'E-Mails', 'Termine', 'Geschäftsreisen', 'Gehalt'],
    confused: 'С распорядком дня: здесь главное — обязанности секретаря. С письмом: это постоянная работа, а не практика.'
  },
  t21: {
    theme: 'Части человеческого тела, органы и их функции.',
    people: 'Человек в общем, без конкретных имён.',
    places: 'Мест нет: описание внешних частей тела и внутренних органов.',
    numbers: '2 руки, 2 ноги, 5 пальцев.',
    markers: ['Körper', 'Kopf', 'Brust', 'Bauch', 'Rücken', 'Augen', 'Ohren', 'Zunge', 'Hände', 'Organe'],
    confused: 'С врачом: здесь объясняют строение и функции тела. Нет диагноза, осмотра, симптомов и лекарств.'
  },
  t22: {
    theme: 'Простуда, осмотр врача и назначение лекарств.',
    people: 'Пациент и Doktor Schneider.',
    places: 'Arztpraxis, Sprechstunde.',
    numbers: 'Сироп каждый час, лекарство 2 раза в день, повторный приём через 3 дня.',
    markers: ['Doktor Schneider', 'Husten', 'Halsschmerzen', 'Schnupfen', 'Fieber', 'untersuchen', 'Diagnose', 'Hustensaft', 'Nasentropfen', 'Besserung'],
    confused: 'С телом: Lungen abhören означает осмотр врача, а перечисление Herz, Lungen, Magen — устройство тела.'
  },
  t23: {
    theme: 'Четыре времени года, месяцы и изменения погоды.',
    people: 'Люди в общем, без конкретных персонажей.',
    places: 'Природа, улицы, реки и озёра.',
    numbers: '4 сезона, по 3 месяца; летом +25 °C, зимой −10 °C.',
    markers: ['Jahreszeiten', 'Frühling', 'Sommer', 'Herbst', 'Winter', 'Monate', 'Grad', 'Gewitter', 'Blätter', 'Schnee'],
    confused: 'Со свободным временем: спорт и купание здесь служат примерами сезона; главный признак — месяцы, температура и погода.'
  }
};

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

function initApp() {
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
    initExam();
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

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
  if (APP.exam.active && sectionId !== 'exam') {
    if (!confirm('Экзамен ещё не завершён. Прервать его?')) return;
    resetExam();
  }
  
  APP.state.section = sectionId;
  
  // Update Buttons
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-section="${sectionId}"]`).classList.add('active');
  
  // Update Sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`sec-${sectionId}`).classList.add('active');
  
  window.scrollTo({ top: 0, behavior: 'auto' });
  
  const titles = { words: 'Слова', texts: 'Тексты', quiz: 'Тест', exam: 'Экзамен', leaderboard: 'Рейтинг' };
  updateBadge(titles[sectionId]);
  
  if (sectionId === 'leaderboard') {
    renderLeaderboard();
  }
}

// ─────────────────────────────────────────────
// EXAM SECTION
// ─────────────────────────────────────────────
function initExam() {
  const topicGrid = document.getElementById('examTopicGrid');
  if (!topicGrid) return;

  const examTopics = APP.data.texts.texts.map(text => ({
    id: text.topic,
    textTitle: text.title,
    lectureTitle: APP.data.words.topics.find(topic => topic.id === text.topic)?.title || text.topic
  }));

  APP.exam.selectedTopics = examTopics.slice(0, 3).map(topic => topic.id);
  topicGrid.innerHTML = '';
  examTopics.forEach(topic => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'exam-topic-btn';
    button.dataset.topic = topic.id;
    button.innerHTML = `
      <span>${topic.lectureTitle.split(' — ')[0]}</span>
      <strong>${topic.textTitle}</strong>
      <small>${topic.lectureTitle.split(' — ')[1] || ''}</small>
    `;
    button.onclick = () => toggleExamTopic(topic.id);
    topicGrid.appendChild(button);
  });

  document.getElementById('startExamBtn').onclick = startExam;
  document.getElementById('retryExamBtn').onclick = startExam;
  document.getElementById('resetExamBtn').onclick = resetExam;
  renderExamTopicSelection();
}

function toggleExamTopic(topicId) {
  const index = APP.exam.selectedTopics.indexOf(topicId);
  if (index >= 0) {
    APP.exam.selectedTopics.splice(index, 1);
  } else if (APP.exam.selectedTopics.length < 4) {
    APP.exam.selectedTopics.push(topicId);
  } else {
    showToast('Можно выбрать максимум 4 лекции');
  }
  renderExamTopicSelection();
}

function renderExamTopicSelection() {
  document.querySelectorAll('.exam-topic-btn').forEach(button => {
    const selected = APP.exam.selectedTopics.includes(button.dataset.topic);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const count = APP.exam.selectedTopics.length;
  const status = document.getElementById('examSelectionStatus');
  status.textContent = count < 3 ? `Выбрано: ${count}. Нужно ещё ${3 - count}` : `Выбрано: ${count} из 4`;
  status.classList.toggle('ready', count === 3 || count === 4);
  document.getElementById('startExamBtn').disabled = count < 3 || count > 4;
}

function startExam() {
  if (APP.exam.selectedTopics.length < 3 || APP.exam.selectedTopics.length > 4) {
    showToast('Выбери 3 или 4 лекции');
    return;
  }

  const requestedCount = parseInt(document.getElementById('examQuestionCount').value, 10) || 20;
  const questions = createExamQuestions(APP.exam.selectedTopics, requestedCount);
  if (questions.length < requestedCount) {
    showToast('В выбранных лекциях недостаточно заданий');
    return;
  }

  APP.exam.questions = questions;
  APP.exam.currentIndex = 0;
  APP.exam.score = 0;
  APP.exam.mistakes = [];
  APP.exam.topicStats = {};
  APP.exam.active = true;
  APP.exam.locked = false;
  APP.exam.selectedTopics.forEach(topicId => {
    APP.exam.topicStats[topicId] = { correct: 0, total: 0 };
  });

  document.getElementById('examSetup').style.display = 'none';
  document.getElementById('examResults').classList.remove('show');
  document.getElementById('examActive').classList.add('running');
  updateBadge('Экзамен идёт');
  renderExamQuestion();
}

function createExamQuestions(topicIds, count) {
  const sentencePool = getOriginalSentencesPool(topicIds);
  const wordPool = [];
  topicIds.forEach(topicId => {
    const topic = APP.data.words.topics.find(item => item.id === topicId);
    if (!topic) return;
    topic.words.forEach(word => {
      wordPool.push({
        id: `exam_${word.id}`,
        type: 'word',
        prompt: word.ru,
        answer: word.de,
        topicId,
        topicTitle: topic.title,
        sourceTitle: topic.title.split(' — ')[1] || topic.title
      });
    });
  });

  const sentenceCount = Math.min(sentencePool.length, Math.round(count * 0.6));
  const wordCount = count - sentenceCount;
  const selectedSentences = pickBalancedExamItems(sentencePool, sentenceCount, topicIds).map(sentence => ({
    id: `exam_${sentence.id}`,
    type: 'sentence',
    prompt: sentence.ru,
    answer: sentence.de,
    blocks: createSentenceBlocks(sentence.de),
    topicId: sentence.topicId,
    topicTitle: sentence.topicTitle,
    sourceTitle: sentence.sourceTitle
  }));
  const selectedWords = pickBalancedExamItems(wordPool, wordCount, topicIds).map(word => ({
    ...word,
    options: createExamWordOptions(word, wordPool)
  }));

  return shuffleArray([...selectedSentences, ...selectedWords]);
}

function pickBalancedExamItems(pool, count, topicIds) {
  const buckets = {};
  topicIds.forEach(topicId => {
    buckets[topicId] = shuffleArray(pool.filter(item => item.topicId === topicId));
  });

  const selected = [];
  while (selected.length < count) {
    let added = false;
    shuffleArray([...topicIds]).forEach(topicId => {
      if (selected.length >= count || buckets[topicId].length === 0) return;
      selected.push(buckets[topicId].shift());
      added = true;
    });
    if (!added) break;
  }
  return selected;
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createExamWordOptions(word, pool) {
  const uniqueAnswers = [...new Set(pool
    .filter(item => item.answer !== word.answer)
    .map(item => item.answer))];
  const distractors = shuffleArray(uniqueAnswers).slice(0, 3);
  return shuffleArray([word.answer, ...distractors]);
}

function getOriginalSentencesPool(selectedTopics) {
  const sentences = [];
  APP.data.texts.texts
    .filter(text => selectedTopics.includes(text.topic))
    .forEach(sourceText => {
      const deArr = splitTextIntoSentences(sourceText.full);
      const ruArr = splitTextIntoSentences(sourceText.translation);
      const topicTitle = APP.data.words.topics.find(topic => topic.id === sourceText.topic)?.title || sourceText.topic;
      const length = Math.min(deArr.length, ruArr.length);
      for (let index = 0; index < length; index++) {
        sentences.push({
          id: `${sourceText.id}_original_exam_${index}`,
          de: deArr[index],
          ru: ruArr[index],
          topicId: sourceText.topic,
          topicTitle,
          sourceTitle: sourceText.title
        });
      }
    });
  return sentences;
}

function splitTextIntoSentences(text) {
  return String(text || '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜА-ЯЁ«"'])/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 5);
}

function renderExamQuestion() {
  const question = APP.exam.questions[APP.exam.currentIndex];
  const current = APP.exam.currentIndex + 1;
  const total = APP.exam.questions.length;
  APP.exam.locked = false;

  document.getElementById('examCounter').textContent = `${current} / ${total}`;
  document.getElementById('examProgressFill').style.width = `${((current - 1) / total) * 100}%`;
  document.getElementById('examQuestionType').textContent = question.type === 'word'
    ? 'Слово · RU → DE'
    : 'Предложение · RU → DE';
  document.getElementById('examQuestionTopic').textContent = `${question.topicTitle.split(' — ')[0]} · ${question.sourceTitle}`;
  document.getElementById('examQuestionPrompt').textContent = question.prompt;

  const answerArea = document.getElementById('examAnswerArea');
  answerArea.innerHTML = '';
  answerArea.className = `exam-answer-area exam-${question.type}`;
  if (question.type === 'word') {
    renderExamWordQuestion(answerArea, question);
  } else {
    renderExamSentenceQuestion(answerArea, question);
  }
}

function renderExamWordQuestion(container, question) {
  const options = document.createElement('div');
  options.className = 'exam-word-options';
  question.options.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'exam-word-option';
    button.textContent = option;
    button.onclick = () => {
      if (APP.exam.locked) return;
      const correct = option === question.answer;
      options.querySelectorAll('button').forEach(item => {
        item.disabled = true;
        if (item.textContent === question.answer) item.classList.add('correct');
      });
      if (!correct) button.classList.add('wrong');
      finishExamAttempt(correct, question, option, container);
    };
    options.appendChild(button);
  });
  container.appendChild(options);
}

function renderExamSentenceQuestion(container, question) {
  const state = {
    bank: shuffleBuilderBlocks(question.blocks),
    answer: []
  };
  container.innerHTML = `
    <div class="exam-builder-label">Собери немецкое предложение</div>
    <div class="exam-builder-answer" id="examBuilderAnswer"><span>Нажимай на блоки по порядку</span></div>
    <div class="exam-builder-bank" id="examBuilderBank"></div>
    <button class="btn btn-primary btn-block exam-check-btn" id="examCheckBtn" type="button" disabled>Ответить</button>
  `;

  const answer = container.querySelector('#examBuilderAnswer');
  const bank = container.querySelector('#examBuilderBank');
  const check = container.querySelector('#examCheckBtn');

  const draw = () => {
    answer.innerHTML = '';
    if (state.answer.length === 0) {
      answer.innerHTML = '<span>Нажимай на блоки по порядку</span>';
    } else {
      state.answer.forEach(item => answer.appendChild(createBuilderBlock(item, () => {
        if (APP.exam.locked) return;
        state.answer = state.answer.filter(block => block.id !== item.id);
        state.bank.push(item);
        draw();
      })));
    }
    bank.innerHTML = '';
    state.bank.forEach(item => bank.appendChild(createBuilderBlock(item, () => {
      if (APP.exam.locked) return;
      state.bank = state.bank.filter(block => block.id !== item.id);
      state.answer.push(item);
      draw();
    })));
    check.disabled = state.answer.length !== question.blocks.length;
  };

  check.onclick = () => {
    if (APP.exam.locked) return;
    const correct = state.answer.every((item, index) => item.id === index);
    const givenAnswer = state.answer.map(item => item.text).join(' ');
    answer.classList.add(correct ? 'correct' : 'wrong');
    finishExamAttempt(correct, question, givenAnswer, container);
  };
  draw();
}

function finishExamAttempt(correct, question, givenAnswer, container) {
  APP.exam.locked = true;
  const stats = APP.exam.topicStats[question.topicId];
  stats.total++;
  if (correct) {
    APP.exam.score++;
    stats.correct++;
  } else {
    APP.exam.mistakes.push({
      type: question.type,
      prompt: question.prompt,
      answer: question.answer,
      givenAnswer,
      topicTitle: question.topicTitle
    });
  }

  const feedback = document.createElement('div');
  feedback.className = `exam-feedback ${correct ? 'correct' : 'wrong'}`;
  feedback.innerHTML = `
    <strong>${correct ? 'Верно' : 'Ошибка. Попытка использована'}</strong>
    <span>${question.answer}</span>
    <button class="btn ${correct ? 'btn-primary' : 'btn-ghost'} btn-block" type="button">
      ${APP.exam.currentIndex + 1 >= APP.exam.questions.length ? 'Показать результат' : 'Следующее задание'}
    </button>
  `;
  feedback.querySelector('button').onclick = advanceExam;
  container.appendChild(feedback);
}

function advanceExam() {
  APP.exam.currentIndex++;
  if (APP.exam.currentIndex >= APP.exam.questions.length) {
    endExam();
  } else {
    renderExamQuestion();
  }
}

function getExamGrade(percent) {
  if (percent >= 90) return 5;
  if (percent >= 75) return 4;
  if (percent >= 55) return 3;
  return 2;
}

function endExam() {
  APP.exam.active = false;
  document.getElementById('examActive').classList.remove('running');
  document.getElementById('examResults').classList.add('show');

  const total = APP.exam.questions.length;
  const percent = Math.round((APP.exam.score / total) * 100);
  const grade = getExamGrade(percent);
  document.getElementById('examGrade').textContent = grade;
  document.getElementById('examGrade').dataset.grade = grade;
  document.getElementById('examResultTitle').textContent = grade >= 3 ? 'Экзамен сдан' : 'Экзамен не сдан';
  document.getElementById('examResultPercent').textContent = `${percent}%`;
  document.getElementById('examResultSummary').textContent =
    `Верно ${APP.exam.score} из ${total}. Ошибок: ${APP.exam.mistakes.length}.`;

  renderExamTopicResults();
  renderExamErrors();
  updateBadge(`Экзамен: ${grade}`);
}

function renderExamTopicResults() {
  const container = document.getElementById('examTopicResults');
  container.innerHTML = '';
  APP.exam.selectedTopics.forEach(topicId => {
    const stats = APP.exam.topicStats[topicId];
    const topic = APP.data.words.topics.find(item => item.id === topicId);
    const percent = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    const item = document.createElement('div');
    item.className = 'exam-topic-result';
    item.innerHTML = `
      <div><strong>${topic?.title.split(' — ')[0] || topicId}</strong><span>${stats.correct} из ${stats.total}</span></div>
      <div class="exam-topic-result-bar"><span style="width:${percent}%"></span></div>
    `;
    container.appendChild(item);
  });
}

function renderExamErrors() {
  const section = document.getElementById('examErrorsSection');
  const list = document.getElementById('examErrorsList');
  list.innerHTML = '';
  section.hidden = APP.exam.mistakes.length === 0;
  APP.exam.mistakes.forEach(mistake => {
    const item = document.createElement('article');
    item.className = 'exam-error-card';
    item.innerHTML = `
      <small>${mistake.topicTitle.split(' — ')[0]} · ${mistake.type === 'word' ? 'слово' : 'предложение'}</small>
      <div>${mistake.prompt}</div>
      <strong>${mistake.answer}</strong>
    `;
    list.appendChild(item);
  });
}

function resetExam() {
  APP.exam.active = false;
  APP.exam.locked = false;
  document.getElementById('examActive')?.classList.remove('running');
  document.getElementById('examResults')?.classList.remove('show');
  const setup = document.getElementById('examSetup');
  if (setup) setup.style.display = 'block';
  updateBadge('Экзамен');
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
    opt.innerHTML = `<span class="multi-check" aria-hidden="true"></span><span>${t.title}</span>`;
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
      renderTranslationPrep();
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
  initTextStudyMap();
  initTranslationPrep();
  updateQuizCountOptions(); // Init with initial values
}

function initTranslationPrep() {
  const toggle = document.getElementById('translationPrepToggle');
  const panel = document.getElementById('translationPrepPanel');
  const refreshBtn = document.getElementById('translationPrepRefresh');
  const builderBtn = document.getElementById('translationPrepBuilder');
  if (!toggle || !panel) return;

  toggle.onclick = () => {
    const shouldOpen = panel.hidden;
    panel.hidden = !shouldOpen;
    toggle.classList.toggle('open', shouldOpen);
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) renderTranslationPrep();
  };

  panel.querySelectorAll('[data-prep-tab]').forEach(button => {
    button.onclick = () => {
      APP.translationPrep.tab = button.dataset.prepTab;
      panel.querySelectorAll('[data-prep-tab]').forEach(item => {
        const isActive = item === button;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', String(isActive));
      });
      renderTranslationPrep();
    };
  });

  refreshBtn.onclick = () => {
    if (APP.translationPrep.tab === 'words') {
      APP.translationPrep.wordsOffset += 12;
    } else {
      APP.translationPrep.phrasesOffset += 6;
    }
    renderTranslationPrep();
  };

  builderBtn.onclick = () => {
    setCustomSelectValue('csQuizType', 'builder');
    updateQuizCountOptions();
    document.getElementById('quizSetup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Выбран режим «Конструктор предложений»');
  };
}

function setCustomSelectValue(selectId, value) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const options = [...select.querySelectorAll('.custom-select-option')];
  const selected = options.find(option => option.dataset.val === value);
  if (!selected) return;
  options.forEach(option => option.classList.toggle('selected', option === selected));
  select.dataset.value = value;
  const label = select.querySelector('.custom-select-trigger span');
  if (label) label.textContent = selected.textContent.trim();
}

function renderTranslationPrep() {
  const panel = document.getElementById('translationPrepPanel');
  const grid = document.getElementById('translationPrepGrid');
  const meta = document.getElementById('translationPrepMeta');
  const tip = document.getElementById('translationPrepTip');
  if (!panel || panel.hidden || !grid || !meta || !tip || !APP.data.texts) return;

  const selectedTopics = getSelectedQuizTopics();
  const isWords = APP.translationPrep.tab === 'words';
  const variantLabel = APP.state.textsVariant === 'original' ? 'Оригинальные тексты' : 'Адаптация про Абхазию';
  const pool = isWords
    ? getTextVocabularyPool(selectedTopics)
    : getTranslationPhrasePool(selectedTopics);
  const pageSize = isWords ? 12 : 6;
  const offsetKey = isWords ? 'wordsOffset' : 'phrasesOffset';
  const safeOffset = pool.length ? APP.translationPrep[offsetKey] % pool.length : 0;
  const items = takeCircularItems(pool, safeOffset, pageSize);

  meta.textContent = `${variantLabel} · найдено ${pool.length}`;
  tip.textContent = isWords
    ? 'Сначала переведи русское слово в голове, затем открой немецкий вариант и произнеси его вслух.'
    : 'Прочитай русское предложение и попробуй назвать немецкие части по порядку. Затем открой блоки и повтори всю фразу.';
  grid.className = `translation-prep-grid ${isWords ? 'prep-words-grid' : 'prep-phrases-grid'}`;
  grid.innerHTML = '';

  if (items.length === 0) {
    grid.innerHTML = '<div class="translation-prep-empty">Для выбранных тем материал не найден.</div>';
    return;
  }

  items.forEach((item, index) => {
    const card = isWords
      ? createPrepWordCard(item, index)
      : createPrepPhraseCard(item, index);
    grid.appendChild(card);
  });
}

function takeCircularItems(items, offset, count) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => items[(offset + index) % items.length]);
}

function getTextVocabularyPool(selectedTopics = null) {
  const results = [];
  const seen = new Set();

  APP.data.texts.texts.forEach(sourceText => {
    if (!isQuizTopicSelected(sourceText.topic, selectedTopics)) return;
    const activeText = getActiveText(sourceText);
    const topic = APP.data.words.topics.find(item => item.id === sourceText.topic);
    if (!topic) return;

    topic.words.forEach(word => {
      const key = word.de.toLocaleLowerCase('de-DE');
      if (seen.has(key) || !wordOccursInText(word.de, activeText.full)) return;
      seen.add(key);
      results.push({
        ...word,
        sourceTitle: activeText.title,
        topicId: sourceText.topic
      });
    });
  });
  return results;
}

function wordOccursInText(dictionaryValue, text) {
  const normalizedText = normalizeGermanSearchText(text);
  const tokens = normalizeGermanSearchText(dictionaryValue)
    .replace(/\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer)\b/g, ' ')
    .split(' ')
    .filter(token => token.length >= 4);
  if (tokens.length === 0) return false;

  return tokens.some(token => {
    if (normalizedText.includes(` ${token} `)) return true;
    const stem = token.endsWith('en') ? token.slice(0, -2) : token.endsWith('n') ? token.slice(0, -1) : token;
    return stem.length >= 4 && normalizedText.split(' ').some(textToken => textToken.startsWith(stem));
  });
}

function normalizeGermanSearchText(value) {
  return ` ${String(value || '')
    .toLocaleLowerCase('de-DE')
    .replace(/[„“"'«»()[\],.!?;:–—/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function getTranslationPhrasePool(selectedTopics = null) {
  return getSentencesPool(selectedTopics)
    .map(sentence => ({
      ...sentence,
      blocks: createSentenceBlocks(sentence.de)
    }))
    .filter(sentence => sentence.blocks.length >= 2);
}

function createPrepWordCard(item, index) {
  const card = document.createElement('article');
  card.className = 'translation-prep-card prep-word-card';
  card.innerHTML = `
    <div class="prep-card-number">${index + 1}</div>
    <div class="prep-card-prompt">${item.ru}</div>
    <div class="prep-card-answer" hidden>
      <strong>${item.de}</strong>
      <button class="prep-speak-btn" type="button" aria-label="Прослушать немецкое слово">${speakerIcon()}</button>
    </div>
    <div class="prep-card-source">${item.sourceTitle}</div>
    <button class="prep-reveal-btn" type="button">Показать по-немецки</button>
  `;
  const answer = card.querySelector('.prep-card-answer');
  const reveal = card.querySelector('.prep-reveal-btn');
  reveal.onclick = () => {
    answer.hidden = false;
    reveal.hidden = true;
  };
  const speakBtn = card.querySelector('.prep-speak-btn');
  speakBtn.onclick = () => speakGerman(item.de, speakBtn);
  return card;
}

function createPrepPhraseCard(item, index) {
  const card = document.createElement('article');
  card.className = 'translation-prep-card prep-phrase-card';
  card.innerHTML = `
    <div class="prep-phrase-head">
      <span>Предложение ${index + 1}</span>
      <small>${item.sourceTitle}</small>
    </div>
    <div class="prep-card-prompt">${item.ru}</div>
    <div class="prep-phrase-answer" hidden>
      <div class="prep-phrase-blocks">${item.blocks.map(block => `<span>${block}</span>`).join('')}</div>
      <div class="prep-phrase-full">${item.de}</div>
      <button class="prep-speak-btn prep-phrase-speak" type="button">${speakerIcon()}<span>Прослушать</span></button>
    </div>
    <button class="prep-reveal-btn" type="button">Показать немецкие блоки</button>
  `;
  const answer = card.querySelector('.prep-phrase-answer');
  const reveal = card.querySelector('.prep-reveal-btn');
  reveal.onclick = () => {
    answer.hidden = false;
    reveal.hidden = true;
  };
  const speakBtn = card.querySelector('.prep-speak-btn');
  speakBtn.onclick = () => speakGerman(item.de, speakBtn);
  return card;
}

function initTextStudyMap() {
  const toggle = document.getElementById('textMapToggle');
  const panel = document.getElementById('textMapPanel');
  if (!toggle || !panel) return;

  renderTextStudyMap();
  toggle.onclick = () => {
    const shouldOpen = panel.hidden;
    panel.hidden = !shouldOpen;
    toggle.classList.toggle('open', shouldOpen);
    toggle.setAttribute('aria-expanded', String(shouldOpen));
  };
}

function renderTextStudyMap() {
  const grid = document.getElementById('textMapGrid');
  if (!grid) return;
  grid.innerHTML = '';

  APP.data.texts.texts.forEach((text, index) => {
    const profile = TEXT_STUDY_MAP[text.id];
    if (!profile) return;

    const card = document.createElement('article');
    card.className = 'text-map-card';
    card.innerHTML = `
      <div class="text-map-card-head">
        <span>${index + 1}</span>
        <div>
          <strong>${text.title}</strong>
          <small>${APP.data.words.topics.find(topic => topic.id === text.topic)?.title || ''}</small>
        </div>
      </div>
      <dl class="text-map-facts">
        <div><dt>Тема</dt><dd>${profile.theme}</dd></div>
        <div><dt>Персонажи</dt><dd>${profile.people}</dd></div>
        <div><dt>Места</dt><dd>${profile.places}</dd></div>
        <div><dt>Числа и даты</dt><dd>${profile.numbers}</dd></div>
      </dl>
      <div class="text-map-markers">
        <span class="text-map-label">10 слов-маркеров</span>
        <div>${profile.markers.map(marker => `<span>${marker}</span>`).join('')}</div>
      </div>
      <div class="text-map-warning">
        <strong>Легко перепутать</strong>
        <span>${profile.confused}</span>
      </div>
    `;
    grid.appendChild(card);
  });
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
      if (select.dataset.multiple === 'true') {
        handleMultiSelectOption(select, opt, span);
        return;
      }
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

function handleMultiSelectOption(select, opt, label) {
  const options = [...select.querySelectorAll('.custom-select-option')];
  const allOption = options.find(item => item.dataset.val === 'all');
  const topicOptions = options.filter(item => item.dataset.val !== 'all');

  if (opt.dataset.val === 'all') {
    options.forEach(item => item.classList.toggle('selected', item === allOption));
  } else {
    opt.classList.toggle('selected');
    allOption?.classList.remove('selected');
    if (!topicOptions.some(item => item.classList.contains('selected'))) {
      allOption?.classList.add('selected');
    }
  }

  const selectedTopics = topicOptions
    .filter(item => item.classList.contains('selected'))
    .map(item => item.dataset.val);
  select.dataset.value = selectedTopics.length ? selectedTopics.join(',') : 'all';
  label.textContent = selectedTopics.length === 0
    ? 'Все темы'
    : selectedTopics.length === 1
      ? topicOptions.find(item => item.dataset.val === selectedTopics[0])?.innerText.trim() || '1 тема'
      : `Выбрано тем: ${selectedTopics.length}`;
  updateQuizCountOptions();
  APP.translationPrep.wordsOffset = 0;
  APP.translationPrep.phrasesOffset = 0;
  renderTranslationPrep();
}

function getSelectedQuizTopics() {
  const value = document.getElementById('csTopic')?.dataset.value || 'all';
  return value === 'all' ? null : value.split(',').filter(Boolean);
}

function isQuizTopicSelected(topicId, selectedTopics) {
  return !selectedTopics || selectedTopics.includes(topicId);
}

function updateQuizCountOptions() {
  const type = document.getElementById('csQuizType')?.dataset.value || 'words';
  const selectedTopics = getSelectedQuizTopics();
  const unknownFilter = document.getElementById('csUnknown').dataset.value;
  const directionRow = document.getElementById('rowDirection');
  
  let pool = [];
  if (type === 'words') {
    directionRow.style.display = 'grid';
    document.getElementById('rowUnknown').style.display = 'flex';
    APP.data.words.topics.forEach(t => {
      if (isQuizTopicSelected(t.id, selectedTopics)) {
        pool = pool.concat(t.words);
      }
    });
    if (unknownFilter === 'unknown') {
      pool = pool.filter(w => !APP.state.wordsKnown[w.id]);
    }
  } else {
    directionRow.style.display = type === 'builder' ? 'none' : 'grid';
    document.getElementById('rowUnknown').style.display = 'none';
    pool = getSentencesPool(selectedTopics);
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
    opt.textContent = type === 'words' ? 'Нет слов' : 'Нет предложений';
    container.appendChild(opt);
    countSelect.dataset.value = 0;
    span.textContent = opt.textContent;
  }
}

function getQuizConfig() {
  return {
    type: document.getElementById('csQuizType')?.dataset.value || 'words',
    dir: document.getElementById('csDir').dataset.value,
    topics: getSelectedQuizTopics(),
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
      if (isQuizTopicSelected(t.id, cfg.topics)) {
        pool = pool.concat(t.words);
      }
    });
    if (cfg.unknown === 'unknown') {
      pool = pool.filter(w => !APP.state.wordsKnown[w.id]);
    }
  } else {
    pool = getSentencesPool(cfg.topics);
  }
  
  const minimumQuestions = cfg.type === 'builder' ? 1 : 4;
  if (pool.length < minimumQuestions) {
    showToast(`Недостаточно данных для теста (минимум ${minimumQuestions})`);
    return;
  }
  
  // Shuffle & pick
  pool.sort(() => 0.5 - Math.random());
  APP.quiz.questions = pool.slice(0, Math.min(cfg.count, pool.length));
  
  if (cfg.type === 'builder') {
    APP.quiz.questions = APP.quiz.questions.map(q => ({
      q: q.ru,
      a: q.de,
      blocks: createSentenceBlocks(q.de),
      sourceTitle: q.sourceTitle
    }));
  }

  // Full random pool for distractors
  let allDistractors = [];
  if (cfg.type === 'words') {
    APP.data.words.topics.forEach(t => allDistractors = allDistractors.concat(t.words));
  } else {
    allDistractors = getSentencesPool();
  }
  
  if (cfg.type !== 'builder') APP.quiz.questions = APP.quiz.questions.map(q => {
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
  APP.quiz.builderMistake = false;
  APP.quiz.active = true;

  const mapPanel = document.getElementById('textMapPanel');
  const mapToggle = document.getElementById('textMapToggle');
  if (mapPanel && mapToggle) {
    mapPanel.hidden = true;
    mapToggle.classList.remove('open');
    mapToggle.setAttribute('aria-expanded', 'false');
  }
  
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
  if (APP.quiz.config.type === 'builder') {
    document.getElementById('quizLabel').textContent = 'Собери перевод на немецком';
  } else {
    document.getElementById('quizLabel').textContent = APP.quiz.config.dir === 'de-ru' ? 'Переведи на русский' : 'Переведи на немецкий';
  }
  const quizWordEl = document.getElementById('quizWord');
  quizWordEl.textContent = qObj.q;
  
  if (APP.quiz.config.type === 'sentences' || APP.quiz.config.type === 'builder') {
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
  container.className = 'quiz-answers';
  container.innerHTML = '';

  if (APP.quiz.config.type === 'builder') {
    APP.quiz.builderMistake = false;
    renderSentenceBuilder(container, qObj);
    return;
  }
  
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

function createSentenceBlocks(sentence) {
  const words = String(sentence || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 4) return words;

  const prepositions = new Set([
    'an', 'auf', 'aus', 'bei', 'durch', 'für', 'gegen', 'hinter', 'in', 'mit',
    'nach', 'neben', 'ohne', 'seit', 'über', 'um', 'unter', 'von', 'vor', 'zu', 'zwischen',
    'am', 'ans', 'beim', 'im', 'ins', 'vom', 'zum', 'zur'
  ]);
  const conjunctions = new Set(['aber', 'als', 'denn', 'dass', 'oder', 'und', 'weil', 'wenn']);
  const cleanWord = word => word.toLocaleLowerCase('de-DE').replace(/^[„“"'«»]+|[,.!?;:„“"'«»]+$/g, '');
  const blocks = [];

  for (let i = 0; i < words.length;) {
    const remaining = words.length - i;
    const current = cleanWord(words[i]);
    const next = cleanWord(words[i + 1] || '');
    const afterNext = cleanWord(words[i + 2] || '');
    let size = 2;

    if (prepositions.has(current)) {
      size = conjunctions.has(afterNext) ? Math.min(2, remaining) : Math.min(3, remaining);
    } else if (conjunctions.has(current)) {
      size = Math.min(3, remaining);
    } else if (prepositions.has(next)) {
      size = 1;
    } else if (remaining === 3) {
      size = 3;
    } else if (remaining === 1 && blocks.length > 0) {
      blocks[blocks.length - 1] += ` ${words[i]}`;
      break;
    }

    blocks.push(words.slice(i, i + size).join(' '));
    i += size;
  }
  return blocks;
}

function shuffleBuilderBlocks(blocks) {
  const items = blocks.map((text, index) => ({ id: index, text }));
  if (items.length < 2) return items;

  for (let attempt = 0; attempt < 8; attempt++) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.some((item, index) => item.id !== index)) return shuffled;
  }
  return [...items.slice(1), items[0]];
}

function renderSentenceBuilder(container, qObj) {
  const state = {
    bank: shuffleBuilderBlocks(qObj.blocks),
    answer: []
  };

  container.className = 'quiz-answers sentence-builder';
  container.innerHTML = `
    <div class="builder-instruction">Нажимай на блоки в правильном порядке</div>
    <div class="builder-answer" id="builderAnswer">
      <span class="builder-placeholder">Здесь появится немецкое предложение</span>
    </div>
    <div class="builder-bank" id="builderBank"></div>
    <div class="builder-feedback" id="builderFeedback" aria-live="polite"></div>
    <div class="builder-actions">
      <button class="btn btn-ghost builder-reset-btn" id="builderResetBtn" type="button">Сбросить</button>
      <button class="btn btn-primary builder-check-btn" id="builderCheckBtn" type="button" disabled>Проверить</button>
    </div>
  `;

  const answerEl = container.querySelector('#builderAnswer');
  const bankEl = container.querySelector('#builderBank');
  const feedbackEl = container.querySelector('#builderFeedback');
  const resetBtn = container.querySelector('#builderResetBtn');
  const checkBtn = container.querySelector('#builderCheckBtn');

  const draw = () => {
    answerEl.innerHTML = '';
    if (state.answer.length === 0) {
      answerEl.innerHTML = '<span class="builder-placeholder">Здесь появится немецкое предложение</span>';
    } else {
      state.answer.forEach(item => answerEl.appendChild(createBuilderBlock(item, () => {
        state.answer = state.answer.filter(block => block.id !== item.id);
        state.bank.push(item);
        feedbackEl.textContent = '';
        feedbackEl.className = 'builder-feedback';
        draw();
      })));
    }

    bankEl.innerHTML = '';
    state.bank.forEach(item => bankEl.appendChild(createBuilderBlock(item, () => {
      state.bank = state.bank.filter(block => block.id !== item.id);
      state.answer.push(item);
      feedbackEl.textContent = '';
      feedbackEl.className = 'builder-feedback';
      draw();
    })));
    checkBtn.disabled = state.answer.length !== qObj.blocks.length;
  };

  resetBtn.onclick = () => {
    state.bank = shuffleBuilderBlocks(qObj.blocks);
    state.answer = [];
    feedbackEl.textContent = '';
    feedbackEl.className = 'builder-feedback';
    draw();
  };

  checkBtn.onclick = () => {
    const isCorrect = state.answer.every((item, index) => item.id === index);
    if (!isCorrect) {
      APP.quiz.builderMistake = true;
      feedbackEl.textContent = 'Порядок пока неверный. Нажми на блок в строке, чтобы вернуть его и исправить.';
      feedbackEl.className = 'builder-feedback wrong';
      answerEl.classList.add('wrong');
      window.setTimeout(() => answerEl.classList.remove('wrong'), 450);
      return;
    }

    if (APP.quiz.builderMistake) {
      APP.quiz.wrong++;
    } else {
      APP.quiz.score++;
    }
    showBuilderReinforcement(container, qObj);
  };

  draw();
}

function createBuilderBlock(item, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'builder-block';
  button.textContent = item.text;
  button.onclick = onClick;
  return button;
}

function showBuilderReinforcement(container, qObj) {
  container.className = 'quiz-answers sentence-builder';
  container.innerHTML = `
    <div class="builder-success">
      <div class="builder-success-badge">Правильно</div>
      <div class="builder-success-de">${qObj.a}</div>
      <div class="builder-success-ru">${qObj.q}</div>
      ${qObj.sourceTitle ? `<div class="builder-source">Текст: ${qObj.sourceTitle}</div>` : ''}
      <div class="builder-memory-tip">Прочитай немецкое предложение вслух, затем закрой его рукой и повтори по памяти.</div>
      <div class="builder-actions">
        <button class="btn btn-ghost" id="builderSpeakBtn" type="button">${speakerIcon()}<span>Прослушать</span></button>
        <button class="btn btn-primary" id="builderNextBtn" type="button">Запомнил, дальше</button>
      </div>
    </div>
  `;

  const speakBtn = container.querySelector('#builderSpeakBtn');
  speakBtn.onclick = () => speakGerman(qObj.a, speakBtn);
  container.querySelector('#builderNextBtn').onclick = advanceQuizQuestion;
}

function advanceQuizQuestion() {
  APP.quiz.currentIndex++;
  if (APP.quiz.currentIndex >= APP.quiz.questions.length) {
    endQuiz();
  } else {
    renderQuizQuestion();
  }
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
    advanceQuizQuestion();
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
function getSentencesPool(selectedTopics = null) {
  let sentences = [];
  let textsToProcess = APP.data.texts.texts;
  if (Array.isArray(selectedTopics) && selectedTopics.length > 0) {
    textsToProcess = textsToProcess.filter(t => selectedTopics.includes(t.topic));
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
        ru: ruArr[i],
        sourceTitle: t.title
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
