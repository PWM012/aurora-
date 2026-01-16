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

const placeholder = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMyODI4MjgiLz48Y2lyY2xlIGN4PSIxMDAiIGN5PSI5MCIgcj0iNDAiIGZpbGw9IiMxZGI5NTQiLz48cGF0aCBkPSJNODAgNjAgdjgwIiBzdHJva2U9IiMxZGI5NTQiIHN0cm9rZS13aWR0aD0iMjAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==';

// Инициализация цветов плеера
function initPlayerColors() {
    const settings = JSON.parse(localStorage.getItem('aurora_settings') || '{}');
    const colorScheme = settings.colorScheme || 'green';
    
    // Обновляем кнопку плей
    setTimeout(() => {
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            const accentColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--accent-color').trim();
            playBtn.style.backgroundColor = accentColor;
        }
        
        // Обновляем ползунки
        updateProgressFill();
        updateVolumeFill();
    }, 100);
}

// Загрузка настроек
function getSettings() {
    return JSON.parse(localStorage.getItem('aurora_settings') || '{}');
}

function formatTime(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgressFill() {
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim();
    progress.style.background = `linear-gradient(to right, ${accentColor} ${percent}%, #404040 ${percent}%)`;
}

function updateVolumeFill() {
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
            <a href="#" class="nav-link text-light rounded-pill px-3 py-2 d-flex justify-content-between align-items-center playlist-link" 
               data-name="${name}">
                <div class="d-flex align-items-center">
                    <i class="bi bi-music-note-list me-3"></i>
                    <span class="playlist-name">${name}</span>
                </div>
                <button class="btn btn-sm btn-outline-secondary rounded-circle p-1 edit-playlist-btn" 
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
    trackGrid.innerHTML = '';
    isYtSearch = yt;
    
    // Сортируем треки согласно настройкам
    const settings = getSettings();
    tracks = sortTracksBySetting(data, settings.sortTracks);
    
    // Ограничиваем количество треков согласно настройкам
    const tracksPerPage = settings.tracksPerPage || 30;
    const displayedTracks = tracks.slice(0, tracksPerPage);
    
    if (displayedTracks.length === 0) {
        trackGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-music-note-beamed fs-1 text-secondary"></i>
                <p class="text-secondary mt-3">${currentPlaylist ? 'Плейлист пуст' : 'Нет треков'}</p>
            </div>
        `;
        return;
    }
    
    displayedTracks.forEach((track, i) => {
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
                        <button class="action-btn lyrics" data-tooltip="Текст песни" data-title="${track.title}" data-artist="${track.artist}">
                            <i class="bi bi-chat-left-text"></i>
                        </button>
                        ${yt ? `<button class="action-btn add" data-tooltip="Добавить" data-videoid="${track.videoId}"><i class="bi bi-plus"></i></button>` : ''}
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
                yt ? playYtTrack(i) : playLocalTrack(i);
            });
        }

        const lyricsBtn = col.querySelector('.lyrics');
        if (lyricsBtn) {
            lyricsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const title = lyricsBtn.dataset.title;
                const artist = lyricsBtn.dataset.artist;
                getLyrics(title, artist);
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
                    alert('Трек добавлен!');
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
                    });
                }
            });
        }

        trackGrid.appendChild(col);
    });
}

// Функция для получения текста песни
async function getLyrics(title, artist) {
    try {
        document.getElementById('lyrics-text').textContent = 'Поиск текста...';
        new bootstrap.Modal(document.getElementById('lyricsModal')).show();
        
        // Сначала пробуем получить через API приложения
        const response = await fetch(`/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
        const data = await response.json();
        
        if (data.lyrics && data.lyrics !== 'Текст песни не найден.') {
            document.getElementById('lyrics-text').textContent = data.lyrics;
        } else {
            // Если не нашли, используем локальную базу текстов
            const localLyrics = await searchLocalLyrics(title, artist);
            document.getElementById('lyrics-text').textContent = localLyrics;
        }
    } catch (error) {
        console.error('Ошибка получения текста:', error);
        document.getElementById('lyrics-text').textContent = 'Не удалось загрузить текст песни.\n\nПопробуйте:\n1. Проверить интернет соединение\n2. Поискать текст вручную по названию: "' + title + '"';
    }
}


function sortTracksBySetting(tracks, setting) {
    switch(setting) {
        case 'title':
            return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
        case 'artist':
            return [...tracks].sort((a, b) => a.artist.localeCompare(b.artist));
        case 'duration':
            return [...tracks].sort((a, b) => (a.duration || 0) - (b.duration || 0));
        default:
            return tracks;
    }
}

// ==================== НАВИГАЦИЯ ====================

function loadHome() {
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('page-title').textContent = 'Главная';
    currentPlaylist = null;
    
    // Показываем загрузку
    trackGrid.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Загрузка рекомендаций...</p></div>';
    
    // Загружаем треки для рекомендаций
    fetch('/tracks')
        .then(r => r.json())
        .then(allTracks => {
            let html = `
                <div class="col-12">
                    <h4 class="text-white mb-4">Популярные плейлисты</h4>
                </div>
                <div class="col">
                    <div class="card h-100 bg-success bg-opacity-10 border-success playlist-card top-charts">
                        <div class="card-body d-flex flex-column justify-content-center align-items-center">
                            <i class="bi bi-fire fs-1 text-success mb-3"></i>
                            <h5 class="card-title text-white">Топ-чарты</h5>
                            <p class="text-secondary text-center">Самые популярные треки</p>
                        </div>
                    </div>
                </div>
                <div class="col">
                    <div class="card h-100 bg-primary bg-opacity-10 border-primary playlist-card new-releases">
                        <div class="card-body d-flex flex-column justify-content-center align-items-center">
                            <i class="bi bi-music-note-beamed fs-1 text-primary mb-3"></i>
                            <h5 class="card-title text-white">Новинки</h5>
                            <p class="text-secondary text-center">Свежие релизы</p>
                        </div>
                    </div>
                </div>
                <div class="col">
                    <div class="card h-100 bg-purple bg-opacity-10 border-purple playlist-card favorites">
                        <div class="card-body d-flex flex-column justify-content-center align-items-center">
                            <i class="bi bi-heart-fill fs-1 text-purple mb-3"></i>
                            <h5 class="card-title text-white">Любимые хиты</h5>
                            <p class="text-secondary text-center">Треки, которые слушают все</p>
                        </div>
                    </div>
                </div>
            `;
            
            if (allTracks.length > 0) {
                // Берем последние 6 треков как рекомендации
                const recentTracks = allTracks.slice(-6).reverse();
                tracks = recentTracks;
                
                html += `
                    <div class="col-12 mt-5">
                        <h4 class="text-white mb-4">Недавно добавленные</h4>
                    </div>
                `;
                
                recentTracks.forEach((track, i) => {
                    const cover = track.cover || placeholder;
                    html += `
                        <div class="col">
                            <div class="card h-100">
                                <div class="card-img-container position-relative">
                                    <img src="${cover}" class="card-img-top" alt="cover">
                                    <div class="play-overlay">
                                        <button class="btn btn-success rounded-circle shadow-lg play-overlay-btn" data-index="${i}">
                                            <i class="bi bi-play-fill fs-1"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <h5 class="card-title text-white text-truncate">${track.title}</h5>
                                    <p class="card-text text-secondary small text-truncate">${track.artist}</p>
                                </div>
                            </div>
                        </div>
                    `;
                });
            } else {
                html += `
                    <div class="col-12 mt-5">
                        <div class="alert alert-dark border-secondary">
                            <div class="d-flex align-items-center">
                                <i class="bi bi-info-circle me-3 text-secondary"></i>
                                <div>
                                    <div class="text-white">Здесь будут рекомендации</div>
                                    <div class="text-secondary small">Загрузите свои треки, чтобы они появились здесь</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                tracks = [];
            }
            
            trackGrid.innerHTML = html;
            
            // Обработчики для кнопок воспроизведения рекомендаций
            document.querySelectorAll('.play-overlay-btn[data-index]').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const index = parseInt(this.getAttribute('data-index'));
                    playLocalTrack(index);
                });
            });
            
        })
        .catch(err => {
            console.error('Ошибка загрузки главной:', err);
            trackGrid.innerHTML = '<div class="col-12 text-center text-danger">Ошибка загрузки данных</div>';
        });
}

function loadLibrary() {
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('page-title').textContent = 'Ваша библиотека';
    currentPlaylist = null;
    
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
        .catch(err => console.error('Ошибка загрузки библиотеки:', err));
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
    
    // Применяем настройки качества
    const settings = getSettings();
    
    audio.src = `/stream/${track.filename}`;
    audio.play();
    updatePlayerUI(track);
    updateProgressFill();
    document.getElementById('download-current').style.display = 'inline-block';
    document.getElementById('download-current').href = `/download/${track.filename}`;
    
    // Обновляем кнопку плей
    const playBtn = document.getElementById('play-btn');
    playBtn.innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
    playBtn.classList.add('playing');
    playBtn.classList.remove('paused');
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
    
    // Обновляем кнопку плей
    const playBtn = document.getElementById('play-btn');
    playBtn.innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
    playBtn.classList.add('playing');
    playBtn.classList.remove('paused');
}

function updatePlayerUI(track) {
    document.getElementById('current-title').textContent = track.title || 'Неизвестно';
    document.getElementById('current-artist').textContent = track.artist || '';
    document.getElementById('current-cover').src = track.cover || track.thumbnail || placeholder;
    document.getElementById('duration').textContent = formatTime(track.duration);
    
    // Обновляем цвет кнопки плей
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        const accentColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-color').trim();
        playBtn.style.backgroundColor = accentColor;
    }
}

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
            document.getElementById('play-btn').classList.add('playing');
            document.getElementById('play-btn').classList.remove('paused');
        } else {
            audio.pause();
            document.getElementById('play-btn').innerHTML = '<i class="bi bi-play-fill fs-2"></i>';
            document.getElementById('play-btn').classList.add('paused');
            document.getElementById('play-btn').classList.remove('playing');
        }
    }
});

audio.addEventListener('play', () => {
    document.getElementById('play-btn').innerHTML = '<i class="bi bi-pause-fill fs-2"></i>';
    document.getElementById('play-btn').classList.add('playing');
    document.getElementById('play-btn').classList.remove('paused');
});

audio.addEventListener('pause', () => {
    document.getElementById('play-btn').innerHTML = '<i class="bi bi-play-fill fs-2"></i>';
    document.getElementById('play-btn').classList.add('paused');
    document.getElementById('play-btn').classList.remove('playing');
});

document.getElementById('next-btn').addEventListener('click', () => {
    if (tracks.length === 0) return;
    let next = currentIndex + 1;
    if (shuffle) next = Math.floor(Math.random() * tracks.length);
    if (next >= tracks.length) {
        const settings = getSettings();
        next = (repeat || settings.autoplay === 'always') ? 0 : currentIndex;
    }
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
    const settings = getSettings();
    if (settings.autoplay !== 'never') {
        document.getElementById('next-btn').click();
    }
});

// ==================== ЗАГРУЗКА ====================

function loadYt(q) {
    fetch(`/yt_search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => renderTracks(d, true))
        .catch(err => console.error('Ошибка поиска YouTube:', err));
}

document.getElementById('upload-submit').addEventListener('click', () => {
    const formData = new FormData(document.getElementById('upload-form'));
    fetch('/upload', { method: 'POST', body: formData })
        .then(() => {
            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
            loadLibrary();
        })
        .catch(err => console.error('Ошибка загрузки:', err));
});

// ==================== ОБРАБОТЧИКИ ПЛЕЙЛИСТОВ ====================

document.getElementById('create-playlist-btn').addEventListener('click', () => {
    const name = document.getElementById('new-playlist-name').value.trim();
    if (name && createPlaylist(name)) {
        bootstrap.Modal.getInstance(document.getElementById('createPlaylistModal')).hide();
        document.getElementById('new-playlist-name').value = '';
        showPlaylist(name);
    }
});

document.getElementById('save-playlist-btn').addEventListener('click', () => {
    const newName = document.getElementById('edit-playlist-name').value.trim();
    const oldName = currentPlaylistName;
    
    if (!newName) {
        alert('Введите название плейлиста!');
        return;
    }
    
    const playlists = getPlaylists();
    
    if (newName !== oldName) {
        if (playlists[newName]) {
            alert('Плейлист с таким именем уже существует!');
            return;
        }
        
        playlists[newName] = playlists[oldName];
        delete playlists[oldName];
        savePlaylists(playlists);
        currentPlaylistName = newName;
        currentPlaylist = newName;
        loadPlaylists();
    }
    
    bootstrap.Modal.getInstance(document.getElementById('managePlaylistModal')).hide();
});

document.getElementById('delete-playlist-btn').addEventListener('click', () => {
    if (currentPlaylistName && deletePlaylist(currentPlaylistName)) {
        bootstrap.Modal.getInstance(document.getElementById('managePlaylistModal')).hide();
    }
});

document.getElementById('add-to-playlist-btn').addEventListener('click', () => {
    const playlistName = document.getElementById('playlist-select').value;
    
    if (!playlistName) {
        alert('Выберите плейлист!');
        return;
    }
    
    if (trackToAdd && addTrackToPlaylist(playlistName, trackToAdd.filename)) {
        bootstrap.Modal.getInstance(document.getElementById('addToPlaylistModal')).hide();
        alert(`Трек добавлен в "${playlistName}"!`);
    }
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

// Автозапуск при включенной настройке
const settings = getSettings();
if (settings.autoPlayOnStart && tracks.length > 0) {
    setTimeout(() => {
        playLocalTrack(0);
    }, 1000);
}

loadHome();
loadPlaylists();
updateVolumeFill();
updateProgressFill();
progress.value = 0;
volume.value = 1;
initPlayerColors();

window.addEventListener('beforeunload', () => {
    const playlists = getPlaylists();
    savePlaylists(playlists);
});
