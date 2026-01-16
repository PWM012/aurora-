// settings.js - Управление настройками приложения

// Загрузка настроек из localStorage
function loadSettings() {
    const defaultSettings = {
        darkTheme: true,
        colorScheme: 'green',
        sortTracks: 'title',
        autoplay: 'always',
        notifications: true,
        autoPlayOnStart: true,
        showLyrics: false,
        tracksPerPage: 30,
        cacheCovers: true,
        highQuality: false
    };
    
    const savedSettings = JSON.parse(localStorage.getItem('aurora_settings') || '{}');
    return { ...defaultSettings, ...savedSettings };
}

// Сохранение настроек в localStorage
function saveSettings(settings) {
    localStorage.setItem('aurora_settings', JSON.stringify(settings));
    applySettings(settings);
}

// Применение настроек
function applySettings(settings) {
    // Тема
    const body = document.body;
    if (settings.darkTheme) {
        body.classList.remove('bg-light', 'text-dark');
        body.classList.add('bg-black', 'text-light');
    } else {
        body.classList.remove('bg-black', 'text-light');
        body.classList.add('bg-light', 'text-dark');
    }
    
    // Цветовая схема
    document.body.className = document.body.className.replace(/color-scheme-\w+/g, '');
    document.body.classList.add(`color-scheme-${settings.colorScheme}`);
    
    // Устанавливаем переменные для RGB значений
    setAccentRGB(settings.colorScheme);
    
    // Обновляем кнопку плей
    updatePlayButtonColor();
    
    // Обновляем ползунки
    updateSliderColors();
    
    // Количество треков на странице
    window.tracksPerPage = settings.tracksPerPage;
    
    // Если включено автовоспроизведение при запуске
    if (settings.autoPlayOnStart && window.tracks && window.tracks.length > 0 && window.currentIndex === -1) {
        setTimeout(() => {
            playLocalTrack(0);
        }, 1000);
    }
    
    return settings;
}

// Установка RGB значений акцентного цвета
function setAccentRGB(colorScheme) {
    const colorMap = {
        'green': '29, 185, 84',
        'blue': '0, 123, 255',
        'purple': '111, 66, 193',
        'red': '220, 53, 69',
        'orange': '253, 126, 20',
        'pink': '232, 62, 140'
    };
    
    const rgbValue = colorMap[colorScheme] || '29, 185, 84';
    document.documentElement.style.setProperty('--accent-rgb', rgbValue);
}

// Обновление цвета кнопки плей
function updatePlayButtonColor() {
    const playButton = document.getElementById('play-btn');
    if (!playButton) return;
    
    // Получаем текущий акцентный цвет
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim();
    
    const accentHover = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-hover').trim();
    
    const accentRGB = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-rgb').trim();
    
    // Применяем цвет к кнопке
    playButton.style.backgroundColor = accentColor;
    playButton.style.borderColor = accentColor;
    playButton.style.boxShadow = `0 4px 12px rgba(${accentRGB}, 0.3)`;
    
    // Обновляем ховер эффект
    const originalHover = playButton.onmouseenter;
    const originalLeave = playButton.onmouseleave;
    
    playButton.onmouseenter = function() {
        this.style.backgroundColor = accentHover;
        this.style.borderColor = accentHover;
        this.style.boxShadow = `0 6px 16px rgba(${accentRGB}, 0.4)`;
        if (originalHover) originalHover.call(this);
    };
    
    playButton.onmouseleave = function() {
        this.style.backgroundColor = accentColor;
        this.style.borderColor = accentColor;
        this.style.boxShadow = `0 4px 12px rgba(${accentRGB}, 0.3)`;
        if (originalLeave) originalLeave.call(this);
    };
}

// Обновление цвета ползунков
function updateSliderColors() {
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim();
    
    // Обновляем все ползунки
    const sliders = document.querySelectorAll('.custom-range');
    sliders.forEach(slider => {
        slider.style.setProperty('--accent-color', accentColor);
    });
    
    // Если есть активный трек, обновляем заполнение
    if (typeof updateProgressFill === 'function') {
        updateProgressFill();
    }
    if (typeof updateVolumeFill === 'function') {
        updateVolumeFill();
    }
}

// Заполнение формы настроек
function fillSettingsForm() {
    const settings = loadSettings();
    
    document.getElementById('dark-theme-switch').checked = settings.darkTheme;
    document.getElementById('color-scheme-select').value = settings.colorScheme;
    document.getElementById('sort-tracks-select').value = settings.sortTracks;
    document.getElementById('autoplay-select').value = settings.autoplay;
    document.getElementById('notifications-switch').checked = settings.notifications;
    document.getElementById('auto-play-switch').checked = settings.autoPlayOnStart;
    document.getElementById('lyrics-switch').checked = settings.showLyrics;
    document.getElementById('tracks-per-page-select').value = settings.tracksPerPage;
    document.getElementById('cache-switch').checked = settings.cacheCovers;
    document.getElementById('high-quality-switch').checked = settings.highQuality;
}

// Сортировка треков
function sortTracks(tracks, sortBy) {
    const sortedTracks = [...tracks];
    
    switch(sortBy) {
        case 'title':
            return sortedTracks.sort((a, b) => a.title.localeCompare(b.title));
        case 'artist':
            return sortedTracks.sort((a, b) => a.artist.localeCompare(b.artist));
        case 'duration':
            return sortedTracks.sort((a, b) => (a.duration || 0) - (b.duration || 0));
        default:
            return tracks;
    }
}

// Инициализация настроек
function initSettings() {
    // Загружаем и применяем настройки
    const settings = loadSettings();
    applySettings(settings);
    
    // Заполняем форму при открытии модального окна
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('show.bs.modal', fillSettingsForm);
    }
    
    // Обработчик сохранения настроек
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            const newSettings = {
                darkTheme: document.getElementById('dark-theme-switch').checked,
                colorScheme: document.getElementById('color-scheme-select').value,
                sortTracks: document.getElementById('sort-tracks-select').value,
                autoplay: document.getElementById('autoplay-select').value,
                notifications: document.getElementById('notifications-switch').checked,
                autoPlayOnStart: document.getElementById('auto-play-switch').checked,
                showLyrics: document.getElementById('lyrics-switch').checked,
                tracksPerPage: parseInt(document.getElementById('tracks-per-page-select').value),
                cacheCovers: document.getElementById('cache-switch').checked,
                highQuality: document.getElementById('high-quality-switch').checked
            };
            
            saveSettings(newSettings);
            
            // Обновляем сортировку если нужно
            if (typeof renderTracks === 'function' && window.tracks) {
                const sortedTracks = sortTracks(window.tracks, newSettings.sortTracks);
                renderTracks(sortedTracks, window.isYtSearch || false);
            }
            
            // Показываем уведомление
            showNotification('Настройки сохранены!', 'success');
            
            // Закрываем модальное окно
            const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
            if (modal) modal.hide();
        });
    }
    
    // Сброс настроек
    const resetBtn = document.getElementById('reset-settings-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            if (confirm('Сбросить все настройки к значениям по умолчанию?')) {
                localStorage.removeItem('aurora_settings');
                initSettings();
                showNotification('Настройки сброшены!', 'success');
                
                // Обновляем форму
                fillSettingsForm();
            }
        });
    }
    
    // Отслеживание изменений цветовой схемы
    watchColorSchemeChanges();
}

// Отслеживание изменений цветовой схемы
function watchColorSchemeChanges() {
    // Используем MutationObserver для отслеживания изменений класса body
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                // Небольшая задержка чтобы изменения применились
                setTimeout(() => {
                    updatePlayButtonColor();
                    updateSliderColors();
                }, 100);
            }
        });
    });
    
    // Начинаем наблюдение за изменениями в body
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });
}

// Показ уведомлений
function showNotification(message, type = 'info') {
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification alert alert-${type === 'success' ? 'success' : 'info'} position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : 'bi-info-circle-fill'} me-2"></i>
            <span>${message}</span>
            <button type="button" class="btn-close btn-close-white ms-auto" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    // Добавляем в DOM
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 3000);
}

// Добавляем CSS для анимаций уведомлений
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification {
        background-color: var(--accent-color) !important;
        border-color: var(--accent-color) !important;
        color: white !important;
    }
`;
document.head.appendChild(notificationStyles);

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initSettings();
});
