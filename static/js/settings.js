// settings.js - Управление настройками приложения

// Загрузка настроек из localStorage
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('aurora_settings') || '{}');
    
    // Применение темы
    const darkThemeSwitch = document.getElementById('dark-theme-switch');
    darkThemeSwitch.checked = settings.darkTheme !== false;
    applyTheme(settings.darkTheme !== false);
    
    // Цветовая схема
    const colorSchemeSelect = document.getElementById('color-scheme-select');
    if (colorSchemeSelect) {
        colorSchemeSelect.value = settings.colorScheme || 'green';
        applyColorScheme(settings.colorScheme || 'green');
    }
    
    // Размер шрифта
    const fontSizeSelect = document.getElementById('font-size-select');
    if (fontSizeSelect) {
        fontSizeSelect.value = settings.fontSize || 'medium';
        applyFontSize(settings.fontSize || 'medium');
    }
    
    // Уведомления
    const notificationsSwitch = document.getElementById('notifications-switch');
    if (notificationsSwitch) {
        notificationsSwitch.checked = settings.notifications !== false;
    }
    
    // Автовоспроизведение
    const autoPlaySwitch = document.getElementById('auto-play-switch');
    if (autoPlaySwitch) {
        autoPlaySwitch.checked = settings.autoPlay !== false;
    }
    
    // Текст песни
    const lyricsSwitch = document.getElementById('lyrics-switch');
    if (lyricsSwitch) {
        lyricsSwitch.checked = settings.autoLyrics === true;
    }
    
    // Качество аудио
    const audioQualitySelect = document.getElementById('audio-quality-select');
    if (audioQualitySelect) {
        audioQualitySelect.value = settings.audioQuality || 'medium';
    }
}

// Сохранение настроек в localStorage
function saveSettings() {
    const settings = {
        darkTheme: document.getElementById('dark-theme-switch').checked,
        colorScheme: document.getElementById('color-scheme-select')?.value || 'green',
        fontSize: document.getElementById('font-size-select')?.value || 'medium',
        notifications: document.getElementById('notifications-switch')?.checked,
        autoPlay: document.getElementById('auto-play-switch')?.checked,
        autoLyrics: document.getElementById('lyrics-switch')?.checked,
        audioQuality: document.getElementById('audio-quality-select')?.value || 'medium'
    };
    
    localStorage.setItem('aurora_settings', JSON.stringify(settings));
    return settings;
}

// Применение темы
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.remove('bg-light', 'text-dark');
        document.body.classList.add('bg-black', 'text-light');
    } else {
        document.body.classList.remove('bg-black', 'text-light');
        document.body.classList.add('bg-light', 'text-dark');
    }
}

// Применение цветовой схемы
function applyColorScheme(scheme) {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', getColorByScheme(scheme));
    
    // Обновляем кнопки и элементы, использующие акцентный цвет
    const playButtons = document.querySelectorAll('#play-btn, .btn-success');
    playButtons.forEach(btn => {
        btn.style.backgroundColor = getColorByScheme(scheme);
        btn.style.borderColor = getColorByScheme(scheme);
    });
}

// Получение цвета по схеме
function getColorByScheme(scheme) {
    switch(scheme) {
        case 'blue': return '#007bff';
        case 'purple': return '#6f42c1';
        case 'red': return '#dc3545';
        default: return '#1db954'; // green
    }
}

// Применение размера шрифта
function applyFontSize(size) {
    const sizes = {
        'small': '14px',
        'medium': '16px',
        'large': '18px'
    };
    document.body.style.fontSize = sizes[size] || '16px';
}

// Сброс настроек
function resetSettings() {
    localStorage.removeItem('aurora_settings');
    loadSettings();
    alert('Настройки сброшены до значений по умолчанию!');
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Загружаем настройки
    loadSettings();
    
    // Обработчик сохранения настроек
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', function() {
            const settings = saveSettings();
            applyTheme(settings.darkTheme);
            applyColorScheme(settings.colorScheme);
            applyFontSize(settings.fontSize);
            alert('Настройки сохранены!');
            bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
        });
    }
    
    // Обработчик сброса настроек
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', resetSettings);
    }
    
    // Обработчик изменения темы
    const darkThemeSwitch = document.getElementById('dark-theme-switch');
    if (darkThemeSwitch) {
        darkThemeSwitch.addEventListener('change', function(e) {
            applyTheme(e.target.checked);
        });
    }
    
    // Обработчик изменения цветовой схемы
    const colorSchemeSelect = document.getElementById('color-scheme-select');
    if (colorSchemeSelect) {
        colorSchemeSelect.addEventListener('change', function(e) {
            applyColorScheme(e.target.value);
        });
    }
});
