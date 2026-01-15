// Загрузка профиля из localStorage
function loadProfile() {
    const name = localStorage.getItem('profileName') || 'Андрей';
    const avatar = localStorage.getItem('profileAvatar') || 'https://via.placeholder.com/150';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-name-modal').textContent = name;
    document.getElementById('profile-avatar').src = avatar;
    document.getElementById('profile-avatar-modal').src = avatar;

    // Статистика треков
    fetch('/tracks')
        .then(r => r.json())
        .then(d => {
            document.getElementById('profile-stats').textContent = `Треков в библиотеке: ${d.length}`;
        });
}

// Смена аватара
document.getElementById('change-avatar-btn').addEventListener('click', () => {
    document.getElementById('avatar-input').click();
});

document.getElementById('avatar-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            localStorage.setItem('profileAvatar', dataUrl);
            loadProfile();
        };
        reader.readAsDataURL(file);
    }
});

// Тема
const themeSwitch = document.getElementById('dark-theme-switch');
themeSwitch.checked = localStorage.getItem('darkTheme') !== 'false';
themeSwitch.addEventListener('change', (e) => {
    const isDark = e.target.checked;
    document.body.classList.toggle('bg-light text-dark', !isDark);
    document.body.classList.toggle('bg-black text-light', isDark);
    localStorage.setItem('darkTheme', isDark);
});

// При загрузке
loadProfile();
