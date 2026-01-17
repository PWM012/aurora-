const audio = document.getElementById('player');
const trackGrid = document.getElementById('track-grid');
const progress = document.getElementById('progress');
const volume = document.getElementById('volume');
const playlistsList = document.getElementById('playlists-list');
let tracks = [];
let currentIndex = -1;
let shuffle = false;
let repeat = false;
let isYtSearch = false;
let currentPlaylist = null;
let currentPlaylistName = null;
let trackToAdd = null;

// Глобальные переменные для главной страницы
let ytHomeData = null;
let homeReleases = [];
let homeCharts = [];
let homeTrending = [];

const placeholder = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMyODI4MjgiLz48Y2lyY2xlIGN4PSIxMDAiIGN5PSI5MCIgcj0iNDAiIGZpbGw9IiMxZGI5NTQiLz48cGF0aCBkPSJNODAgNjAgdjgwIiBzdHJva2U9IiMxZGI5NTQiIHN0cm9rZS13aWR0aD0iMjAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==';

// Инициализация цветов плеера
function initPlayerColors() {
    setTimeout(() => {
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            const accentColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--accent-color').trim();
            playBtn.style.backgroundColor = accentColor;
        }
        
        updateProgressFill();
        updateVolumeFill();
    }, 100);
}

function formatTime(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgressFill() {
    if (!audio || !progress) return;
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim();
    progress.style.background = `linear-gradient(to right, ${accentColor} ${percent}%, #404040 ${percent}%)`;
}

function updateVolumeFill() {
    if (!audio || !volume) return;
    const percent = audio.volume * 100;
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim();
    volume.style.background = `linear-gradient(to right, ${accentColor} ${percent}%, #404040 ${percent}%)`;
}

// ==================== ПЛЕЙЛИСТЫ ====================

function getPlaylists() {
    return JSON.parse(localStorage.getItem('aurora_playlists') || '{}');
}

function savePlaylists(playlists) {
    localStorage.setItem('aurora_playlists', JSON.stringify(playlists));
}

function loadPlaylists() {
    playlistsList.innerHTML = '';
    const playlists = getPlaylists();
    
    Object.keys(playlists).forEach(name => {
        const li = document.createElement('li');
        li.className = 'nav-item playlist-item';
        li.innerHTML = `
            <a href="#" class="nav-link playlist-link" data-name="${name}">
                <div class="d-flex align-items-center">
                    <i class="bi bi-music-note-list me-3"></i>
                    <span class="playlist-name">${name}</span>
                </div>
                <button class="btn btn-sm edit-playlist-btn" 
                        data-name="${name}" title="Управлять">
                    <i class="bi bi-gear"></i>
                </button>
            </a>
        `;
        playlistsList.appendChild(li);
    });
    
    document.querySelectorAll('.playlist-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const playlistName = e.currentTarget.dataset.name;
            showPlaylist(playlistName);
        });
    });
    
    document.querySelectorAll('.edit-playlist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const playlistName = btn.dataset.name;
            openPlaylistManager(playlistName);
        });
    });
}

function createPlaylist(name) {
    if (!name.trim()) return false;
    
    const playlists = getPlaylists();
    if (playlists[name]) {
        alert('Плейлист с таким именем уже существует!');
        return false;
    }
    
    playlists[name] = {
        tracks: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
    };
    
    savePlaylists(playlists);
    loadPlaylists();
    return true;
}

function deletePlaylist(name) {
    if (!confirm(`Удалить плейлист "${name}"?`)) return false;
    
    const playlists = getPlaylists();
    delete playlists[name];
    savePlaylists(playlists);
    loadPlaylists();
    
    if (currentPlaylist === name) {
        document.getElementById('home-link').click();
    }
    
    return true;
}

function addTrackToPlaylist(playlistName, trackFilename) {
    const playlists = getPlaylists();
    
    if (!playlists[playlistName]) {
        alert('Плейлист не найден!');
        return false;
    }
    
    if (!playlists[playlistName].tracks.includes(trackFilename)) {
        playlists[playlistName].tracks.push(trackFilename);
        playlists[playlistName].updated = new Date().toISOString();
        savePlaylists(playlists);
        return true;
    } else {
        alert('Трек уже есть в этом плейлисте!');
        return false;
    }
}

function removeTrackFromPlaylist(playlistName, trackFilename) {
    const playlists = getPlaylists();
    
    if (playlists[playlistName]) {
        playlists[playlistName].tracks = playlists[playlistName].tracks.filter(
            t => t !== trackFilename
        );
        playlists[playlistName].updated = new Date().toISOString();
        savePlaylists(playlists);
        
        if (currentPlaylist === playlistName) {
            showPlaylist(playlistName);
        }
        
        return true;
    }
    return false;
}

function showPlaylist(name) {
    const playlists = getPlaylists();
    const playlist = playlists[name];
    
    if (!playlist) {
        alert('Плейлист не найден!');
        return;
    }
    
    currentPlaylist = name;
    document.getElementById('page-title').textContent = name;
    
    // Полностью очищаем и сбрасываем сетку
    trackGrid.innerHTML = '';
    
    // Убираем стили главной страницы
    document.body.classList.remove('home-page');
    
    // Убираем все грид-стили и применяем классы Bootstrap
    trackGrid.style.display = '';
    trackGrid.style.gridTemplateColumns = '';
    trackGrid.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 row-cols-xl-6 g-4';
    
    trackGrid.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-success" role="status"></div>
            <p class="mt-2">Загружаем плейлист...</p>
        </div>
    `;
    
    fetch('/tracks')
        .then(r => r.json())
        .then(allTracks => {
            const playlistTracks = allTracks.filter(t => 
                playlist.tracks.includes(t.filename)
            );
            renderTracks(playlistTracks, false);
        })
        .catch(err => console.error('Ошибка загрузки плейлиста:', err));
}

function openPlaylistManager(playlistName) {
    const playlists = getPlaylists();
    const playlist = playlists[playlistName];
    
    if (!playlist) return;
    
    currentPlaylistName = playlistName;
    document.getElementById('manage-playlist-title').textContent = `Управление: ${playlistName}`;
    document.getElementById('edit-playlist-name').value = playlistName;
    
    fetch('/tracks')
        .then(r => r.json())
        .then(allTracks => {
            const playlistTracks = allTracks.filter(t => 
                playlist.tracks.includes(t.filename)
            );
            
            const tracksList = document.getElementById('playlist-tracks-list');
            tracksList.innerHTML = '';
            
            if (playlistTracks.length === 0) {
                tracksList.innerHTML = '<p class="text-secondary text-center">Плейлист пуст</p>';
            } else {
                playlistTracks.forEach(track => {
                    const trackElement = document.createElement('div');
                    trackElement.className = 'd-flex justify-content-between align-items-center p-2 border-bottom border-secondary';
                    trackElement.innerHTML = `
                        <div class="d-flex align-items-center">
                            <img src="${track.cover || placeholder}" 
                                 class="rounded me-3" 
                                 style="width:40px;height:40px;object-fit:cover;">
                            <div>
                                <div class="text-white">${track.title}</div>
                                <div class="text-secondary small">${track.artist}</div>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-danger remove-track-btn" 
                                data-filename="${track.filename}">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    `;
                    tracksList.appendChild(trackElement);
                });
                
                document.querySelectorAll('.remove-track-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const filename = btn.dataset.filename;
                        removeTrackFromPlaylist(playlistName, filename);
                    });
                });
            }
            
            new bootstrap.Modal(document.getElementById('managePlaylistModal')).show();
        })
        .catch(err => {
            const tracksList = document.getElementById('playlist-tracks-list');
            tracksList.innerHTML = '<p class="text-secondary text-center">Плейлист пуст</p>';
            new bootstrap.Modal(document.getElementById('managePlaylistModal')).show();
        });
}

// ==================== ОТОБРАЖЕНИЕ ТРЕКОВ ====================

function renderTracks(data, yt = false) {
    // Полностью очищаем и сбрасываем сетку
    trackGrid.innerHTML = '';
    
    // Убираем стили главной страницы
    document.body.classList.remove('home-page');
    
    // Убираем все грид-стили и применяем классы Bootstrap
    trackGrid.style.display = '';
    trackGrid.style.gridTemplateColumns = '';
    trackGrid.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 row-cols-xl-6 g-4';
    
    isYtSearch = yt;
    tracks = data || [];
    
    if (tracks.length === 0) {
        trackGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-music-note-beamed fs-1 text-secondary"></i>
                <p class="text-secondary mt-3">${currentPlaylist ? 'Плейлист пуст' : 'Нет треков'}</p>
            </div>
        `;
        return;
    }
    
    tracks.forEach((track, i) => {
        const col = document.createElement('div');
        col.className = 'col';
        const cover = track.cover || track.thumbnail || placeholder;
        
        col.innerHTML = `
            <div class="card h-100 position-relative">
                <div class="card-img-container position-relative">
                    <img src="${cover}" class="card-img-top" alt="cover">
                    <div class="play-overlay">
                        <button class="btn btn-success rounded-circle shadow-lg play-overlay-btn">
                            <i class="bi bi-play-fill fs-1"></i>
                        </button>
                    </div>
                </div>
                
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title text-white text-truncate mb-1">${track.title || 'Неизвестно'}</h5>
                    <p class="card-text text-secondary small text-truncate mb-2">${track.artist || 'Неизвестный артист'}</p>
                    <p class="text-secondary small mb-3">${formatTime(track.duration)}</p>
                    <div class="card-actions mt-auto">
                        <button class="action-btn lyrics" data-tooltip="Текст песни" data-title="${track.title}" data-artist="${track.artist}" data-videoid="${track.videoId || track.id || ''}">
                            <i class="bi bi-chat-left-text"></i>
                        </button>
                        ${yt ? `<button class="action-btn add" data-tooltip="Добавить" data-videoid="${track.videoId || track.id}"><i class="bi bi-plus"></i></button>` : ''}
                        ${!yt ? `<button class="action-btn playlist" data-tooltip="В плейлист" data-index="${i}"><i class="bi bi-plus-circle"></i></button>` : ''}
                        ${!yt ? `<button class="action-btn delete" data-tooltip="Удалить" data-filename="${track.filename}"><i class="bi bi-trash"></i></button>` : ''}
                        ${!yt ? `<a href="/download/${track.filename}" class="action-btn download" data-tooltip="Скачать"><i class="bi bi-download"></i></a>` : ''}
                    </div>
                </div>
            </div>
        `;

        const overlayBtn = col.querySelector('.play-overlay-btn');
        if (overlayBtn) {
            overlayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (yt) {
                    playYtTrack(i);
                } else {
                    playLocalTrack(i);
                }
            });
        }

        const lyricsBtn = col.querySelector('.lyrics');
        if (lyricsBtn) {
            lyricsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const title = lyricsBtn.dataset.title;
                const artist = lyricsBtn.dataset.artist;
                const videoId = lyricsBtn.dataset.videoid;
                getLyrics(title, artist, videoId);
            });
        }

        const addBtn = col.querySelector('.add');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const videoId = addBtn.dataset.videoid;
                fetch('/add_from_yt', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({videoId})
                }).then(() => {
                    loadLibrary();
                    showToast('Трек добавлен в библиотеку!', 'success');
                }).catch(() => {
                    showToast('Ошибка добавления трека', 'danger');
                });
            });
        }

        const playlistBtn = col.querySelector('.playlist');
        if (playlistBtn) {
            playlistBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                trackToAdd = tracks[parseInt(playlistBtn.dataset.index)];
                
                const select = document.getElementById('playlist-select');
                select.innerHTML = '<option value="">Выберите плейлист...</option>';
                
                const playlists = getPlaylists();
                Object.keys(playlists).forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    select.appendChild(option);
                });
                
                new bootstrap.Modal(document.getElementById('addToPlaylistModal')).show();
            });
        }

        const deleteBtn = col.querySelector('.delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const filename = deleteBtn.dataset.filename;
                if (confirm('Удалить трек?')) {
                    fetch('/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({filename})
                    }).then(() => {
                        loadLibrary();
                        showToast('Трек удалён', 'info');
                    }).catch(() => {
                        showToast('Ошибка удаления трека', 'danger');
                    });
                }
            });
        }

        trackGrid.appendChild(col);
    });
}

// Функция для получения текста песни
async function getLyrics(title, artist, videoId = '') {
    try {
        document.getElementById('lyrics-text').textContent = '🔍 Ищем текст песни...';
        new bootstrap.Modal(document.getElementById('lyricsModal')).show();
        
        let url = `/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        if (videoId) {
            url += `&videoId=${videoId}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.lyrics) {
            document.getElementById('lyrics-text').textContent = data.lyrics;
            
            // Добавляем информацию об источнике
            const sourceInfo = data.source ? `\n\n[Источник: ${data.source}${data.cached ? ', из кэша' : ''}]` : '';
            document.getElementById('lyrics-text').textContent += sourceInfo;
        } else {
            document.getElementById('lyrics-text').textContent = 'Текст песни не найден.';
        }
    } catch (error) {
        console.error('Ошибка получения текста:', error);
        document.getElementById('lyrics-text').textContent = 'Ошибка при поиске текста. Проверьте интернет соединение.';
    }
}

// ==================== ГЛАВНАЯ СТРАНИЦА ====================

async function loadHome() {
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('page-title').textContent = 'Главная';
    currentPlaylist = null;
    
    // Добавляем класс для стилей главной страницы
    document.body.classList.add('home-page');
    
    // Полностью сбрасываем сетку для главной страницы
    trackGrid.innerHTML = '';
    trackGrid.style.display = 'grid';
    trackGrid.style.gridTemplateColumns = 'repeat(6, 1fr)';
    trackGrid.className = '';
    trackGrid.id = 'track-grid';
    
    // Показываем загрузку
    trackGrid.innerHTML = `
        <div class="loading-container" style="grid-column: 1 / -1;">
            <div class="spinner-border text-success" role="status"></div>
            <p class="mt-3">Загружаем рекомендации...</p>
        </div>
    `;
    
    try {
        // Загружаем данные
        const response = await fetch('/yt_home_data');
        ytHomeData = await response.json();
        
        let html = '';
        
        // Секция "Популярные плейлисты"
        if (ytHomeData.featured_playlists && ytHomeData.featured_playlists.length > 0) {
            html += `
                <div class="section-header" style="grid-column: 1 / -1;">
                    <h4>Популярные плейлисты</h4>
                    <div class="section-subtitle">Топ-подборки для прослушивания</div>
                </div>
            `;
            
            ytHomeData.featured_playlists.slice(0, 6).forEach((playlist, i) => {
                const thumbnail = playlist.thumbnail || placeholder;
                html += `
                    <div class="home-card-item" style="--item-index: ${i}">
                        <div class="card playlist-card" data-playlist-id="${playlist.id}">
                            <div class="card-img-container">
                                <img src="${thumbnail}" class="card-img-top" alt="${playlist.title}">
                                <div class="play-overlay">
                                    <button class="btn btn-success play-overlay-btn playlist-play-btn" 
                                            data-playlist-id="${playlist.id}"
                                            data-playlist-title="${playlist.title}">
                                        <i class="bi bi-play-fill"></i>
                                    </button>
                                </div>
                                <div class="card-badge">ПЛЕЙЛИСТ</div>
                            </div>
                            <div class="card-body">
                                <h5 class="card-title text-truncate-2">${playlist.title}</h5>
                                <p class="card-text">${playlist.subtitle || 'Популярная подборка'}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Секция "Топ-чарты"
        if (ytHomeData.top_charts && ytHomeData.top_charts.length > 0) {
            html += `
                <div class="section-header" style="grid-column: 1 / -1;">
                    <h4>Топ-чарты</h4>
                    <div class="section-subtitle">Самые популярные треки</div>
                </div>
            `;
            
            // Сохраняем треки чартов для воспроизведения
            homeCharts = ytHomeData.top_charts.filter(item => item.type === 'track');
            
            ytHomeData.top_charts.slice(0, 6).forEach((item, i) => {
                const thumbnail = item.thumbnail || placeholder;
                const isPlaylist = item.type === 'playlist';
                
                if (isPlaylist) {
                    html += `
                        <div class="home-card-item" style="--item-index: ${i}">
                            <div class="card chart-card" data-playlist-id="${item.id}">
                                <div class="card-img-container">
                                    <img src="${thumbnail}" class="card-img-top" alt="${item.title}">
                                    <div class="play-overlay">
                                        <button class="btn btn-success play-overlay-btn playlist-play-btn" 
                                                data-playlist-id="${item.id}"
                                                data-playlist-title="${item.title}">
                                            <i class="bi bi-play-fill"></i>
                                        </button>
                                    </div>
                                    <div class="chart-badge">ЧАРТЫ</div>
                                </div>
                                <div class="card-body">
                                    <h5 class="card-title text-truncate-2">${item.title}</h5>
                                    <p class="card-text">${item.subtitle || 'Официальные чарты'}</p>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="home-card-item" style="--item-index: ${i}">
                            <div class="card track-card">
                                <div class="card-img-container">
                                    <img src="${thumbnail}" class="card-img-top" alt="${item.title}">
                                    <div class="play-overlay">
                                        <button class="btn btn-success play-overlay-btn chart-track-play-btn" 
                                                data-videoid="${item.id}"
                                                data-title="${item.title}"
                                                data-artist="${item.artist}">
                                            <i class="bi bi-play-fill"></i>
                                        </button>
                                    </div>
                                    ${item.position ? `<div class="position-badge">#${item.position}</div>` : ''}
                                </div>
                                <div class="card-body">
                                    <h5 class="card-title text-truncate-2">${item.title}</h5>
                                    <p class="card-text">${item.artist || 'Исполнитель'}</p>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
        }
        
        // Секция "Новые релизы"
        if (ytHomeData.new_releases && ytHomeData.new_releases.length > 0) {
            html += `
                <div class="section-header" style="grid-column: 1 / -1;">
                    <h4>Новые релизы</h4>
                    <div class="section-subtitle">Свежие треки</div>
                </div>
            `;
            
            // Сохраняем релизы для воспроизведения
            homeReleases = ytHomeData.new_releases;
            
            ytHomeData.new_releases.slice(0, 6).forEach((track, i) => {
                const thumbnail = track.thumbnail || placeholder;
                html += `
                    <div class="home-card-item" style="--item-index: ${i}">
                        <div class="card release-card">
                            <div class="card-img-container">
                                <img src="${thumbnail}" class="card-img-top" alt="${track.title}">
                                <div class="play-overlay">
                                    <button class="btn btn-success play-overlay-btn release-track-play-btn" 
                                            data-videoid="${track.id}"
                                            data-title="${track.title}"
                                            data-artist="${track.artist}"
                                            data-duration="${track.duration}"
                                            data-thumbnail="${thumbnail}">
                                        <i class="bi bi-play-fill"></i>
                                    </button>
                                </div>
                                <div class="new-badge">НОВИНКА</div>
                            </div>
                            <div class="card-body">
                                <h5 class="card-title text-truncate-2">${track.title}</h5>
                                <p class="card-text">${track.artist}</p>
                                <p class="text-secondary small">${formatTime(track.duration)}</p>
                                <button class="btn btn-sm btn-outline-success add-track-btn release-add-btn w-100 mt-2" data-videoid="${track.id}">
                                    <i class="bi bi-plus"></i> Добавить в библиотеку
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Секция "По настроению"
        if (ytHomeData.mood_playlists && ytHomeData.mood_playlists.length > 0) {
            html += `
                <div class="section-header" style="grid-column: 1 / -1;">
                    <h4>По настроению</h4>
                    <div class="section-subtitle">Музыка для любого настроения</div>
                </div>
            `;
            
            const moodColors = ['success', 'primary', 'purple', 'warning', 'info', 'danger'];
            
            ytHomeData.mood_playlists.slice(0, 6).forEach((playlist, i) => {
                const colorClass = moodColors[i % moodColors.length];
                const icon = playlist.icon || 'music-note-beamed';
                
                html += `
                    <div class="home-card-item" style="--item-index: ${i}">
                        <div class="card mood-card ${colorClass}" data-playlist-id="${playlist.id}">
                            <div class="card-body text-center">
                                <i class="bi bi-${icon} fs-1 text-${colorClass} mb-3"></i>
                                <h5 class="card-title text-white mb-2">${playlist.title}</h5>
                                <p class="text-secondary small">${playlist.subtitle}</p>
                                <button class="btn btn-sm btn-outline-light mt-3 mood-playlist-btn" 
                                        data-playlist-id="${playlist.id}"
                                        data-playlist-title="${playlist.title}">
                                    Слушать
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Секция "В тренде"
        if (ytHomeData.trending && ytHomeData.trending.length > 0) {
            html += `
                <div class="section-header" style="grid-column: 1 / -1;">
                    <h4>В тренде</h4>
                    <div class="section-subtitle">Набирают популярность</div>
                </div>
            `;
            
            // Сохраняем тренды для воспроизведения
            homeTrending = ytHomeData.trending;
            
            ytHomeData.trending.slice(0, 6).forEach((track, i) => {
                const thumbnail = track.thumbnail || placeholder;
                html += `
                    <div class="home-card-item" style="--item-index: ${i}">
                        <div class="card trending-card">
                            <div class="card-img-container">
                                <img src="${thumbnail}" class="card-img-top" alt="${track.title}">
                                <div class="play-overlay">
                                    <button class="btn btn-success play-overlay-btn trending-track-play-btn" 
                                            data-videoid="${track.id}"
                                            data-title="${track.title}"
                                            data-artist="${track.artist}"
                                            data-duration="0"
                                            data-thumbnail="${thumbnail}">
                                        <i class="bi bi-play-fill"></i>
                                    </button>
                                </div>
                                <div class="trending-badge">🔥 ТРЕНД</div>
                            </div>
                            <div class="card-body">
                                <h5 class="card-title text-truncate-2">${track.title}</h5>
                                <p class="card-text">${track.artist}</p>
                                <button class="btn btn-sm btn-outline-success add-track-btn trending-add-btn w-100 mt-2" data-videoid="${track.id}">
                                    <i class="bi bi-plus"></i> Добавить
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Если нет данных
        if (!html) {
            html = `
                <div class="section-header" style="grid-column: 1 / -1;">
                    <h4>Нет рекомендаций</h4>
                    <div class="section-subtitle">Не удалось загрузить данные</div>
                </div>
                <div class="home-card-item empty-state" style="grid-column: 1 / -1;">
                    <div class="card text-center p-5">
                        <i class="bi bi-music-note-beamed fs-1 text-secondary mb-3"></i>
                        <p class="text-secondary">Попробуйте обновить страницу</p>
                        <button class="btn btn-success mt-3" onclick="loadHome()">
                            <i class="bi bi-arrow-clockwise me-2"></i>Обновить
                        </button>
                    </div>
                </div>
            `;
        }
        
        trackGrid.innerHTML = html;
        
        // Добавляем локальные треки
        try {
            const localResponse = await fetch('/tracks');
            const localTracks = await localResponse.json();
            
            if (localTracks.length > 0) {
                const recentTracks = localTracks.slice(-6).reverse();
                
                let localHtml = `
                    <div class="section-header" style="grid-column: 1 / -1;">
                        <h4>Ваша библиотека</h4>
                        <div class="section-subtitle">Недавно добавленные треки</div>
                    </div>
                `;
                
                recentTracks.forEach((track, i) => {
                    const cover = track.cover || placeholder;
                    localHtml += `
                        <div class="home-card-item" style="--item-index: ${i}">
                            <div class="card local-library-card">
                                <div class="card-img-container">
                                    <img src="${cover}" class="card-img-top" alt="${track.title}">
                                    <div class="play-overlay">
                                        <button class="btn btn-success play-overlay-btn local-track-play-btn" 
                                                data-filename="${track.filename}"
                                                data-title="${track.title}"
                                                data-artist="${track.artist}">
                                            <i class="bi bi-play-fill"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <h5 class="card-title text-truncate-2">${track.title}</h5>
                                    <p class="card-text">${track.artist}</p>
                                    <button class="btn btn-sm btn-outline-light w-100 mt-2 local-playlist-btn" 
                                            data-index="${localTracks.length - 1 - i}">
                                        <i class="bi bi-plus-circle"></i> В плейлист
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                // Добавляем локальные треки в конец
                trackGrid.innerHTML += localHtml;
            }
        } catch (localErr) {
            console.log('Ошибка загрузки локальных треков:', localErr);
        }
        
        // Настраиваем обработчики событий ДЛЯ ВСЕХ КАРТОЧЕК
        setupHomeEventListeners();
        
    } catch (error) {
        console.error('Ошибка загрузки главной:', error);
        trackGrid.innerHTML = `
            <div class="section-header" style="grid-column: 1 / -1;">
                <h4>Ошибка загрузки</h4>
                <div class="section-subtitle">Проверьте подключение к интернету</div>
            </div>
            <div class="home-card-item empty-state" style="grid-column: 1 / -1;">
                <div class="card text-center p-5">
                    <i class="bi bi-exclamation-triangle-fill fs-1 text-danger mb-3"></i>
                    <p class="text-secondary">Не удалось загрузить рекомендации</p>
                    <button class="btn btn-outline-light mt-3" onclick="loadHome()">
                        <i class="bi bi-arrow-clockwise me-2"></i>Попробовать снова
                    </button>
                </div>
            </div>
        `;
    }
}

// Функции для обработки кликов на главной странице
function playYtTrackFromHome(videoId, title, artist, duration = 0, thumbnail = '') {
    const tempTrack = {
        videoId: videoId,
        title: title,
        artist: artist,
        duration: parseInt(duration) || 0,
        thumbnail: thumbnail || placeholder
    };
    
    tracks = [tempTrack];
    currentIndex = 0;
    playYtTrack(0);
}

async function addTrackFromYoutubeButton(button, videoId) {
    const originalHtml = button.innerHTML;
    const originalClass = button.className;
    
    try {
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Добавление...';
        button.disabled = true;
        
        const response = await fetch('/add_from_yt', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({videoId})
        });
        
        if (response.ok) {
            button.innerHTML = '<i class="bi bi-check me-2"></i>Добавлено';
            button.classList.remove('btn-outline-success');
            button.classList.add('btn-success');
            
            setTimeout(() => {
                button.innerHTML = originalHtml;
                button.className = originalClass;
                button.disabled = false;
            }, 2000);
            
            showToast('Трек добавлен в вашу библиотеку!', 'success');
        } else {
            button.innerHTML = originalHtml;
            button.disabled = false;
            showToast('Ошибка добавления трека', 'danger');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        button.innerHTML = originalHtml;
        button.disabled = false;
        showToast('Ошибка добавления трека', 'danger');
    }
}

// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ НАСТРОЙКИ ОБРАБОТЧИКОВ
function setupHomeEventListeners() {
    // Удаляем старые обработчики если они есть
    if (trackGrid._clickHandler) {
        trackGrid.removeEventListener('click', trackGrid._clickHandler);
    }
    
    // Создаем новый обработчик
    const clickHandler = function(e) {
        // Предотвращаем множественные срабатывания
        if (e._processed) return;
        e._processed = true;
        
        // Обработка кнопок воспроизведения плейлистов
        const playlistPlayBtn = e.target.closest('.playlist-play-btn');
        if (playlistPlayBtn) {
            e.stopPropagation();
            e.preventDefault();
            const playlistId = playlistPlayBtn.dataset.playlistId;
            const playlistTitle = playlistPlayBtn.dataset.playlistTitle || 'Плейлист';
            loadYouTubePlaylist(playlistId, playlistTitle);
            return;
        }
        
        // Обработка кнопок воспроизведения треков из чартов
        const chartTrackBtn = e.target.closest('.chart-track-play-btn');
        if (chartTrackBtn) {
            e.stopPropagation();
            e.preventDefault();
            const videoId = chartTrackBtn.dataset.videoid;
            const title = chartTrackBtn.dataset.title;
            const artist = chartTrackBtn.dataset.artist;
            playYtTrackFromHome(videoId, title, artist);
            return;
        }
        
        // Обработка кнопок воспроизведения новых релизов
        const releaseTrackBtn = e.target.closest('.release-track-play-btn');
        if (releaseTrackBtn) {
            e.stopPropagation();
            e.preventDefault();
            const videoId = releaseTrackBtn.dataset.videoid;
            const title = releaseTrackBtn.dataset.title;
            const artist = releaseTrackBtn.dataset.artist;
            const duration = releaseTrackBtn.dataset.duration;
            const thumbnail = releaseTrackBtn.dataset.thumbnail;
            playYtTrackFromHome(videoId, title, artist, duration, thumbnail);
            return;
        }
        
        // Обработка кнопок воспроизведения трендов
        const trendingTrackBtn = e.target.closest('.trending-track-play-btn');
        if (trendingTrackBtn) {
            e.stopPropagation();
            e.preventDefault();
            const videoId = trendingTrackBtn.dataset.videoid;
            const title = trendingTrackBtn.dataset.title;
            const artist = trendingTrackBtn.dataset.artist;
            playYtTrackFromHome(videoId, title, artist);
            return;
        }
        
        // Обработка кнопок воспроизведения локальных треков
        const localTrackBtn = e.target.closest('.local-track-play-btn');
        if (localTrackBtn) {
            e.stopPropagation();
            e.preventDefault();
            const filename = localTrackBtn.dataset.filename;
            fetch('/tracks')
                .then(r => r.json())
                .then(allTracks => {
                    const index = allTracks.findIndex(t => t.filename === filename);
                    if (index !== -1) {
                        tracks = allTracks;
                        playLocalTrack(index);
                    }
                });
            return;
        }
        
        // Обработка кнопок добавления трека
        const addButton = e.target.closest('.add-track-btn');
        if (addButton) {
            e.stopPropagation();
            e.preventDefault();
            const videoId = addButton.dataset.videoid;
            addTrackFromYoutubeButton(addButton, videoId);
            return;
        }
        
        // Обработка кнопок плейлистов настроения
        const moodButton = e.target.closest('.mood-playlist-btn');
        if (moodButton) {
            e.stopPropagation();
            e.preventDefault();
            const playlistId = moodButton.dataset.playlistId;
            const playlistTitle = moodButton.dataset.playlistTitle || 'Плейлист';
            loadYouTubePlaylist(playlistId, playlistTitle);
            return;
        }
        
        // Обработка кнопок добавления локальных треков в плейлист
        const localPlaylistButton = e.target.closest('.local-playlist-btn');
        if (localPlaylistButton) {
            e.stopPropagation();
            e.preventDefault();
            const index = parseInt(localPlaylistButton.dataset.index);
            fetch('/tracks')
                .then(r => r.json())
                .then(allTracks => {
                    if (index >= 0 && index < allTracks.length) {
                        trackToAdd = allTracks[index];
                        const select = document.getElementById('playlist-select');
                        select.innerHTML = '<option value="">Выберите плейлист...</option>';
                        const playlists = getPlaylists();
                        Object.keys(playlists).forEach(name => {
                            const option = document.createElement('option');
                            option.value = name;
                            option.textContent = name;
                            select.appendChild(option);
                        });
                        new bootstrap.Modal(document.getElementById('addToPlaylistModal')).show();
                    }
                });
            return;
        }
        
        // Обработка кликов по карточкам плейлистов (для загрузки плейлистов)
        const playlistCard = e.target.closest('.playlist-card, .chart-card');
        if (playlistCard && !e.target.closest('.play-overlay-btn') && !e.target.closest('.add-track-btn')) {
            e.stopPropagation();
            e.preventDefault();
            const playlistId = playlistCard.dataset.playlistId;
            const playlistTitle = playlistCard.querySelector('.card-title')?.textContent || 'Плейлист';
            if (playlistId) {
                loadYouTubePlaylist(playlistId, playlistTitle);
            }
            return;
        }
        
        // Обработка кликов по карточкам настроения
        const moodCard = e.target.closest('.mood-card');
        if (moodCard && !e.target.closest('.play-overlay-btn') && !e.target.closest('.add-track-btn') && 
            !e.target.closest('.mood-playlist-btn')) {
            e.stopPropagation();
            e.preventDefault();
            const playlistId = moodCard.dataset.playlistId;
            const playlistTitle = moodCard.querySelector('.card-title')?.textContent || 'Плейлист';
            if (playlistId) {
                loadYouTubePlaylist(playlistId, playlistTitle);
            }
            return;
        }
        
        // Обработка кликов по карточкам треков (новые релизы, тренды, чарты-треки, локальные треки)
        const trackCard = e.target.closest('.track-card, .release-card, .trending-card, .local-library-card');
        if (trackCard && !e.target.closest('.play-overlay-btn') && !e.target.closest('.add-track-btn') && 
            !e.target.closest('.local-playlist-btn')) {
            e.stopPropagation();
            e.preventDefault();
            
            // Для локальных треков
            if (trackCard.classList.contains('local-library-card')) {
                const playBtn = trackCard.querySelector('.local-track-play-btn');
                if (playBtn) {
                    const filename = playBtn.dataset.filename;
                    fetch('/tracks')
                        .then(r => r.json())
                        .then(allTracks => {
                            const index = allTracks.findIndex(t => t.filename === filename);
                            if (index !== -1) {
                                tracks = allTracks;
                                playLocalTrack(index);
                            }
                        });
                }
                return;
            }
            
            // Для YouTube треков
            const playBtn = trackCard.querySelector('.play-overlay-btn');
            if (playBtn) {
                if (playBtn.classList.contains('chart-track-play-btn')) {
                    const videoId = playBtn.dataset.videoid;
                    const title = playBtn.dataset.title;
                    const artist = playBtn.dataset.artist;
                    playYtTrackFromHome(videoId, title, artist);
                } else if (playBtn.classList.contains('release-track-play-btn')) {
                    const videoId = playBtn.dataset.videoid;
                    const title = playBtn.dataset.title;
                    const artist = playBtn.dataset.artist;
                    const duration = playBtn.dataset.duration;
                    const thumbnail = playBtn.dataset.thumbnail;
                    playYtTrackFromHome(videoId, title, artist, duration, thumbnail);
                } else if (playBtn.classList.contains('trending-track-play-btn')) {
                    const videoId = playBtn.dataset.videoid;
                    const title = playBtn.dataset.title;
                    const artist = playBtn.dataset.artist;
                    playYtTrackFromHome(videoId, title, artist);
                }
            }
            return;
        }
        
        // Сбрасываем флаг через небольшой таймаут
        setTimeout(() => {
            e._processed = false;
        }, 100);
    };
    
    // Сохраняем ссылку на обработчик и добавляем его
    trackGrid._clickHandler = clickHandler;
    trackGrid.addEventListener('click', clickHandler);
}

async function loadYouTubePlaylist(playlistId, playlistTitle = 'Плейлист') {
    try {
        document.getElementById('page-title').textContent = 'Загрузка...';
        currentPlaylist = playlistTitle;
        
        // Убираем стили главной страницы
        document.body.classList.remove('home-page');
        
        // Полностью сбрасываем сетку
        trackGrid.innerHTML = '';
        trackGrid.style.display = '';
        trackGrid.style.gridTemplateColumns = '';
        trackGrid.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 row-cols-xl-6 g-4';
        
        trackGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="spinner-border text-success" role="status"></div>
                <p class="mt-2">Загружаем плейлист "${playlistTitle}"...</p>
            </div>
        `;
        
        const response = await fetch(`/yt_playlist/${playlistId}`);
        const data = await response.json();
        
        if (data.success && data.tracks && data.tracks.length > 0) {
            document.getElementById('page-title').textContent = data.title || playlistTitle;
            
            // Обновляем треки и рендерим
            tracks = data.tracks.map(track => ({
                videoId: track.videoId,
                title: track.title,
                artist: track.artist,
                duration: track.duration,
                thumbnail: track.thumbnail
            }));
            
            renderTracks(tracks, true);
            
            // Добавляем информацию о плейлисте
            const playlistInfo = document.createElement('div');
            playlistInfo.className = 'col-12 mb-4';
            playlistInfo.innerHTML = `
                <div class="card bg-dark border-secondary">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-auto">
                                <img src="${data.thumbnail || placeholder}" 
                                     class="rounded" 
                                     style="width: 100px; height: 100px; object-fit: cover;">
                            </div>
                            <div class="col">
                                <h4 class="text-white">${data.title}</h4>
                                <p class="text-secondary mb-1">${data.author || 'Aurora'}</p>
                                <p class="text-secondary small">${data.trackCount} треков • ${data.duration || ''}</p>
                                <p class="text-secondary">${data.description || ''}</p>
                            </div>
                            <div class="col-auto">
                                <button class="btn btn-success" onclick="playAllPlaylistTracks()">
                                    <i class="bi bi-play-fill me-2"></i>Слушать всё
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            trackGrid.insertBefore(playlistInfo, trackGrid.firstChild);
            
        } else {
            throw new Error(data.error || 'Не удалось загрузить плейлист');
        }
    } catch (error) {
        console.error('Ошибка загрузки плейлиста:', error);
        trackGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="alert alert-danger">
                    Ошибка загрузки плейлиста: ${error.message}
                </div>
                <button class="btn btn-outline-light mt-3" onclick="loadHome()">
                    <i class="bi bi-arrow-left me-2"></i>Вернуться на главную
                </button>
            </div>
        `;
    }
}

function playAllPlaylistTracks() {
    if (tracks.length > 0) {
        currentIndex = 0;
        playYtTrack(0);
    }
}

// ==================== НАВИГАЦИЯ ====================

function loadLibrary() {
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('page-title').textContent = 'Ваша библиотека';
    currentPlaylist = null;
    
    // Полностью очищаем и сбрасываем сетку
    trackGrid.innerHTML = '';
    
    // Убираем стили главной страницы
    document.body.classList.remove('home-page');
    
    // Убираем все грид-стили и применяем классы Bootstrap
    trackGrid.style.display = '';
    trackGrid.style.gridTemplateColumns = '';
    trackGrid.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 row-cols-xl-6 g-4';
    
    trackGrid.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-success" role="status"></div>
            <p class="mt-2">Загружаем библиотеку...</p>
        </div>
    `;
    
    fetch('/tracks')
        .then(r => r.json())
        .then(d => {
            if (d.length === 0) {
                trackGrid.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <i class="bi bi-music-note-beamed fs-1 text-secondary"></i>
                        <p class="text-secondary mt-3">Ваша библиотека пуста</p>
                        <button class="btn btn-success mt-3" data-bs-toggle="modal" data-bs-target="#uploadModal">
                            <i class="bi bi-upload me-2"></i>Загрузить первые треки
                        </button>
                    </div>
                `;
            } else {
                renderTracks(d, false);
            }
        })
        .catch(err => {
            console.error('Ошибка загрузки библиотеки:', err);
            trackGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-exclamation-triangle-fill fs-1 text-danger"></i>
                    <p class="text-secondary mt-3">Ошибка загрузки библиотеки</p>
                </div>
            `;
        });
}

document.getElementById('home-link').addEventListener('click', (e) => {
    e.preventDefault();
    loadHome();
});

document.getElementById('library-link').addEventListener('click', (e) => {
    e.preventDefault();
    loadLibrary();
});

document.getElementById('search-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('search-bar').style.display = 'flex';
    document.getElementById('page-title').textContent = 'Поиск';
    currentPlaylist = null;
    
    // Полностью очищаем и сбрасываем сетку
    trackGrid.innerHTML = '';
    
    // Убираем стили главной страницы
    document.body.classList.remove('home-page');
    
    // Убираем все грид-стили и применяем классы Bootstrap
    trackGrid.style.display = '';
    trackGrid.style.gridTemplateColumns = '';
    trackGrid.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 row-cols-xl-6 g-4';
    
    // Очищаем результаты поиска
    document.getElementById('search-input').value = '';
    
    // Показываем сообщение о вводе запроса
    trackGrid.innerHTML = `
        <div class="col-12 text-center py-5">
            <i class="bi bi-search fs-1 text-secondary"></i>
            <p class="text-secondary mt-3">Введите запрос для поиска треков</p>
        </div>
    `;
    
    document.getElementById('search-input').focus();
});

document.getElementById('search-btn').addEventListener('click', () => {
    const query = document.getElementById('search-input').value.trim();
    if (query) loadYt(query);
});

document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
});

// ==================== ПЛЕЙЕР ====================

function playLocalTrack(idx) {
    currentIndex = idx;
    const track = tracks[idx];
    
    audio.src = `/stream/${track.filename}`;
    audio.play().then(() => {
        updatePlayerUI(track);
        updateProgressFill();
        
        const downloadBtn = document.getElementById('download-current');
        if (downloadBtn) {
            downloadBtn.style.display = 'inline-block';
            downloadBtn.href = `/download/${track.filename}`;
        }
        
        // Обновляем кнопку плей
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
            playBtn.classList.add('playing');
            playBtn.classList.remove('paused');
        }
        
        showToast(`Сейчас играет: ${track.title}`, 'info');
    }).catch(error => {
        console.error('Ошибка воспроизведения:', error);
        showToast('Ошибка воспроизведения трека', 'danger');
    });
}

function playYtTrack(idx) {
    currentIndex = idx;
    const track = tracks[idx];
    
    // Используем videoId или id
    const videoId = track.videoId || track.id;
    if (!videoId) {
        showToast('Ошибка: у трека нет идентификатора', 'danger');
        return;
    }
    
    audio.src = `/yt_stream/${videoId}`;
    audio.play().then(() => {
        updatePlayerUI({
            title: track.title,
            artist: track.artist,
            cover: track.thumbnail || placeholder,
            duration: track.duration
        });
        
        const downloadBtn = document.getElementById('download-current');
        if (downloadBtn) {
            downloadBtn.style.display = 'none';
        }
        
        updateProgressFill();
        
        // Обновляем кнопку плей
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
            playBtn.classList.add('playing');
            playBtn.classList.remove('paused');
        }
        
        showToast(`Сейчас играет: ${track.title}`, 'info');
    }).catch(error => {
        console.error('Ошибка воспроизведения:', error);
        showToast('Ошибка воспроизведения трека с YouTube', 'danger');
    });
}

function updatePlayerUI(track) {
    const titleElement = document.getElementById('current-title');
    const artistElement = document.getElementById('current-artist');
    const coverElement = document.getElementById('current-cover');
    const durationElement = document.getElementById('duration');
    
    if (titleElement) titleElement.textContent = track.title || 'Неизвестно';
    if (artistElement) artistElement.textContent = track.artist || '';
    if (coverElement) coverElement.src = track.cover || track.thumbnail || placeholder;
    if (durationElement) durationElement.textContent = formatTime(track.duration);
    
    // Обновляем цвет кнопки плей
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        const accentColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-color').trim();
        playBtn.style.backgroundColor = accentColor;
    }
}

if (audio) {
    audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
            progress.value = (audio.currentTime / audio.duration) * 100;
            const currentTimeElement = document.getElementById('current-time');
            if (currentTimeElement) currentTimeElement.textContent = formatTime(audio.currentTime);
            updateProgressFill();
        }
    });
}

if (progress) {
    progress.addEventListener('input', () => {
        if (audio && audio.duration) {
            audio.currentTime = (progress.value / 100) * audio.duration;
            updateProgressFill();
        }
    });
}

if (volume) {
    volume.addEventListener('input', (e) => {
        audio.volume = e.target.value;
        updateVolumeFill();
        const icon = document.getElementById('volume-btn');
        if (icon) {
            if (audio.volume === 0) icon.innerHTML = '<i class="bi bi-volume-mute-fill fs-4"></i>';
            else if (audio.volume < 0.5) icon.innerHTML = '<i class="bi bi-volume-down-fill fs-4"></i>';
            else icon.innerHTML = '<i class="bi bi-volume-up-fill fs-4"></i>';
        }
    });
}

if (audio) {
    audio.addEventListener('volumechange', updateVolumeFill);
}

const playBtn = document.getElementById('play-btn');
if (playBtn) {
    playBtn.addEventListener('click', () => {
        if (audio && audio.src) {
            if (audio.paused) {
                audio.play().then(() => {
                    playBtn.innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
                    playBtn.classList.add('playing');
                    playBtn.classList.remove('paused');
                }).catch(error => {
                    console.error('Ошибка воспроизведения:', error);
                });
            } else {
                audio.pause();
                playBtn.innerHTML = '<i class="bi bi-play-fill fs-2"></i>';
                playBtn.classList.add('paused');
                playBtn.classList.remove('playing');
            }
        }
    });
}

if (audio) {
    audio.addEventListener('play', () => {
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
            playBtn.classList.add('playing');
            playBtn.classList.remove('paused');
        }
    });

    audio.addEventListener('pause', () => {
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.innerHTML = '<i class="bi bi-play-fill fs-2"></i>';
            playBtn.classList.add('paused');
            playBtn.classList.remove('playing');
        }
    });
}

const nextBtn = document.getElementById('next-btn');
if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        if (tracks.length === 0) return;
        let next = currentIndex + 1;
        if (shuffle) next = Math.floor(Math.random() * tracks.length);
        if (next >= tracks.length) next = 0;
        if (tracks[next]) {
            isYtSearch ? playYtTrack(next) : playLocalTrack(next);
        }
    });
}

const prevBtn = document.getElementById('prev-btn');
if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        if (tracks.length === 0) return;
        let prev = currentIndex - 1;
        if (prev < 0) prev = tracks.length - 1;
        if (tracks[prev]) {
            isYtSearch ? playYtTrack(prev) : playLocalTrack(prev);
        }
    });
}

const shuffleBtn = document.getElementById('shuffle-btn');
if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        shuffle = !shuffle;
        shuffleBtn.classList.toggle('text-success', shuffle);
        showToast(shuffle ? 'Перемешивание включено' : 'Перемешивание выключено', 'info');
    });
}

const repeatBtn = document.getElementById('repeat-btn');
if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
        repeat = !repeat;
        repeatBtn.classList.toggle('text-success', repeat);
        showToast(repeat ? 'Повтор включен' : 'Повтор выключен', 'info');
    });
}

if (audio) {
    audio.addEventListener('ended', () => {
        if (repeat) {
            audio.currentTime = 0;
            audio.play();
        } else {
            const nextBtn = document.getElementById('next-btn');
            if (nextBtn) nextBtn.click();
        }
    });
}

// ==================== ПОИСК ====================

function loadYt(q) {
    // Полностью очищаем и сбрасываем сетку
    trackGrid.innerHTML = '';
    
    // Убираем стили главной страницы
    document.body.classList.remove('home-page');
    
    // Убираем все грид-стили и применяем классы Bootstrap
    trackGrid.style.display = '';
    trackGrid.style.gridTemplateColumns = '';
    trackGrid.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 row-cols-xl-6 g-4';
    
    // Показываем загрузку
    trackGrid.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-success" role="status"></div>
            <p class="mt-3">Ищем "${q}"...</p>
        </div>
    `;
    
    fetch(`/yt_search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => renderTracks(d, true))
        .catch(err => {
            console.error('Ошибка поиска:', err);
            trackGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-exclamation-triangle-fill fs-1 text-danger"></i>
                    <p class="text-secondary mt-3">Ошибка поиска. Проверьте подключение к интернету</p>
                </div>
            `;
        });
}

const uploadSubmit = document.getElementById('upload-submit');
if (uploadSubmit) {
    uploadSubmit.addEventListener('click', () => {
        const formData = new FormData(document.getElementById('upload-form'));
        fetch('/upload', { method: 'POST', body: formData })
            .then(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
                if (modal) modal.hide();
                loadLibrary();
                showToast('Треки успешно загружены!', 'success');
            })
            .catch(err => {
                console.error('Ошибка загрузки:', err);
                showToast('Ошибка загрузки треков', 'danger');
            });
    });
}

// ==================== ОБРАБОТЧИКИ ПЛЕЙЛИСТОВ ====================

const createPlaylistBtn = document.getElementById('create-playlist-btn');
if (createPlaylistBtn) {
    createPlaylistBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('new-playlist-name');
        if (nameInput) {
            const name = nameInput.value.trim();
            if (name && createPlaylist(name)) {
                const modal = bootstrap.Modal.getInstance(document.getElementById('createPlaylistModal'));
                if (modal) modal.hide();
                nameInput.value = '';
                showPlaylist(name);
                showToast(`Плейлист "${name}" создан`, 'success');
            }
        }
    });
}

const savePlaylistBtn = document.getElementById('save-playlist-btn');
if (savePlaylistBtn) {
    savePlaylistBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('edit-playlist-name');
        if (!nameInput) return;
        
        const newName = nameInput.value.trim();
        const oldName = currentPlaylistName;
        
        if (!newName) {
            showToast('Введите название плейлиста!', 'warning');
            return;
        }
        
        const playlists = getPlaylists();
        
        if (newName !== oldName) {
            if (playlists[newName]) {
                showToast('Плейлист с таким именем уже существует!', 'danger');
                return;
            }
            
            playlists[newName] = playlists[oldName];
            delete playlists[oldName];
            savePlaylists(playlists);
            currentPlaylistName = newName;
            currentPlaylist = newName;
            loadPlaylists();
            showToast(`Плейлист переименован в "${newName}"`, 'success');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('managePlaylistModal'));
        if (modal) modal.hide();
    });
}

const deletePlaylistBtn = document.getElementById('delete-playlist-btn');
if (deletePlaylistBtn) {
    deletePlaylistBtn.addEventListener('click', () => {
        if (currentPlaylistName && deletePlaylist(currentPlaylistName)) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('managePlaylistModal'));
            if (modal) modal.hide();
            showToast(`Плейлист "${currentPlaylistName}" удален`, 'info');
        }
    });
}

const addToPlaylistBtn = document.getElementById('add-to-playlist-btn');
if (addToPlaylistBtn) {
    addToPlaylistBtn.addEventListener('click', () => {
        const select = document.getElementById('playlist-select');
        if (!select) return;
        
        const playlistName = select.value;
        
        if (!playlistName) {
            showToast('Выберите плейлист!', 'warning');
            return;
        }
        
        if (trackToAdd && addTrackToPlaylist(playlistName, trackToAdd.filename)) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('addToPlaylistModal'));
            if (modal) modal.hide();
            showToast(`Трек добавлен в "${playlistName}"!`, 'success');
        }
    });
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function showToast(message, type = 'info') {
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

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

// При загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    loadHome();
    loadPlaylists();
    updateVolumeFill();
    updateProgressFill();
    
    if (progress) progress.value = 0;
    if (volume) volume.value = 1;
    
    initPlayerColors();
});

// Обновление данных главной страницы каждые 30 минут
setInterval(() => {
    if (document.getElementById('page-title').textContent === 'Главная') {
        fetch('/yt_home_data').then(r => r.json()).then(data => {
            ytHomeData = data;
        });
    }
}, 30 * 60 * 1000);

// Кнопка обновления кэша (если есть в настройках)
document.getElementById('refresh-home-cache')?.addEventListener('click', async function() {
    try {
        this.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Обновление...';
        this.disabled = true;
        
        const response = await fetch('/refresh_home_cache');
        if (response.ok) {
            showToast('Рекомендации обновлены!', 'success');
            loadHome();
        }
        
        setTimeout(() => {
            this.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Обновить рекомендации';
            this.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('Ошибка обновления кэша:', error);
        showToast('Ошибка обновления рекомендаций', 'danger');
        this.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Обновить рекомендации';
        this.disabled = false;
    }
});

// Сохранение данных при закрытии страницы
window.addEventListener('beforeunload', () => {
    const playlists = getPlaylists();
    savePlaylists(playlists);
});
