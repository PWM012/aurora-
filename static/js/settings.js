// settings.js - Настройки в стиле Spotify (мгновенное применение)

function loadSettings() {
    const defaultSettings = {
        darkTheme: true,
        colorScheme: 'green',
        sortTracks: 'title',
        notifications: true,
        showLyrics: false,
        tracksPerPage: 30,
        cacheCovers: true,
        crossfadeDuration: 0,
        normalizeVolume: true,
        gaplessPlayback: true,
        autoplaySimilar: true,
        streamingQuality: 'high',
        fontSize: 'normal'
    };
    
    const saved = JSON.parse(localStorage.getItem('aurora_settings') || '{}');
    return { ...defaultSettings, ...saved };
}

function saveSettings(settings) {
    localStorage.setItem('aurora_settings', JSON.stringify(settings));
    applySettings(settings);
}

function applySettings(settings) {
    const body = document.body;
    const root = document.documentElement;

    // Тема
    if (settings.darkTheme) {
        body.classList.remove('bg-light', 'text-dark');
        body.classList.add('bg-black', 'text-light');
    } else {
        body.classList.remove('bg-black', 'text-light');
        body.classList.add('bg-light', 'text-dark');
    }

    // Цветовая схема
    body.className = body.className.replace(/color-scheme-\w+/g, '');
    body.classList.add(`color-scheme-${settings.colorScheme}`);
    setAccentRGB(settings.colorScheme);

    // Размер шрифта
    const fontSizes = { small: '14px', normal: '16px', large: '18px' };
    root.style.setProperty('--base-font-size', fontSizes[settings.fontSize]);

    // Обновление цветов плеера и ползунков
    updatePlayButtonColor();
    updateSliderColors();

    // Глобальные переменные
    window.tracksPerPage = settings.tracksPerPage;
    window.streamingQuality = settings.streamingQuality; // можно использовать в функциях загрузки треков

    // Пересортировка (если на странице библиотеки)
    if (typeof renderTracks === 'function' && window.tracks) {
        const sorted = sortTracks(window.tracks, settings.sortTracks);
        renderTracks(sorted, window.isYtSearch || false);
    }
}

function setAccentRGB(scheme) {
    const map = {
        green: '29, 185, 84',
        blue: '0, 123, 255',
        purple: '111, 66, 193',
        red: '220, 53, 69',
        orange: '253, 126, 20',
        pink: '232, 62, 140'
    };
    document.documentElement.style.setProperty('--accent-rgb', map[scheme] || '29, 185, 84');
}

function updatePlayButtonColor() {
    const btn = document.getElementById('play-btn');
    if (!btn) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    const hover = getComputedStyle(document.documentElement).getPropertyValue('--accent-hover').trim();
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();

    btn.style.backgroundColor = accent;
    btn.style.borderColor = accent;
    btn.style.boxShadow = `0 4px 12px rgba(${rgb}, 0.3)`;

    btn.onmouseenter = () => {
        btn.style.backgroundColor = hover;
        btn.style.borderColor = hover;
        btn.style.boxShadow = `0 6px 16px rgba(${rgb}, 0.4)`;
    };
    btn.onmouseleave = () => {
        btn.style.backgroundColor = accent;
        btn.style.borderColor = accent;
        btn.style.boxShadow = `0 4px 12px rgba(${rgb}, 0.3)`;
    };
}

function updateSliderColors() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    document.querySelectorAll('.custom-range').forEach(s => s.style.setProperty('--accent-color', accent));
    if (typeof updateProgressFill === 'function') updateProgressFill();
    if (typeof updateVolumeFill === 'function') updateVolumeFill();
}

function fillSettingsForm() {
    const s = loadSettings();
    
    document.getElementById('dark-theme-switch').checked = s.darkTheme;
    document.getElementById('color-scheme-select').value = s.colorScheme;
    document.getElementById('font-size-select').value = s.fontSize;
    document.getElementById('sort-tracks-select').value = s.sortTracks;
    document.getElementById('tracks-per-page-select').value = s.tracksPerPage;
    document.getElementById('cache-switch').checked = s.cacheCovers;
    document.getElementById('show-lyrics-switch').checked = s.showLyrics;
    document.getElementById('notifications-switch').checked = s.notifications;
    
    document.getElementById('crossfade-slider').value = s.crossfadeDuration;
    document.getElementById('crossfade-value').textContent = s.crossfadeDuration == 0 ? 'Отключено' : `${s.crossfadeDuration} секунд`;
    
    document.getElementById('normalize-volume-switch').checked = s.normalizeVolume;
    document.getElementById('gapless-switch').checked = s.gaplessPlayback;
    document.getElementById('autoplay-similar-switch').checked = s.autoplaySimilar;
    document.getElementById('streaming-quality-select').value = s.streamingQuality;
}

function updateSettingsLive() {
    const s = {
        darkTheme: document.getElementById('dark-theme-switch').checked,
        colorScheme: document.getElementById('color-scheme-select').value,
        fontSize: document.getElementById('font-size-select').value,
        sortTracks: document.getElementById('sort-tracks-select').value,
        tracksPerPage: parseInt(document.getElementById('tracks-per-page-select').value),
        cacheCovers: document.getElementById('cache-switch').checked,
        showLyrics: document.getElementById('show-lyrics-switch').checked,
        notifications: document.getElementById('notifications-switch').checked,
        crossfadeDuration: parseInt(document.getElementById('crossfade-slider').value),
        normalizeVolume: document.getElementById('normalize-volume-switch').checked,
        gaplessPlayback: document.getElementById('gapless-switch').checked,
        autoplaySimilar: document.getElementById('autoplay-similar-switch').checked,
        streamingQuality: document.getElementById('streaming-quality-select').value
    };
    
    saveSettings(s);
    showNotification('Настройки применены', 'success');
}

function watchColorSchemeChanges() {
    const observer = new MutationObserver(() => {
        setTimeout(() => {
            updatePlayButtonColor();
            updateSliderColors();
        }, 50);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function showNotification(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

function initSettings() {
    const settings = loadSettings();
    applySettings(settings);
    fillSettingsForm();

    // Live-обработчики
    const ids = [
        'dark-theme-switch', 'color-scheme-select', 'font-size-select', 'sort-tracks-select',
        'tracks-per-page-select', 'cache-switch', 'show-lyrics-switch', 'notifications-switch',
        'normalize-volume-switch', 'gapless-switch', 'autoplay-similar-switch',
        'streaming-quality-select'
    ];
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateSettingsLive);
    });

    // Специально для слайдера кроссфейда
    const crossfadeSlider = document.getElementById('crossfade-slider');
    if (crossfadeSlider) {
        crossfadeSlider.addEventListener('input', () => {
            const val = crossfadeSlider.value;
            document.getElementById('crossfade-value').textContent = val == 0 ? 'Отключено' : `${val} секунд`;
            updateSettingsLive();
        });
    }

    // Очистка кэша
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (confirm('Очистить весь кэш приложения? (настройки и плейлисты сохранятся)')) {
                // Здесь можно очистить только кэш обложек, если он в IndexedDB или другом месте
                // Пока просто перезагружаем
                localStorage.removeItem('aurora_cover_cache'); // если есть такой ключ
                showNotification('Кэш очищен', 'success');
                setTimeout(() => location.reload(), 1000);
            }
        });
    }

    watchColorSchemeChanges();
}

document.addEventListener('DOMContentLoaded', initSettings);
