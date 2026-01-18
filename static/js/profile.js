// profile.js - Управление профилем

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
    // Открываем модальное окно профиля
    const profileModal = new bootstrap.Modal(document.getElementById('profileModal'));
    profileModal.show();
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
                    
                    // Закрываем модалку через 1 секунду
                    setTimeout(() => {
                        const modal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
                        if (modal) modal.hide();
                    }, 1000);
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
        
        // Сбрасываем поле ввода при закрытии
        profileModal.addEventListener('hidden.bs.modal', function() {
            const nameInput = document.getElementById('profile-name-input');
            if (nameInput) nameInput.value = '';
            
            const avatarInput = document.getElementById('avatar-input');
            if (avatarInput) avatarInput.value = '';
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
});

// Функция для сброса профиля к значениям по умолчанию
function resetProfile() {
    if (confirm('Вы уверены, что хотите сбросить профиль к настройкам по умолчанию?')) {
        localStorage.removeItem('profileName');
        localStorage.removeItem('profileAvatar');
        loadProfile();
        showNotification('Профиль сброшен к настройкам по умолчанию!', 'info');
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
    
    // Добавляем разделитель
    const divider = document.createElement('hr');
    divider.className = 'border-secondary my-4';
    modalBody.appendChild(divider);
    
    // Создаем контейнер для дополнительных кнопок
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'd-flex flex-wrap gap-2 mt-3';
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
    `;
    
    modalBody.appendChild(buttonsContainer);
}

// Вызываем улучшение модалки при загрузке
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(enhanceProfileModal, 100);
});

// Экспортируем функции для использования в других модулях
if (typeof window !== 'undefined') {
    window.loadProfile = loadProfile;
    window.openProfileModal = openProfileModal;
    window.resetProfile = resetProfile;
    window.exportProfileData = exportProfileData;
    window.importProfileData = importProfileData;
    window.updatePremiumStatus = updatePremiumStatus;
}
