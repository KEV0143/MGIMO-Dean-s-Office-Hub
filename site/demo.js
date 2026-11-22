const scenarios = {
  schedule: [
    ['Перенос занятия', '24 ноября · 10:45–12:15', 'Найти аудиторию'],
    ['Новый корпус · 4-й этаж', 'Аудитория 404. На плане МГИМО можно открыть нужный этаж.']
  ],
  request: [
    ['Черновик', 'Справка нужна для студенческой конференции.', 'Подать заявление'],
    ['Заявление принято', 'Деканат назначил срок ответа на 26 ноября.', 'Посмотреть уточнение'],
    ['Ждём ваш ответ', 'Деканат уточняет город проведения конференции.', 'Ответить: Казань'],
    [
      'Уточнение отправлено',
      'Сотрудник получил ответ. Срок виден в карточке.',
      'Получить результат'
    ],
    ['Справка готова', 'В кабинете появится документ с номером и QR для проверки.']
  ],
  queue: [
    ['Срок ответа прошёл', 'Заявка в начале очереди деканата.', 'Запросить уточнение'],
    ['Ждём ответ студента', 'Вопрос виден в карточке заявления.', 'Принять уточнение'],
    ['Поступил ответ', 'Заявка снова требует действий деканата.', 'Выдать справку'],
    ['Документ выдан', 'Справка готова. Студент получит уведомление.']
  ]
};

const demo = document.querySelector('[data-demo]');
const tabs = [...demo.querySelectorAll('[role="tab"]')];
const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
demo.querySelector('[role="tablist"]').hidden = false;

function selectTab(active, moveFocus = false) {
  tabs.forEach((tab, index) => {
    tab.tabIndex = index === active ? 0 : -1;
    tab.setAttribute('aria-selected', index === active ? 'true' : 'false');
    panels[index].hidden = index !== active;
  });
  if (moveFocus) tabs[active].focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(index));
  tab.addEventListener('keydown', (event) => {
    const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(moves, event.key)) return;
    event.preventDefault();
    selectTab((moves[event.key] + tabs.length) % tabs.length, true);
  });
});
selectTab(0);

for (const panel of panels) {
  panel.tabIndex = 0;
  const steps = scenarios[panel.dataset.scenario];
  const state = panel.querySelector('[data-state]');
  const detail = panel.querySelector('[data-detail]');
  const announce = panel.querySelector('[data-status]');
  const next = panel.querySelector('[data-next]');
  const reset = panel.querySelector('[data-reset]');
  let step = 0;
  next.parentElement.hidden = false;

  function render() {
    const [title, text, action] = steps[step];
    state.textContent = title;
    detail.textContent = text;
    next.hidden = !action;
    reset.hidden = step === 0;
    if (action) next.textContent = action;
    announce.textContent = title + '. ' + text;
  }

  next.addEventListener('click', () => {
    step += 1;
    render();
    if (next.hidden) reset.focus();
  });
  reset.addEventListener('click', () => {
    step = 0;
    render();
    next.focus();
  });
}

const repo = document.querySelector('meta[name="deka-repository"]').content;
if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)) {
  for (const link of document.querySelectorAll('[data-repo]')) {
    const path = link.dataset.repo;
    link.href = path ? repo + '/blob/HEAD/' + path : repo;
    link.hidden = false;
  }
}
const portal = document.querySelector('meta[name="deka-portal"]').content;
if (portal) {
  const url = new URL(portal, location.href);
  if ((url.origin === location.origin || url.protocol === 'https:') && !url.username && !url.password) {
    const link = document.querySelector('[data-portal]');
    link.href = url.href;
    link.hidden = false;
  }
}
