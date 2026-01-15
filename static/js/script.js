const audio = document.getElementById('player');
const trackGrid = document.getElementById('track-grid');
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
                    <button class="btn btn-success rounded-circle shadow-lg" style="width:80px;height:80px;">
                        <i class="bi bi-play-fill fs-1"></i>
                    </button>
                </div>
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title text-white text-truncate mb-1">${track.title}</h5>
                    <p class="card-text text-secondary small text-truncate mb-2">${track.artist}</p>
                    <p class="text-secondary small mb-3">${formatTime(track.duration)}</p>
                    <div class="mt-auto d-flex gap-2 flex-wrap">
                        <button class="btn btn-outline-light btn-sm lyrics-btn" data-videoid="${track.videoId || ''}">Текст</button>
                        ${yt ? `<button class="btn btn-success btn-sm add-yt-btn" data-videoid="${track.videoId}">Добавить</button>` : ''}
                        ${!yt ? `<button class="btn btn-danger btn-sm delete-btn" data-filename="${track.filename}">Удалить</button>` : ''}
                        ${!yt ? `<a href="/download/${track.filename}" class="btn btn-outline-light btn-sm">Скачать</a>` : ''}
                    </div>
                </div>
            </div>
        `;
        col.addEventListener('click', (e) => {
            if (e.target.closest('.btn')) return;
            if (yt) playYtTrack(i);
            else playLocalTrack(i);
        });
        trackGrid.appendChild(col);
    });
}

function playLocalTrack(idx) {
    currentIndex = idx;
    const track = tracks[idx];
    audio.src = `/stream/${track.filename}`;
    audio.play();
    updatePlayerUI(track);
}

function playYtTrack(idx) {
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
}

function updatePlayerUI(track) {
    document.getElementById('current-title').textContent = track.title;
    document.getElementById('current-artist').textContent = track.artist;
    document.getElementById('current-cover').src = track.cover || track.thumbnail || placeholder;
    document.getElementById('duration').textContent = formatTime(track.duration);
    document.getElementById('download-current').style.display = 'none';
}

audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        document.getElementById('progress').value = (audio.currentTime / audio.duration) * 100;
        document.getElementById('current-time').textContent = formatTime(audio.currentTime);
    }
});

document.getElementById('progress').addEventListener('input', () => {
    audio.currentTime = (document.getElementById('progress').value / 100) * audio.duration;
});

document.getElementById('play-btn').addEventListener('click', () => {
    audio.paused ? audio.play() : audio.pause();
});

document.getElementById('next-btn').addEventListener('click', () => {
    let next = currentIndex + 1;
    if (shuffle) next = Math.floor(Math.random() * tracks.length);
    if (next >= tracks.length) next = repeat ? 0 : currentIndex;
    isYtSearch ? playYtTrack(next) : playLocalTrack(next);
});

document.getElementById('prev-btn').addEventListener('click', () => {
    let prev = currentIndex - 1;
    if (prev < 0) prev = repeat ? tracks.length - 1 : currentIndex;
    isYtSearch ? playYtTrack(prev) : playLocalTrack(prev);
});

document.getElementById('shuffle-btn').addEventListener('click', () => {
    shuffle = !shuffle;
    document.getElementById('shuffle-btn').classList.toggle('text-success', shuffle);
});

document.getElementById('repeat-btn').addEventListener('click', () => {
    repeat = !repeat;
    document.getElementById('repeat-btn').classList.toggle('text-success', repeat);
});

document.getElementById('volume').addEventListener('input', (e) => {
    audio.volume = e.target.value;
    const icon = document.getElementById('volume-btn');
    if (audio.volume === 0) icon.innerHTML = '<i class="bi bi-volume-mute-fill fs-5"></i>';
    else if (audio.volume < 0.5) icon.innerHTML = '<i class="bi bi-volume-down-fill fs-5"></i>';
    else icon.innerHTML = '<i class="bi bi-volume-up-fill fs-5"></i>';
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

document.getElementById('search-btn').addEventListener('click', () => loadYt(document.getElementById('search-input').value.trim()));
document.getElementById('search-input').addEventListener('keydown', e => e.key === 'Enter' && document.getElementById('search-btn').click());

function loadLocal() { fetch('/tracks').then(r => r.json()).then(d => renderTracks(d, false)); }
function loadYt(q) { if (q) fetch(`/yt_search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => renderTracks(d, true)); }

// Добавление
trackGrid.addEventListener('click', e => {
    if (e.target.classList.contains('add-yt-btn')) {
        const videoId = e.target.dataset.videoid;
        e.target.disabled = true;
        e.target.textContent = 'Скачивается...';
        fetch('/add_from_yt', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({videoId})
        }).then(() => {
            alert('Трек добавлен!');
            loadLocal();
        });
    }
});

// Удаление
trackGrid.addEventListener('click', e => {
    if (e.target.classList.contains('delete-btn')) {
        if (confirm('Удалить трек?')) {
            fetch('/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({filename: e.target.dataset.filename})
            }).then(() => loadLocal());
        }
    }
});

// Lyrics
trackGrid.addEventListener('click', e => {
    if (e.target.classList.contains('lyrics-btn')) {
        const videoId = e.target.dataset.videoid;
        if (!videoId) {
            document.getElementById('lyrics-text').textContent = 'Текст недоступен';
        } else {
            fetch(`/lyrics?videoId=${videoId}`).then(r => r.json()).then(data => {
                document.getElementById('lyrics-text').textContent = data.lyrics;
            });
        }
        new bootstrap.Modal(document.getElementById('lyricsModal')).show();
    }
});

// Загрузка
document.getElementById('upload-submit').addEventListener('click', () => {
    const formData = new FormData(document.getElementById('upload-form'));
    fetch('/upload', {method: 'POST', body: formData}).then(() => {
        bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
        loadLocal();
    });
});

loadLocal();
