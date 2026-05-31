const APP = {
  data: { words: null, texts: null },
  state: {
    section: 'words',
    wordsTopic: 'all',
    textsTopic: 'all',
    wordsKnown: JSON.parse(localStorage.getItem('wordsKnown') || '{}')
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
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadAllData();
    initNav();
    initWords();
    initTexts();
    initQuiz();
    initCustomSelects();
    renderWords();
    renderTexts();
    updateBadge('Слова');
  } catch (e) {
    document.getElementById('wordsList').innerHTML = `<div class="empty-state">Ошибка загрузки данных.<br>${e.message}</div>`;
  }
});

async function loadAllData() {
  APP.data.words = window.WORDS_DATA;
  APP.data.texts = window.TEXTS_DATA;
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
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  const titles = { words: 'Слова', texts: 'Тексты', quiz: 'Тест' };
  updateBadge(titles[sectionId]);
}

function updateBadge(text) {
  document.getElementById('headerBadge').textContent = text;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─────────────────────────────────────────────
// WORDS SECTION
// ─────────────────────────────────────────────
function initWords() {
  const topics = APP.data.words.topics;
  const filterWrap = document.getElementById('wordsFilter');
  
  // Quiz Topic Dropdown sync
  const csTopicOptions = document.getElementById('csTopicOptions');
  
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
  
  if (topicsToRender.length === 0) {
    container.innerHTML = `<div class="empty-state">Нет слов для этой темы</div>`;
    return;
  }
  
  topicsToRender.forEach(topic => {
    const section = document.createElement('div');
    section.className = 'topic-section';
    
    const label = document.createElement('div');
    label.className = 'topic-label';
    label.textContent = topic.title;
    section.appendChild(label);
    
    topic.words.forEach(w => {
      const isKnown = APP.state.wordsKnown[w.id];
      
      const card = document.createElement('div');
      card.className = 'word-card';
      card.innerHTML = `
        <div class="word-card-header">
          <div>
            <div class="word-de">${w.de}</div>
            <div class="word-ru">${w.ru}</div>
          </div>
          <div class="word-level">${w.level || 'A1'}</div>
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
      header.onclick = () => body.classList.toggle('open');
      
      const btn = card.querySelector('.word-known-btn');
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleWordKnown(w.id, btn);
      };
      
      section.appendChild(card);
    });
    container.appendChild(section);
  });
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
  localStorage.setItem('wordsKnown', JSON.stringify(APP.state.wordsKnown));
}

// ─────────────────────────────────────────────
// TEXTS SECTION
// ─────────────────────────────────────────────
function initTexts() {
  const topics = APP.data.words.topics;
  const filterWrap = document.getElementById('textsFilter');
  
  if (!filterWrap) return;

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
  
  texts.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'text-card';
    
    let kwHTML = '';
    if (t.keywords) {
      kwHTML = `<div class="text-keywords">` + t.keywords.map(k => `<span class="keyword-chip">${k}</span>`).join('') + `</div>`;
    }
    
    card.innerHTML = `
      <div class="text-meta">
        <div class="text-title">${t.title}</div>
        <div class="text-topic-tag">${APP.data.words.topics.find(top => top.id === t.topic)?.title.split(' — ')[0] || 'Текст'}</div>
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
    const bodies = [
      card.querySelector(`#tb-${i}-full`),
      card.querySelector(`#tb-${i}-short`),
      card.querySelector(`#tb-${i}-trans`)
    ];
    
    btns.forEach(btn => {
      btn.onclick = () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        bodies.forEach(b => b.classList.remove('active'));
        card.querySelector(`#tb-${i}-${target}`).classList.add('active');
      };
    });
  });
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
  
  textsToProcess.forEach(t => {
    let deText = t.full.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    let ruText = t.translation.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    let deArr = deText.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜА-ЯЁ«"'])/).map(s => s.trim()).filter(s => s.length > 5);
    let ruArr = ruText.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜА-ЯЁ«"'])/).map(s => s.trim()).filter(s => s.length > 5);
    
    let len = Math.min(deArr.length, ruArr.length);
    for (let i = 0; i < len; i++) {
      sentences.push({
        id: t.id + '_s' + i,
        de: deArr[i],
        ru: ruArr[i]
      });
    }
  });
  return sentences;
}
