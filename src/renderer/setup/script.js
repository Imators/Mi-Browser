let currentStep = 0;
const steps = ['video', 'language', 'import', 'features', 'theme', 'privacy'];
const setupData = {
  features: {
    ads: true,
    trackers: true,
    eatCookies: true
  },
  theme: 'light',
  language: 'en-GB',
  imported: false,
  importedBrowsers: {}
};

function applyTheme(themeName) {
  document.body.className = `m-0 p-0 overflow-hidden h-screen theme-${themeName}`;
}

function showStep(stepIndex) {
  document.querySelectorAll('.step').forEach(el => el.classList.add('hidden'));
  const stepElement = document.getElementById(`step-${steps[stepIndex]}`);
  if (stepElement) {
    stepElement.classList.remove('hidden');
    stepElement.classList.add('fade-in');
    stepElement.scrollTop = 0;
  }
  currentStep = stepIndex;
  updateProgressIndicator();
}

function updateProgressIndicator() {
  const progressEl = document.getElementById('setup-progress');
  const stepName = steps[currentStep];
  progressEl.classList.toggle('hidden', stepName === 'video');

  const order = ['language', 'import', 'features', 'theme', 'privacy'];
  const currentIndex = order.indexOf(stepName);
  progressEl.querySelectorAll('.setup-progress-dot').forEach((dot) => {
    const dotIndex = order.indexOf(dot.dataset.step);
    dot.classList.toggle('current', dotIndex === currentIndex);
    dot.classList.toggle('done', dotIndex < currentIndex);
  });
}

function goToPreviousStep() {
  if (currentStep > 1) showStep(currentStep - 1);
}

async function detectAndShowBrowsers() {
  const detected = await window.electron.import.detectBrowsers();
  const container = document.getElementById('browsers-detected');
  container.innerHTML = '';

  Object.entries(detected).forEach(([browserName, data]) => {
    if (data.bookmarks > 0 || data.history > 0) {
      const div = document.createElement('div');
      div.className = 'p-4 rounded-lg border-2 cursor-pointer hover:opacity-80 transition browser-item';
      div.innerHTML = `
        <div class="flex items-start">
          <input type="checkbox" class="browser-checkbox w-5 h-5 mt-1" data-browser="${browserName}" checked>
          <div class="ml-4 flex-1">
            <p class="font-semibold capitalize">${browserName}</p>
            <p class="text-sm opacity-75">${data.bookmarks} bookmarks • ${data.history} history entries</p>
            <div class="mt-2 space-y-1 text-xs">
              <label class="flex items-center">
                <input type="checkbox" class="browser-data w-4 h-4" data-browser="${browserName}" data-type="bookmarks" checked>
                <span class="ml-2">Bookmarks</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" class="browser-data w-4 h-4" data-browser="${browserName}" data-type="history" checked>
                <span class="ml-2">History</span>
              </label>
            </div>
          </div>
        </div>
      `;
      container.appendChild(div);
    }
  });

  if (container.children.length === 0) {
    container.innerHTML = '<p class="opacity-75">No browsers detected</p>';
  }
}

document.getElementById('intro-video').addEventListener('ended', () => {
  setTimeout(() => {
    showStep(1);
  }, 500);
});

document.querySelectorAll('input[name="language"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    setupData.language = e.target.value;
  });
});

document.getElementById('language-next-btn').addEventListener('click', () => {
  window.electron.store.set('language', setupData.language);
  showStep(2);
  detectAndShowBrowsers();
});

document.getElementById('import-skip-btn').addEventListener('click', () => {
  showStep(3);
});

document.getElementById('import-confirm-btn').addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('.browser-data:checked');
  const selections = {};

  checkboxes.forEach(checkbox => {
    const browser = checkbox.dataset.browser;
    const type = checkbox.dataset.type;

    if (!selections[browser]) selections[browser] = { bookmarks: false, history: false, passwords: false };
    selections[browser][type] = true;
  });

  for (const [browser, sel] of Object.entries(selections)) {
    const data = await window.electron.import.importData(browser, sel);
    setupData.importedBrowsers[browser] = data;
  }

  setupData.imported = true;
  showStep(3);
});

document.querySelectorAll('.feature-toggle').forEach(toggle => {
  toggle.addEventListener('change', (e) => {
    const feature = e.target.dataset.feature;
    if (feature === 'ads') setupData.features.ads = e.target.checked;
    if (feature === 'trackers') setupData.features.trackers = e.target.checked;
    if (feature === 'eat-cookies') setupData.features.eatCookies = e.target.checked;
  });
});

document.getElementById('features-next-btn').addEventListener('click', () => {
  window.electron.store.set('features', setupData.features);
  showStep(4);
});

document.querySelectorAll('input[name="theme"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    setupData.theme = e.target.value;
    applyTheme(setupData.theme);
  });
});

document.getElementById('theme-next-btn').addEventListener('click', () => {
  window.electron.store.set('theme', setupData.theme);
  showStep(5);
});

document.getElementById('privacy-finish-btn').addEventListener('click', () => {
  window.electron.store.set('setup-complete', true);
  window.electron.store.set('setup-data', setupData);
  window.electron.store.set('imported-data', setupData.importedBrowsers);
  window.location.href = '../browser/index.html';
});

document.getElementById('minimize-btn').addEventListener('click', () => {
  window.electron.window.minimize();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  window.electron.window.maximize();
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.electron.window.close();
});

document.querySelectorAll('.setup-back-btn').forEach((btn) => {
  btn.addEventListener('click', goToPreviousStep);
});

applyTheme('light');
showStep(0);