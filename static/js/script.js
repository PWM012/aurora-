const audio = document.getElementById('player');
const trackGrid = document.getElementById('track-grid');
const progress = document.getElementById('progress');
const volume = document.getElementById('volume');
let tracks = [];
let currentIndex = -1;
let shuffle = false;
let repeat = false;
let isYtSearch = false;

const placeholder = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMyODI4MjgiLz48Y2lyY2xlIGN4PSIxMDAiIGN5PSI5MCIgcj0iNDAiIGZpbGw9IiMxZGI5NTQiLz48cGF0aCBkPSJNODAgNjAgdjgwIiBzdHJva2U9IiMxZGI5NTQiIHN0cm9rZS13aWR0aD0iMjAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==';

function formatTime(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgressFill() {
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progress.style.background = `linear-gradient(to right, #1db954 ${percent}%, #404040 ${percent}%)`;
}

function updateVolumeFill() {
    const percent = audio.volume * 100;
    volume.style.background = `linear-gradient(to right, #1db954 ${percent}%, #404040 ${percent}%)`;
}

function renderTracks(data, yt = false) {
    trackGrid.innerHTML = '';
    isYtSearch = yt;
    tracks = data;
    data.forEach((track, i) => {
        const col = document.createElement('div');
        col.className = 'col';
        const cover = track.cover || track.thumbnail || placeholder;
        col.innerHTML = `
            <div class="card h-100 position-relative">
                <img src="${cover}" class="card-img-top" alt="cover">
                <div class="play-overlay">
                    <button class="btn btn-success rounded-circle shadow-lg play-overlay-btn" data-index="${i}">
                        <i class="bi bi-play-fill fs-1"></i>
                    </button>
                </div>
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title text-white text-truncate mb-1">${track.title || 'Неизвестно'}</h5>
                    <p class="card-text text-secondary small text-truncate mb-2">${track.artist || 'Неизвестный артист'}</p>
                    <p class="text-secondary small mb-3">${formatTime(track.duration)}</p>
                    <div class="mt-auto d-flex gap-2 flex-wrap">
                        <button class="btn btn-outline-light btn-sm lyrics-btn" data-videoid="${track.videoId || ''}" data-index="${i}">Текст</button>
                        ${yt ? `<button class="btn btn-success btn-sm add-yt-btn" data-videoid="${track.videoId}" data-index="${i}">Добавить</button>` : ''}
                        ${!yt ? `<button class="btn btn-danger btn-sm delete-btn" data-filename="${track.filename}" data-index="${i}">Удалить</button>` : ''}
                        ${!yt ? `<a href="/download/${track.filename}" class="btn btn-outline-light btn-sm" target="_blank">Скачать</a>` : ''}
                    </div>
                </div>
            </div>
        `;

        // Клик по карточке (кроме кнопок и оверлея)
        const card = col.querySelector('.card');
        card.addEventListener('click', (e) => {
            // Если клик по кнопке, оверлею или ссылке - не запускать трек
            if (e.target.closest('.btn') || e.target.closest('.play-overlay') || e.target.tagName === 'A') {
                return;
            }
            yt ? playYtTrack(i) : playLocalTrack(i);
        });

        // Обработчик для кнопки воспроизведения в оверлее
        const overlayBtn = col.querySelector('.play-overlay-btn');
        overlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            yt ? playYtTrack(i) : playLocalTrack(i);
        });

        // Обработчики для кнопок в карточке
        const lyricsBtn = col.querySelector('.lyrics-btn');
        lyricsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const videoId = lyricsBtn.dataset.videoid;
            if (!videoId) {
                document.getElementById('lyrics-text').textContent = 'Текст недоступен';
            } else {
                fetch(`/lyrics?videoId=${videoId}`)
                    .then(r => r.json())
                    .then(data => document.getElementById('lyrics-text').textContent = data.lyrics || 'Текст не найден');
            }
            new bootstrap.Modal(document.getElementById('lyricsModal')).show();
        });

        if (yt) {
            const addBtn = col.querySelector('.add-yt-btn');
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addBtn.disabled = true;
                addBtn.textContent = 'Скачивается...';
                fetch('/add_from_yt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoId: addBtn.dataset.videoid })
                }).then(() => {
                    alert('Трек добавлен!');
                    loadLocal();
                });
            });
        } else {
            const deleteBtn = col.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Удалить трек?')) {
                    fetch('/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: deleteBtn.dataset.filename })
                    }).then(() => loadLocal());
                }
            });
        }

        trackGrid.appendChild(col);
    });
}

function playLocalTrack(idx) {
    currentIndex = idx;
    const track = tracks[idx];
    audio.src = `/stream/${track.filename}`;
    audio.play();
    updatePlayerUI(track);
    updateProgressFill();
    document.getElementById('download-current').style.display = 'inline-block';
    document.getElementById('download-current').href = `/download/${track.filename}`;
    
    // Обновляем иконку кнопки play
    document.getElementById('play-btn').innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
}

function playYtTrack(idx) {
    currentIndex = idx;
    const track = tracks[idx];
    audio.src = `/yt_stream/${track.videoId}`;
    audio.play();
    updatePlayerUI({
        title: track.title,
        artist: track.artist,
        cover: track.thumbnail || placeholder,
        duration: track.duration
    });
    document.getElementById('download-current').style.display = 'none';
    updateProgressFill();
    
    // Обновляем иконку кнопки play
    document.getElementById('play-btn').innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
}

function updatePlayerUI(track) {
    document.getElementById('current-title').textContent = track.title || 'Неизвестно';
    document.getElementById('current-artist').textContent = track.artist || '';
    document.getElementById('current-cover').src = track.cover || track.thumbnail || placeholder;
    document.getElementById('duration').textContent = formatTime(track.duration);
}

// Контролы плеера
audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        progress.value = (audio.currentTime / audio.duration) * 100;
        document.getElementById('current-time').textContent = formatTime(audio.currentTime);
        updateProgressFill();
    }
});

progress.addEventListener('input', () => {
    audio.currentTime = (progress.value / 100) * audio.duration;
    updateProgressFill();
});

volume.addEventListener('input', (e) => {
    audio.volume = e.target.value;
    updateVolumeFill();
    const icon = document.getElementById('volume-btn');
    if (audio.volume === 0) icon.innerHTML = '<i class="bi bi-volume-mute-fill fs-4"></i>';
    else if (audio.volume < 0.5) icon.innerHTML = '<i class="bi bi-volume-down-fill fs-4"></i>';
    else icon.innerHTML = '<i class="bi bi-volume-up-fill fs-4"></i>';
});

audio.addEventListener('volumechange', updateVolumeFill);

document.getElementById('play-btn').addEventListener('click', () => {
    if (audio.src) {
        if (audio.paused) {
            audio.play();
            document.getElementById('play-btn').innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
        } else {
            audio.pause();
            document.getElementById('play-btn').innerHTML = '<i class="bi bi-play-fill fs-2"></i>';
        }
    }
});

audio.addEventListener('play', () => {
    document.getElementById('play-btn').innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
});

audio.addEventListener('pause', () => {
    document.getElementById('play-btn').innerHTML = '<i class="bi bi-play-fill fs-2"></i>';
});

document.getElementById('next-btn').addEventListener('click', () => {
    if (tracks.length === 0) return;
    
    let next = currentIndex + 1;
    if (shuffle) next = Math.floor(Math.random() * tracks.length);
    if (next >= tracks.length) next = repeat ? 0 : currentIndex;
    if (next !== currentIndex && tracks[next]) {
        isYtSearch ? playYtTrack(next) : playLocalTrack(next);
    }
});

document.getElementById('prev-btn').addEventListener('click', () => {
    if (tracks.length === 0) return;
    
    let prev = currentIndex - 1;
    if (prev < 0) prev = repeat ? tracks.length - 1 : currentIndex;
    if (prev !== currentIndex && tracks[prev]) {
        isYtSearch ? playYtTrack(prev) : playLocalTrack(prev);
    }
});

document.getElementById('shuffle-btn').addEventListener('click', () => {
    shuffle = !shuffle;
    document.getElementById('shuffle-btn').classList.toggle('text-success', shuffle);
});

document.getElementById('repeat-btn').addEventListener('click', () => {
    repeat = !repeat;
    document.getElementById('repeat-btn').classList.toggle('text-success', repeat);
});

audio.addEventListener('ended', () => {
    document.getElementById('next-btn').click();
});

// Навигация
document.getElementById('home-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('page-title').textContent = 'Главная';
    loadLocal();
});

document.getElementById('search-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('search-bar').style.display = 'flex';
    document.getElementById('page-title').textContent = 'Поиск';
    document.getElementById('search-input').focus();
});

document.getElementById('search-btn').addEventListener('click', () => {
    const query = document.getElementById('search-input').value.trim();
    if (query) loadYt(query);
});

document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
});

function loadLocal() {
    fetch('/tracks')
        .then(r => r.json())
        .then(d => renderTracks(d, false))
        .catch(err => console.error('Ошибка загрузки локальных треков:', err));
}

function loadYt(q) {
    fetch(`/yt_search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => renderTracks(d, true))
        .catch(err => console.error('Ошибка поиска YouTube:', err));
}

// Загрузка треков
document.getElementById('upload-submit').addEventListener('click', () => {
    const formData = new FormData(document.getElementById('upload-form'));
    fetch('/upload', { method: 'POST', body: formData })
        .then(() => {
            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
            loadLocal();
        })
        .catch(err => console.error('Ошибка загрузки:', err));
});

// Обработчики для профиля
document.getElementById('change-avatar-btn').addEventListener('click', () => {
    document.getElementById('avatar-input').click();
});

document.getElementById('avatar-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('profile-avatar-modal').src = event.target.result;
            document.getElementById('profile-avatar').src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Обновление статистики профиля при открытии модала
document.getElementById('profileModal').addEventListener('show.bs.modal', () => {
    fetch('/tracks')
        .then(r => r.json())
        .then(tracks => {
            document.getElementById('profile-stats').textContent = `Треков в библиотеке: ${tracks.length}`;
        });
});

// Настройки
document.getElementById('dark-theme-switch').addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.remove('bg-light', 'text-dark');
        document.body.classList.add('bg-black', 'text-light');
    } else {
        document.body.classList.remove('bg-black', 'text-light');
        document.body.classList.add('bg-light', 'text-dark');
    }
});

// Инициализация
loadLocal();
updateVolumeFill();
updateProgressFill();

// Устанавливаем начальные значения ползунков
progress.value = 0;
volume.value = 1;
