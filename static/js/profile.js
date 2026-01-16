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
        });
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
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    localStorage.setItem('profileAvatar', dataUrl);
                    loadProfile();
                    
                    // Показываем уведомление
                    if (typeof showNotification === 'function') {
                        showNotification('Аватар обновлен!', 'success');
                    }
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
                    localStorage.setItem('profileName', newName);
                    loadProfile();
                    
                    // Показываем уведомление
                    if (typeof showNotification === 'function') {
                        showNotification('Имя профиля сохранено!', 'success');
                    }
                } else {
                    alert('Введите имя профиля!');
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
            if (nameInput) nameInput.value = currentName;
        });
    }
});
