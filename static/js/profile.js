// profile.js - Управление профилем

// Глобальные переменные для экземпляров модальных окон
let profileModalInstance = null;
let customizationModalInstance = null;

// Загрузка профиля из localStorage
function loadProfile() {
    const name = localStorage.getItem('profileName') || 'Андрей';
    const avatar = localStorage.getItem('profileAvatar') || 'https://via.placeholder.com/150';
    
    const profileNameElement = document.getElementById('profile-name');
    const profileNameModalElement = document.getElementById('profile-name-modal');
    const profileAvatarElement = document.getElementById('profile-avatar');
    const profileAvatarModalElement = document.getElementById('profile-avatar-modal');
    
    if (profileNameElement) profileNameElement.textContent = name;
    if (profileNameModalElement) profileNameModalElement.textContent = name;
    if (profileAvatarElement) profileAvatarElement.src = avatar;
    if (profileAvatarModalElement) profileAvatarModalElement.src = avatar;
    
    // Статистика треков
    fetch('/tracks')
        .then(r => r.json())
        .then(d => {
            const playlists = JSON.parse(localStorage.getItem('aurora_playlists') || '{}');
            const playlistCount = Object.keys(playlists).length;
            const totalTracks = Object.values(playlists).reduce((sum, playlist) => 
                sum + (playlist.tracks?.length || 0), 0);
            
            const profileStatsElement = document.getElementById('profile-stats');
            if (profileStatsElement) {
                profileStatsElement.innerHTML = `
                    <div class="text-start">
                        <div>Треков в библиотеке: <strong>${d.length}</strong></div>
                        <div>Плейлистов: <strong>${playlistCount}</strong></div>
                        <div>Всего треков в плейлистах: <strong>${totalTracks}</strong></div>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('Ошибка загрузки статистики профиля:', error);
            const profileStatsElement = document.getElementById('profile-stats');
            if (profileStatsElement) {
                profileStatsElement.innerHTML = `
                    <div class="text-start">
                        <div>Треков в библиотеке: <strong>0</strong></div>
                        <div>Плейлистов: <strong>0</strong></div>
                        <div>Всего треков в плейлистах: <strong>0</strong></div>
                    </div>
                `;
            }
        });
}

// Функция для показа уведомлений
function showNotification(message, type = 'info') {
    // Создаем тост если его нет
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }
    
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast, {
        animation: true,
        autohide: true,
        delay: 3000
    });
    
    bsToast.show();
    
    // Удаляем тост после скрытия
    toast.addEventListener('hidden.bs.toast', function () {
        toast.remove();
    });
}

// Функция для открытия модалки профиля из сайдбара
function openProfileModal() {
    closeAllModals(); // Сначала закрываем все другие модалки
    const modalElement = document.getElementById('profileModal');
    if (!modalElement) return;
    
    // Создаем или получаем экземпляр модального окна
    if (!profileModalInstance) {
        profileModalInstance = new bootstrap.Modal(modalElement, {
            backdrop: true,
            keyboard: true,
            focus: true
        });
    }
    
    // Обработчик для корректного закрытия
    modalElement.addEventListener('hidden.bs.modal', function() {
        cleanupModalBackdrop();
    });
    
    profileModalInstance.show();
}

// Функция для очистки backdrop модального окна
function cleanupModalBackdrop() {
    setTimeout(() => {
        // Удаляем лишние backdrop
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length > 1) {
            for (let i = 1; i < backdrops.length; i++) {
                backdrops[i].remove();
            }
        }
        
        // Сбрасываем стили body если нет открытых модалок
        const openModals = document.querySelectorAll('.modal.show');
        if (openModals.length === 0) {
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
    }, 100);
}

// Функция для закрытия всех модальных окон
function closeAllModals() {
    // Закрываем все модальные окна Bootstrap
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) {
            modalInstance.hide();
        }
    });
    
    // Удаляем все backdrop
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    
    // Сбрасываем стили body
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    loadProfile();
    
    // Смена аватара
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', () => {
            document.getElementById('avatar-input').click();
        });
    }
    
    const avatarInput = document.getElementById('avatar-input');
    if (avatarInput) {
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Проверяем размер файла (максимум 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    showNotification('Файл слишком большой! Максимальный размер 5MB.', 'danger');
                    return;
                }
                
                // Проверяем тип файла
                if (!file.type.startsWith('image/')) {
                    showNotification('Пожалуйста, выберите изображение!', 'danger');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    localStorage.setItem('profileAvatar', dataUrl);
                    loadProfile();
                    
                    // Показываем уведомление
                    showNotification('Аватар успешно обновлен!', 'success');
                };
                reader.onerror = () => {
                    showNotification('Ошибка при чтении файла!', 'danger');
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Сохранение имени
    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', function() {
            const nameInput = document.getElementById('profile-name-input');
            if (nameInput) {
                const newName = nameInput.value.trim();
                if (newName) {
                    if (newName.length > 30) {
                        showNotification('Имя слишком длинное! Максимум 30 символов.', 'warning');
                        return;
                    }
                    
                    localStorage.setItem('profileName', newName);
                    loadProfile();
                    
                    // Показываем уведомление
                    showNotification('Имя профиля успешно сохранено!', 'success');
                } else {
                    showNotification('Введите имя профиля!', 'warning');
                }
            }
        });
    }
    
    // Заполняем поле при открытии модального окна
    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        profileModal.addEventListener('show.bs.modal', function() {
            const currentName = localStorage.getItem('profileName') || 'Андрей';
            const nameInput = document.getElementById('profile-name-input');
            if (nameInput) {
                nameInput.value = currentName;
                nameInput.focus();
            }
            
            // Обновляем статистику при каждом открытии модалки
            loadProfile();
        });
        
        // Обработчик закрытия модалки
        profileModal.addEventListener('hidden.bs.modal', function() {
            cleanupModalBackdrop();
        });
    }
    
    // Обработчик для клика по профилю в сайдбаре
    const profileSection = document.querySelector('.profile-section');
    if (profileSection) {
        profileSection.style.cursor = 'pointer';
        profileSection.addEventListener('click', openProfileModal);
        
        // Добавляем hover эффект
        profileSection.addEventListener('mouseenter', function() {
            this.style.opacity = '0.8';
            this.style.transition = 'opacity 0.2s';
        });
        
        profileSection.addEventListener('mouseleave', function() {
            this.style.opacity = '1';
        });
    }
    
    // Обработчик для нажатия Enter в поле имени
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) {
        nameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('save-profile-btn').click();
            }
        });
    }
    
    // Глобальный обработчик для закрытия модалок по Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
});

// Функция для сброса профиля к значениям по умолчанию
function resetProfile() {
    if (confirm('Вы уверены, что хотите сбросить профиль к настройкам по умолчанию?')) {
        localStorage.removeItem('profileName');
        localStorage.removeItem('profileAvatar');
        loadProfile();
        showNotification('Профиль сброшен к настройкам по умолчанию!', 'info');
        
        // Закрываем модалку профиля
        if (profileModalInstance) {
            profileModalInstance.hide();
        }
    }
}

// Функция для экспорта данных профиля
function exportProfileData() {
    const profileData = {
        name: localStorage.getItem('profileName') || 'Андрей',
        avatar: localStorage.getItem('profileAvatar'),
        playlists: JSON.parse(localStorage.getItem('aurora_playlists') || '{}')
    };
    
    const dataStr = JSON.stringify(profileData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'aurora-profile-backup.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('Данные профиля экспортированы!', 'success');
}

// Функция для импорта данных профиля
function importProfileData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = JSON.parse(ev.target.result);
                
                if (data.name) localStorage.setItem('profileName', data.name);
                if (data.avatar) localStorage.setItem('profileAvatar', data.avatar);
                if (data.playlists) localStorage.setItem('aurora_playlists', JSON.stringify(data.playlists));
                
                loadProfile();
                showNotification('Данные профиля успешно импортированы!', 'success');
            } catch (error) {
                showNotification('Ошибка при импорте файла! Проверьте формат.', 'danger');
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

// Функция для обновления статуса Premium
function updatePremiumStatus(isPremium = true) {
    const premiumBadge = document.querySelector('.profile-section .text-secondary');
    if (premiumBadge) {
        premiumBadge.textContent = isPremium ? 'Premium' : 'Free';
        premiumBadge.className = isPremium ? 'text-success' : 'text-secondary';
    }
    
    // Сохраняем статус в localStorage
    localStorage.setItem('isPremium', isPremium.toString());
    
    if (isPremium) {
        showNotification('Статус Premium активирован!', 'success');
    }
}

// Добавляем дополнительные кнопки в модалку профиля при необходимости
function enhanceProfileModal() {
    const modalBody = document.querySelector('#profileModal .modal-body');
    if (!modalBody) return;
    
    // Проверяем, не добавлены ли уже кнопки
    if (modalBody.querySelector('.enhancement-buttons')) return;
    
    // Добавляем разделитель
    const divider = document.createElement('hr');
    divider.className = 'border-secondary my-4';
    modalBody.appendChild(divider);
    
    // Создаем контейнер для дополнительных кнопок
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'enhancement-buttons d-flex flex-wrap gap-2 mt-3';
    buttonsContainer.innerHTML = `
        <button class="btn btn-outline-warning btn-sm" onclick="resetProfile()" title="Сбросить профиль">
            <i class="bi bi-arrow-counterclockwise"></i> Сбросить
        </button>
        <button class="btn btn-outline-info btn-sm" onclick="exportProfileData()" title="Экспорт данных">
            <i class="bi bi-download"></i> Экспорт
        </button>
        <button class="btn btn-outline-primary btn-sm" onclick="importProfileData()" title="Импорт данных">
            <i class="bi bi-upload"></i> Импорт
        </button>
        <button class="btn btn-outline-success btn-sm" onclick="openCustomizationModal()" title="Настройки интерфейса">
            <i class="bi bi-sliders"></i> Интерфейс
        </button>
    `;
    
    modalBody.appendChild(buttonsContainer);
}

// Кастомизация плеера и интерфейса
function openCustomizationModal() {
    closeAllModals(); // Закрываем все модалки перед открытием новой
    
    const modalElement = document.getElementById('playerCustomizationModal');
    if (!modalElement) return;
    
    // Создаем или получаем экземпляр модального окна
    if (!customizationModalInstance) {
        customizationModalInstance = new bootstrap.Modal(modalElement, {
            backdrop: true,
            keyboard: true,
            focus: true
        });
    }
    
    // Обработчик для корректного закрытия
    modalElement.addEventListener('hidden.bs.modal', function() {
        cleanupModalBackdrop();
    });
    
    loadCustomizationSettings();
    initVisualizerPreview();
    customizationModalInstance.show();
}

function loadCustomizationSettings() {
    // Загрузка настроек эквалайзера
    const eqSettings = JSON.parse(localStorage.getItem('aurora_eq_settings') || '{}');
    const defaultEq = {
        enabled: false,
        autoEq: false,
        preset: 'flat',
        bands: {
            '32': 0, '64': 0, '125': 0, '250': 0, '500': 0,
            '1000': 0, '2000': 0, '4000': 0, '8000': 0, '16000': 0
        }
    };
    
    const settings = { ...defaultEq, ...eqSettings };
    
    // Загрузка ползунков эквалайзера
    document.querySelectorAll('.eq-slider').forEach(slider => {
        const freq = slider.dataset.freq;
        const value = settings.bands[freq] || 0;
        slider.value = value;
        const valueDisplay = document.getElementById(`eq-${freq}hz-value`);
        if (valueDisplay) valueDisplay.textContent = `${value > 0 ? '+' : ''}${value}dB`;
    });
    
    // Загрузка переключателей
    const eqEnabled = document.getElementById('eq-enabled');
    const autoEq = document.getElementById('auto-eq');
    if (eqEnabled) eqEnabled.checked = settings.enabled;
    if (autoEq) autoEq.checked = settings.autoEq;
    
    // Загрузка настроек интерфейса
    const uiSettings = JSON.parse(localStorage.getItem('aurora_ui_settings') || '{}');
    const defaultUI = {
        density: 'normal',
        borderRadius: 'medium',
        shadowStyle: 'medium',
        transparency: 0,
        fontSize: 100,
        compactPlayer: false,
        blurEffects: true,
        particlesEffects: false
    };
    
    const ui = { ...defaultUI, ...uiSettings };
    
    // Установка значений интерфейса
    const densityInput = document.querySelector(`input[name="density"][value="${ui.density}"]`);
    const borderRadiusInput = document.querySelector(`input[name="border-radius"][value="${ui.borderRadius}"]`);
    const shadowStyleInput = document.querySelector(`input[name="shadow-style"][value="${ui.shadowStyle}"]`);
    
    if (densityInput) densityInput.checked = true;
    if (borderRadiusInput) borderRadiusInput.checked = true;
    if (shadowStyleInput) shadowStyleInput.checked = true;
    
    const transparencySlider = document.getElementById('transparency-slider');
    const transparencyValue = document.getElementById('transparency-value');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');
    const compactPlayer = document.getElementById('compact-player');
    const blurEffects = document.getElementById('blur-effects');
    const particlesEffects = document.getElementById('particles-effects');
    
    if (transparencySlider) transparencySlider.value = ui.transparency;
    if (transparencyValue) transparencyValue.textContent = `${ui.transparency}%`;
    if (fontSizeSlider) fontSizeSlider.value = ui.fontSize;
    if (fontSizeValue) fontSizeValue.textContent = `${ui.fontSize}%`;
    if (compactPlayer) compactPlayer.checked = ui.compactPlayer;
    if (blurEffects) blurEffects.checked = ui.blurEffects;
    if (particlesEffects) particlesEffects.checked = ui.particlesEffects;
    
    // Загрузка настроек эффектов
    const effectsSettings = JSON.parse(localStorage.getItem('aurora_effects_settings') || '{}');
    const defaultEffects = {
        visualizer: 'bars',
        visualizerColor: '#1db954',
        effectsIntensity: 50,
        transitionEffect: 'fade',
        parallaxEffect: 0,
        pulseEffects: true,
        glowEffects: false,
        animationEffects: true
    };
    
    const effects = { ...defaultEffects, ...effectsSettings };
    
    // Установка значений эффектов
    const visualizerSelect = document.getElementById('visualizer-select');
    const effectsIntensity = document.getElementById('effects-intensity');
    const transitionEffects = document.getElementById('transition-effects');
    const parallaxEffect = document.getElementById('parallax-effect');
    const pulseEffects = document.getElementById('pulse-effects');
    const glowEffects = document.getElementById('glow-effects');
    const animationEffects = document.getElementById('animation-effects');
    
    if (visualizerSelect) visualizerSelect.value = effects.visualizer;
    if (effectsIntensity) effectsIntensity.value = effects.effectsIntensity;
    if (transitionEffects) transitionEffects.value = effects.transitionEffect;
    if (parallaxEffect) parallaxEffect.value = effects.parallaxEffect;
    if (pulseEffects) pulseEffects.checked = effects.pulseEffects;
    if (glowEffects) glowEffects.checked = effects.glowEffects;
    if (animationEffects) animationEffects.checked = effects.animationEffects;
    
    // Установка активного цвета
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.color === effects.visualizerColor) {
            option.classList.add('active');
        }
    });
}

function saveCustomizationSettings() {
    // Сохранение настроек эквалайзера
    const eqSettings = {
        enabled: document.getElementById('eq-enabled').checked,
        autoEq: document.getElementById('auto-eq').checked,
        preset: 'custom',
        bands: {}
    };
    
    document.querySelectorAll('.eq-slider').forEach(slider => {
        const freq = slider.dataset.freq;
        eqSettings.bands[freq] = parseInt(slider.value);
    });
    
    localStorage.setItem('aurora_eq_settings', JSON.stringify(eqSettings));
    
    // Сохранение настроек интерфейса
    const densityInput = document.querySelector('input[name="density"]:checked');
    const borderRadiusInput = document.querySelector('input[name="border-radius"]:checked');
    const shadowStyleInput = document.querySelector('input[name="shadow-style"]:checked');
    
    const uiSettings = {
        density: densityInput ? densityInput.value : 'normal',
        borderRadius: borderRadiusInput ? borderRadiusInput.value : 'medium',
        shadowStyle: shadowStyleInput ? shadowStyleInput.value : 'medium',
        transparency: parseInt(document.getElementById('transparency-slider').value),
        fontSize: parseInt(document.getElementById('font-size-slider').value),
        compactPlayer: document.getElementById('compact-player').checked,
        blurEffects: document.getElementById('blur-effects').checked,
        particlesEffects: document.getElementById('particles-effects').checked
    };
    
    localStorage.setItem('aurora_ui_settings', JSON.stringify(uiSettings));
    
    // Сохранение настроек эффектов
    const activeColor = document.querySelector('.color-option.active');
    const effectsSettings = {
        visualizer: document.getElementById('visualizer-select').value,
        visualizerColor: activeColor ? activeColor.dataset.color : '#1db954',
        effectsIntensity: parseInt(document.getElementById('effects-intensity').value),
        transitionEffect: document.getElementById('transition-effects').value,
        parallaxEffect: parseInt(document.getElementById('parallax-effect').value),
        pulseEffects: document.getElementById('pulse-effects').checked,
        glowEffects: document.getElementById('glow-effects').checked,
        animationEffects: document.getElementById('animation-effects').checked
    };
    
    localStorage.setItem('aurora_effects_settings', JSON.stringify(effectsSettings));
    
    // Применение настроек
    applyCustomizationSettings();
    
    showNotification('Настройки сохранены!', 'success');
}

function applyCustomizationSettings() {
    const uiSettings = JSON.parse(localStorage.getItem('aurora_ui_settings') || '{}');
    const defaultUI = {
        density: 'normal',
        borderRadius: 'medium',
        shadowStyle: 'medium',
        transparency: 0,
        fontSize: 100,
        compactPlayer: false,
        blurEffects: true,
        particlesEffects: false
    };
    
    const ui = { ...defaultUI, ...uiSettings };
    
    // Применение плотности
    document.body.classList.remove('ui-density-compact', 'ui-density-normal', 'ui-density-spacious');
    document.body.classList.add(`ui-density-${ui.density}`);
    
    // Применение скругления
    document.body.classList.remove('ui-radius-none', 'ui-radius-small', 'ui-radius-medium', 'ui-radius-large');
    document.body.classList.add(`ui-radius-${ui.borderRadius}`);
    
    // Применение теней
    document.body.classList.remove('ui-shadow-none', 'ui-shadow-subtle', 'ui-shadow-medium', 'ui-shadow-heavy');
    document.body.classList.add(`ui-shadow-${ui.shadowStyle}`);
    
    // Применение прозрачности
    document.documentElement.style.setProperty('--ui-transparency', `${ui.transparency}%`);
    
    // Применение размера шрифта
    document.documentElement.style.setProperty('--ui-font-size', `${ui.fontSize}%`);
    
    // Применение компактного плеера
    if (ui.compactPlayer) {
        document.body.classList.add('compact-player');
    } else {
        document.body.classList.remove('compact-player');
    }
    
    // Применение размытия
    if (ui.blurEffects) {
        document.body.classList.add('blur-effects');
    } else {
        document.body.classList.remove('blur-effects');
    }
    
    // Применение частиц
    if (ui.particlesEffects) {
        initParticles();
    } else {
        removeParticles();
    }
    
    // Применение эффектов
    applyEffectsSettings();
}

function applyEffectsSettings() {
    const effectsSettings = JSON.parse(localStorage.getItem('aurora_effects_settings') || '{}');
    const defaultEffects = {
        visualizer: 'bars',
        visualizerColor: '#1db954',
        effectsIntensity: 50,
        transitionEffect: 'fade',
        parallaxEffect: 0,
        pulseEffects: true,
        glowEffects: false,
        animationEffects: true
    };
    
    const effects = { ...defaultEffects, ...effectsSettings };
    
    // Применение визуализатора
    if (typeof window.initVisualizer === 'function') {
        window.initVisualizer(effects.visualizer, effects.visualizerColor);
    }
    
    // Применение пульсации
    if (effects.pulseEffects) {
        document.body.classList.add('pulse-effects');
    } else {
        document.body.classList.remove('pulse-effects');
    }
    
    // Применение свечения
    if (effects.glowEffects) {
        document.body.classList.add('glow-effects');
    } else {
        document.body.classList.remove('glow-effects');
    }
    
    // Применение анимаций
    if (effects.animationEffects) {
        document.body.classList.add('animation-effects');
    } else {
        document.body.classList.remove('animation-effects');
    }
    
    // Применение параллакса
    document.documentElement.style.setProperty('--parallax-intensity', effects.parallaxEffect);
}

function applyEqualizerPreset(preset) {
    const presets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        pop: [3, 2, 1, 0, -1, 0, 2, 3, 2, 1],
        rock: [4, 3, 2, 1, 0, 1, 2, 3, 2, 1],
        jazz: [2, 1, 0, -1, 0, 1, 2, 1, 0, -1],
        classical: [1, 0, -1, -2, -1, 0, 1, 2, 1, 0],
        bass: [6, 5, 4, 3, 2, 1, 0, -1, -2, -3],
        vocal: [-2, -1, 0, 2, 3, 4, 3, 1, 0, -1]
    };
    
    const values = presets[preset] || presets.flat;
    const frequencies = ['32', '64', '125', '250', '500', '1000', '2000', '4000', '8000', '16000'];
    
    frequencies.forEach((freq, index) => {
        const slider = document.querySelector(`.eq-slider[data-freq="${freq}"]`);
        if (slider) {
            slider.value = values[index];
            const valueDisplay = document.getElementById(`eq-${freq}hz-value`);
            if (valueDisplay) {
                valueDisplay.textContent = `${values[index] > 0 ? '+' : ''}${values[index]}dB`;
            }
        }
    });
}

function initVisualizerPreview() {
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let animationId;
    
    function drawBars() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barCount = 50;
        const barWidth = canvas.width / barCount;
        
        for (let i = 0; i < barCount; i++) {
            const height = Math.sin(Date.now() / 1000 + i * 0.2) * 30 + 40;
            const x = i * barWidth;
            
            // Градиентный цвет
            const gradient = ctx.createLinearGradient(0, canvas.height - height, 0, canvas.height);
            gradient.addColorStop(0, '#1db954');
            gradient.addColorStop(1, '#0a8b38');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - height, barWidth - 1, height);
        }
    }
    
    function animate() {
        drawBars();
        animationId = requestAnimationFrame(animate);
    }
    
    animate();
    
    // Очистка анимации при закрытии модалки
    const modal = document.getElementById('playerCustomizationModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        });
    }
}

function initParticles() {
    if (document.getElementById('particles-canvas')) return;
    
    const canvas = document.createElement('canvas');
    canvas.id = 'particles-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '-1';
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const particleCount = 100;
    
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = Math.random() * 0.5 - 0.25;
            this.speedY = Math.random() * 0.5 - 0.25;
            this.color = `rgba(29, 185, 84, ${Math.random() * 0.3 + 0.1})`;
        }
        
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            
            if (this.x > canvas.width) this.x = 0;
            if (this.x < 0) this.x = canvas.width;
            if (this.y > canvas.height) this.y = 0;
            if (this.y < 0) this.y = canvas.height;
        }
        
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
    
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
        
        requestAnimationFrame(animateParticles);
    }
    
    animateParticles();
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

function removeParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (canvas) {
        canvas.remove();
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    loadProfile();
    
    // Улучшаем модалку профиля
    setTimeout(enhanceProfileModal, 100);
    
    // Инициализация слушателей событий для кастомизации
    const customizationModal = document.getElementById('playerCustomizationModal');
    if (customizationModal) {
        // Сброс эквалайзера
        const resetEqBtn = document.getElementById('reset-eq-btn');
        if (resetEqBtn) {
            resetEqBtn.addEventListener('click', () => {
                applyEqualizerPreset('flat');
            });
        }
        
        // Предустановки эквалайзера
        document.querySelectorAll('.eq-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                applyEqualizerPreset(preset);
            });
        });
        
        // Обновление значений эквалайзера
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', function() {
                const freq = this.dataset.freq;
                const value = this.value;
                const valueDisplay = document.getElementById(`eq-${freq}hz-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = `${value > 0 ? '+' : ''}${value}dB`;
                }
            });
        });
        
        // Обновление слайдеров
        const transparencySlider = document.getElementById('transparency-slider');
        const transparencyValue = document.getElementById('transparency-value');
        if (transparencySlider && transparencyValue) {
            transparencySlider.addEventListener('input', function() {
                transparencyValue.textContent = `${this.value}%`;
            });
        }
        
        const fontSizeSlider = document.getElementById('font-size-slider');
        const fontSizeValue = document.getElementById('font-size-value');
        if (fontSizeSlider && fontSizeValue) {
            fontSizeSlider.addEventListener('input', function() {
                fontSizeValue.textContent = `${this.value}%`;
            });
        }
        
        // Выбор цвета
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
            });
        });
        
        // Тест эффектов
        const testEffectsBtn = document.getElementById('test-effects-btn');
        if (testEffectsBtn) {
            testEffectsBtn.addEventListener('click', function() {
                const visualizer = document.getElementById('visualizer-select').value;
                showNotification(`Тестируется визуализатор: ${visualizer}. Попробуйте воспроизвести музыку для проверки эффектов!`, 'info');
            });
        }
        
        // Сохранение настроек
        const saveCustomizationBtn = document.getElementById('save-customization-btn');
        if (saveCustomizationBtn) {
            saveCustomizationBtn.addEventListener('click', saveCustomizationSettings);
        }
    }
    
    // Применяем настройки при загрузке
    applyCustomizationSettings();
});

// Экспортируем функции для использования в других модулях
if (typeof window !== 'undefined') {
    window.loadProfile = loadProfile;
    window.openProfileModal = openProfileModal;
    window.resetProfile = resetProfile;
    window.exportProfileData = exportProfileData;
    window.importProfileData = importProfileData;
    window.updatePremiumStatus = updatePremiumStatus;
    window.openCustomizationModal = openCustomizationModal;
    window.applyCustomizationSettings = applyCustomizationSettings;
    window.closeAllModals = closeAllModals;
}
