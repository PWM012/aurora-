// ==================== РАДИО НА ОСНОВЕ ТРЕКА ====================

let radioMode = false;
let radioTracks = [];
let radioCurrentIndex = 0;
let radioSeedTrack = null;
let radioLoadingMore = false;
let radioBannedTracks = new Set();
let radioLikedTracks = new Set();
let radioStationName = '';
let radioAutoLoad = true;
let radioRequestController = null;

// Инициализация радио-режима
function initRadio() {
    // Создаем контейнер для радио-режима если его нет
    let radioContainer = document.getElementById('radio-container');
    if (!radioContainer) {
        radioContainer = document.createElement('div');
        radioContainer.id = 'radio-container';
        radioContainer.className = 'radio-container';
        radioContainer.style.display = 'none';
        document.body.appendChild(radioContainer);
    }
}

// Показать радио-режим
function showRadioMode() {
    if (!radioMode) return;
    
    document.body.classList.add('radio-mode');
    const container = document.getElementById('radio-container');
    if (container) {
        container.style.display = 'block';
    }
    
    // Скрываем поисковую строку
    document.getElementById('search-bar').style.display = 'none';
    
    // Обновляем заголовок
    document.getElementById('page-title').textContent = radioStationName;
    
    // Показываем кнопку выхода из радио
    const exitRadioBtn = document.getElementById('exit-radio-btn');
    if (exitRadioBtn) exitRadioBtn.style.display = 'inline-block';
}

// Скрыть радио-режим
function hideRadioMode() {
    document.body.classList.remove('radio-mode');
    const container = document.getElementById('radio-container');
    if (container) {
        container.style.display = 'none';
    }
    
    // Показываем поисковую строку если нужно
    if (currentPlaylist === null) {
        document.getElementById('search-bar').style.display = 'none';
    }
    
    // Скрываем кнопку выхода из радио
    const exitRadioBtn = document.getElementById('exit-radio-btn');
    if (exitRadioBtn) exitRadioBtn.style.display = 'none';
}

// Функция для запуска радио на основе трека
function createRadioFromTrack(track, trackType = 'local') {
    // Отменяем текущие загрузки
    if (radioRequestController) {
        radioRequestController.abort();
    }
    
    radioMode = true;
    radioSeedTrack = {
        id: track.videoId || track.filename,
        title: track.title,
        artist: track.artist,
        cover: track.cover || track.thumbnail,
        type: trackType
    };
    
    radioStationName = `Радио: ${track.title}`;
    
    // Показываем загрузку радио
    showRadioLoading();
    
    // Загружаем треки для радио
    loadRadioTracks(track, trackType);
}

// Загрузка треков для радио
async function loadRadioTracks(track, trackType = 'local') {
    try {
        // Создаем новый AbortController
        radioRequestController = new AbortController();
        
        let url;
        if (trackType === 'youtube') {
            url = `/api/radio_yt/${track.videoId}`;
        } else {
            url = `/api/radio_local/${encodeURIComponent(track.filename)}`;
        }
        
        const response = await fetch(url, {
            signal: radioRequestController.signal
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки радио');
        
        const data = await response.json();
        
        if (data.success && data.tracks && data.tracks.length > 0) {
            radioTracks = data.tracks;
            radioCurrentIndex = 0;
            
            // Обновляем название радио
            if (data.station_name) {
                radioStationName = data.station_name;
            }
            
            // Рендерим радио-интерфейс
            renderRadioInterface();
            
            // Начинаем воспроизведение первого трека
            if (radioTracks.length > 0) {
                if (radioTracks[0].type === 'youtube') {
                    playRadioYtTrack(0);
                } else {
                    playRadioLocalTrack(0);
                }
            }
            
            // Показываем уведомление
            showToast(`Радио запущено! Найдено ${radioTracks.length} треков`, 'success');
        } else {
            throw new Error('Не удалось создать радио');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Ошибка загрузки радио:', error);
            hideRadioLoading();
            showToast('Ошибка запуска радио. Попробуйте другой трек.', 'danger');
            exitRadioMode();
        }
    }
}

// Показать загрузку радио
function showRadioLoading() {
    // Скрываем текущий контент
    const trackGrid = document.getElementById('track-grid');
    trackGrid.innerHTML = '';
    
    // Полностью сбрасываем сетку
    trackGrid.style.display = 'grid';
    trackGrid.style.gridTemplateColumns = 'repeat(6, 1fr)';
    trackGrid.className = '';
    
    trackGrid.innerHTML = `
        <div class="radio-loading-container" style="grid-column: 1 / -1;">
            <div class="text-center p-5">
                <div class="spinner-border text-success" role="status" style="width: 3rem; height: 3rem;"></div>
                <p class="mt-4 fs-5">Создаём радио на основе</p>
                <div class="mt-3">
                    <img src="${radioSeedTrack.cover || placeholder}" 
                         class="rounded-circle" 
                         style="width: 100px; height: 100px; object-fit: cover;">
                </div>
                <h5 class="mt-3">${radioSeedTrack.title}</h5>
                <p class="text-secondary">${radioSeedTrack.artist}</p>
                <div class="progress mt-4" style="height: 6px; width: 300px; margin: 0 auto;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                         style="width: 100%"></div>
                </div>
                <p class="text-secondary small mt-3">Ищем похожие треки в вашей библиотеке и на YouTube...</p>
            </div>
        </div>
    `;
}

// Скрыть загрузку радио
function hideRadioLoading() {
    // Загрузка скроется сама при рендере интерфейса
}

// Рендер радио-интерфейса
function renderRadioInterface() {
    const trackGrid = document.getElementById('track-grid');
    trackGrid.innerHTML = '';
    
    // Устанавливаем стиль для радио-режима
    trackGrid.style.display = 'grid';
    trackGrid.style.gridTemplateColumns = 'repeat(6, 1fr)';
    trackGrid.className = 'radio-grid';
    
    // Заголовок радио
    const headerHtml = `
        <div class="radio-header" style="grid-column: 1 / -1;">
            <div class="card bg-dark border-success">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <img src="${radioSeedTrack.cover || placeholder}" 
                                 class="rounded-circle shadow" 
                                 style="width: 80px; height: 80px; object-fit: cover;">
                        </div>
                        <div class="col">
                            <h3 class="text-white mb-1">${radioStationName}</h3>
                            <p class="text-success mb-2">
                                <i class="bi bi-radioactive me-2"></i>
                                Бесконечное радио • ${radioTracks.length} треков
                            </p>
                            <div class="d-flex align-items-center mt-3">
                                <button class="btn btn-sm btn-outline-light me-2" onclick="changeRadioSeed()">
                                    <i class="bi bi-arrow-repeat me-1"></i>Сменить основу
                                </button>
                                <button class="btn btn-sm btn-outline-success me-2" onclick="saveRadioAsPlaylist()">
                                    <i class="bi bi-save me-1"></i>Сохранить плейлист
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="exitRadioMode()">
                                    <i class="bi bi-stop-circle me-1"></i>Остановить радио
                                </button>
                            </div>
                        </div>
                        <div class="col-auto">
                            <div class="radio-controls">
                                <button class="btn btn-success btn-lg rounded-circle me-2" onclick="skipRadioTrack()">
                                    <i class="bi bi-skip-forward-fill"></i>
                                </button>
                                <button class="btn btn-outline-light btn-lg rounded-circle" onclick="likeRadioTrack()">
                                    <i class="bi bi-heart"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Текущий трек
    const currentTrackHtml = `
        <div class="current-radio-track" style="grid-column: 1 / -1;">
            <div class="card bg-dark border-secondary">
                <div class="card-body">
                    <h5 class="text-white mb-3">
                        <i class="bi bi-music-note-beamed text-success me-2"></i>
                        Сейчас в эфире
                    </h5>
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <div id="radio-current-cover">
                                <img src="${placeholder}" class="rounded" style="width: 80px; height: 80px; object-fit: cover;">
                            </div>
                        </div>
                        <div class="col">
                            <h4 id="radio-current-title" class="text-white mb-1">Загрузка...</h4>
                            <p id="radio-current-artist" class="text-secondary mb-2">—</p>
                            <div class="d-flex align-items-center">
                                <button class="btn btn-sm btn-outline-danger me-2" onclick="banRadioTrack()">
                                    <i class="bi bi-slash-circle me-1"></i>Не нравится
                                </button>
                                <span class="text-secondary small">
                                    <i class="bi bi-infinity me-1"></i>
                                    <span id="radio-queue-count">${radioTracks.length}</span> треков в очереди
                                </span>
                            </div>
                        </div>
                        <div class="col-auto">
                            <div class="text-end">
                                <p class="text-secondary small mb-1">Следующий трек:</p>
                                <p id="radio-next-track" class="text-white small">—</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Секция "Следующие треки"
    let upcomingHtml = `
        <div class="radio-upcoming-header" style="grid-column: 1 / -1;">
            <h5 class="text-white mt-4 mb-3">
                <i class="bi bi-list-ol text-success me-2"></i>
                Следующие треки
            </h5>
        </div>
    `;
    
    // Показываем следующие 6 треков
    const upcomingTracks = radioTracks.slice(radioCurrentIndex + 1, radioCurrentIndex + 7);
    upcomingTracks.forEach((track, i) => {
        const index = radioCurrentIndex + 1 + i;
        upcomingHtml += `
            <div class="radio-track-card" style="grid-column: span 2;">
                <div class="card bg-dark border-secondary h-100">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="position-relative me-3">
                                <img src="${track.thumbnail || track.cover || placeholder}" 
                                     class="rounded" 
                                     style="width: 50px; height: 50px; object-fit: cover;">
                                <span class="position-absolute top-0 start-100 translate-middle badge bg-success">
                                    ${index + 1}
                                </span>
                            </div>
                            <div class="flex-grow-1">
                                <h6 class="text-white mb-1 text-truncate">${track.title}</h6>
                                <p class="text-secondary small mb-0 text-truncate">${track.artist}</p>
                                <p class="text-secondary small">
                                    ${track.type === 'youtube' ? '<i class="bi bi-youtube text-danger"></i>' : '<i class="bi bi-music-note-beamed text-success"></i>'}
                                    ${formatTime(track.duration)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Кнопка подгрузки еще треков
    if (radioTracks.length - (radioCurrentIndex + 7) > 0) {
        upcomingHtml += `
            <div class="radio-load-more" style="grid-column: 1 / -1; text-align: center; margin-top: 20px;">
                <button class="btn btn-outline-success" onclick="loadMoreRadioTracks()">
                    <i class="bi bi-plus-circle me-2"></i>
                    Загрузить ещё ${radioTracks.length - (radioCurrentIndex + 7)} треков
                </button>
            </div>
        `;
    }
    
    trackGrid.innerHTML = headerHtml + currentTrackHtml + upcomingHtml;
    
    // Обновляем текущий трек
    updateRadioCurrentTrack();
    
    // Обновляем следующий трек
    updateNextRadioTrack();
    
    // Показываем режим радио
    showRadioMode();
}

// Обновление информации о текущем треке
function updateRadioCurrentTrack() {
    if (radioCurrentIndex >= 0 && radioCurrentIndex < radioTracks.length) {
        const track = radioTracks[radioCurrentIndex];
        document.getElementById('radio-current-title').textContent = track.title;
        document.getElementById('radio-current-artist').textContent = track.artist;
        
        const coverImg = document.querySelector('#radio-current-cover img');
        if (coverImg) {
            coverImg.src = track.thumbnail || track.cover || placeholder;
        }
        
        // Обновляем кнопку лайка
        updateLikeButton();
    }
    
    // Обновляем счетчик очереди
    document.getElementById('radio-queue-count').textContent = radioTracks.length - radioCurrentIndex - 1;
}

// Обновление следующего трека
function updateNextRadioTrack() {
    const nextIndex = radioCurrentIndex + 1;
    const nextTrackElement = document.getElementById('radio-next-track');
    
    if (nextIndex < radioTracks.length) {
        const nextTrack = radioTracks[nextIndex];
        nextTrackElement.textContent = `${nextTrack.title} — ${nextTrack.artist}`;
    } else {
        nextTrackElement.textContent = 'Загрузка...';
    }
}

// Обновление кнопки лайка
function updateLikeButton() {
    const likeBtn = document.querySelector('button[onclick="likeRadioTrack()"]');
    if (!likeBtn) return;
    
    if (radioCurrentIndex >= 0 && radioCurrentIndex < radioTracks.length) {
        const track = radioTracks[radioCurrentIndex];
        const trackId = track.videoId || track.filename;
        
        if (radioLikedTracks.has(trackId)) {
            likeBtn.innerHTML = '<i class="bi bi-heart-fill"></i>';
            likeBtn.classList.remove('btn-outline-light');
            likeBtn.classList.add('btn-danger');
        } else {
            likeBtn.innerHTML = '<i class="bi bi-heart"></i>';
            likeBtn.classList.remove('btn-danger');
            likeBtn.classList.add('btn-outline-light');
        }
    }
}

// Воспроизведение локального трека в радио-режиме
function playRadioLocalTrack(index) {
    if (index >= radioTracks.length || index < 0) {
        loadMoreRadioTracks();
        return;
    }
    
    const track = radioTracks[index];
    
    // Проверяем, не забанен ли трек
    const trackId = track.videoId || track.filename;
    if (radioBannedTracks.has(trackId)) {
        skipRadioTrack();
        return;
    }
    
    radioCurrentIndex = index;
    
    audio.src = `/stream/${track.filename}`;
    audio.play().then(() => {
        updateRadioCurrentTrack();
        updateNextRadioTrack();
        
        // Обновляем плеер
        updatePlayerUI({
            title: track.title,
            artist: track.artist,
            cover: track.cover || placeholder,
            duration: track.duration
        });
        
        showToast(`Радио: ${track.title}`, 'info');
    }).catch(error => {
        console.error('Ошибка воспроизведения:', error);
        skipRadioTrack();
    });
}

// Воспроизведение YouTube трека в радио-режиме
function playRadioYtTrack(index) {
    if (index >= radioTracks.length || index < 0) {
        loadMoreRadioTracks();
        return;
    }
    
    const track = radioTracks[index];
    
    // Проверяем, не забанен ли трек
    const trackId = track.videoId || track.filename;
    if (radioBannedTracks.has(trackId)) {
        skipRadioTrack();
        return;
    }
    
    radioCurrentIndex = index;
    const videoId = track.videoId || track.id;
    
    if (!videoId) {
        skipRadioTrack();
        return;
    }
    
    // Показываем индикатор загрузки
    showLoadingProgress(track.title);
    
    audio.src = `/yt_stream/${videoId}`;
    
    const onCanPlay = () => {
        hideLoadingProgress();
        audio.play().then(() => {
            updateRadioCurrentTrack();
            updateNextRadioTrack();
            
            updatePlayerUI({
                title: track.title,
                artist: track.artist,
                cover: track.thumbnail || placeholder,
                duration: track.duration
            });
            
            showToast(`Радио: ${track.title}`, 'info');
        }).catch(error => {
            console.error('Ошибка воспроизведения:', error);
            skipRadioTrack();
        });
    };
    
    const onError = () => {
        hideLoadingProgress();
        skipRadioTrack();
    };
    
    audio.addEventListener('canplay', onCanPlay, { once: true });
    audio.addEventListener('error', onError, { once: true });
    
    audio.load();
}

// Пропуск трека в радио
function skipRadioTrack() {
    if (radioCurrentIndex + 1 < radioTracks.length) {
        const nextIndex = radioCurrentIndex + 1;
        const nextTrack = radioTracks[nextIndex];
        
        if (nextTrack.type === 'youtube') {
            playRadioYtTrack(nextIndex);
        } else {
            playRadioLocalTrack(nextIndex);
        }
    } else {
        loadMoreRadioTracks();
    }
}

// Лайк трека в радио
function likeRadioTrack() {
    if (radioCurrentIndex >= 0 && radioCurrentIndex < radioTracks.length) {
        const track = radioTracks[radioCurrentIndex];
        const trackId = track.videoId || track.filename;
        
        if (radioLikedTracks.has(trackId)) {
            radioLikedTracks.delete(trackId);
            showToast(`Убрано из избранного: ${track.title}`, 'info');
        } else {
            radioLikedTracks.add(trackId);
            showToast(`Добавлено в избранное: ${track.title}`, 'success');
            
            // Добавляем в избранное в базе данных
            addToFavorites(track);
        }
        
        updateLikeButton();
    }
}

// Бан трека в радио
function banRadioTrack() {
    if (radioCurrentIndex >= 0 && radioCurrentIndex < radioTracks.length) {
        const track = radioTracks[radioCurrentIndex];
        const trackId = track.videoId || track.filename;
        
        radioBannedTracks.add(trackId);
        showToast(`Больше не показывать: ${track.title}`, 'warning');
        
        // Пропускаем трек
        skipRadioTrack();
    }
}

// Загрузка дополнительных треков для радио
async function loadMoreRadioTracks() {
    if (radioLoadingMore) return;
    
    radioLoadingMore = true;
    
    try {
        showToast('Ищем больше похожих треков...', 'info');
        
        let url;
        if (radioSeedTrack.type === 'youtube') {
            url = `/api/radio_yt_more/${radioSeedTrack.id}`;
        } else {
            url = `/api/radio_local_more/${encodeURIComponent(radioSeedTrack.id)}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.tracks && data.tracks.length > 0) {
            // Фильтруем уже добавленные треки
            const existingIds = new Set(radioTracks.map(t => t.videoId || t.filename));
            const newTracks = data.tracks.filter(t => {
                const id = t.videoId || t.filename;
                return !existingIds.has(id) && !radioBannedTracks.has(id);
            });
            
            if (newTracks.length > 0) {
                radioTracks = [...radioTracks, ...newTracks];
                renderRadioInterface();
                showToast(`Добавлено ${newTracks.length} новых треков`, 'success');
            } else {
                showToast('Больше похожих треков не найдено', 'info');
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки треков:', error);
        showToast('Не удалось загрузить больше треков', 'danger');
    } finally {
        radioLoadingMore = false;
    }
}

// Смена основы радио
function changeRadioSeed() {
    // Показываем модальное окно для выбора нового трека
    const modalHtml = `
        <div class="modal fade" id="changeRadioSeedModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="bi bi-arrow-repeat text-success me-2"></i>
                            Сменить основу радио
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="text-secondary mb-4">
                            Выберите новый трек для создания радио. Радио перезапустится с новыми рекомендациями.
                        </p>
                        
                        <div class="mb-4">
                            <h6 class="text-white mb-3">Выбрать из библиотеки:</h6>
                            <div id="library-tracks-list" class="list-group bg-transparent">
                                <div class="text-center py-3">
                                    <div class="spinner-border text-success" role="status"></div>
                                    <p class="mt-2">Загружаем треки...</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <h6 class="text-white mb-3">Или найти трек:</h6>
                            <div class="input-group">
                                <input type="text" 
                                       class="form-control bg-secondary border-secondary text-white" 
                                       id="search-radio-track" 
                                       placeholder="Поиск трека или исполнителя...">
                                <button class="btn btn-success" onclick="searchForRadioSeed()">
                                    <i class="bi bi-search"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div id="search-results" style="display: none;">
                            <h6 class="text-white mb-3">Результаты поиска:</h6>
                            <div id="search-results-list" class="list-group bg-transparent"></div>
                        </div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                        <button type="button" class="btn btn-success" onclick="applyNewRadioSeed()">
                            <i class="bi bi-play-circle me-2"></i>Запустить радио
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Добавляем модальное окно если его нет
    let modal = document.getElementById('changeRadioSeedModal');
    if (!modal) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        modal = document.getElementById('changeRadioSeedModal');
    }
    
    // Загружаем треки из библиотеки
    loadLibraryTracksForRadio();
    
    // Показываем модальное окно
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// Загрузка треков из библиотеки для выбора основы
function loadLibraryTracksForRadio() {
    fetch('/tracks')
        .then(r => r.json())
        .then(tracks => {
            const container = document.getElementById('library-tracks-list');
            container.innerHTML = '';
            
            if (tracks.length === 0) {
                container.innerHTML = '<p class="text-secondary text-center">Ваша библиотека пуста</p>';
                return;
            }
            
            // Показываем 10 случайных треков
            const randomTracks = [...tracks].sort(() => Math.random() - 0.5).slice(0, 10);
            
            randomTracks.forEach(track => {
                const item = document.createElement('div');
                item.className = 'list-group-item list-group-item-action bg-secondary border-dark mb-2';
                item.style.cursor = 'pointer';
                item.innerHTML = `
                    <div class="d-flex align-items-center">
                        <img src="${track.cover || placeholder}" 
                             class="rounded me-3" 
                             style="width: 40px; height: 40px; object-fit: cover;">
                        <div class="flex-grow-1">
                            <div class="text-white">${track.title}</div>
                            <div class="text-secondary small">${track.artist}</div>
                        </div>
                        <i class="bi bi-chevron-right"></i>
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    // Убираем выделение с предыдущего элемента
                    document.querySelectorAll('#library-tracks-list .list-group-item').forEach(el => {
                        el.classList.remove('active');
                    });
                    
                    // Выделяем текущий
                    item.classList.add('active');
                    
                    // Сохраняем выбранный трек
                    window.selectedRadioSeed = track;
                });
                
                container.appendChild(item);
            });
        })
        .catch(err => {
            console.error('Ошибка загрузки треков:', err);
            document.getElementById('library-tracks-list').innerHTML = 
                '<p class="text-secondary text-center">Ошибка загрузки треков</p>';
        });
}

// Поиск трека для основы радио
function searchForRadioSeed() {
    const query = document.getElementById('search-radio-track').value.trim();
    if (!query) return;
    
    showToast('Ищем трек...', 'info');
    
    fetch(`/yt_search?q=${encodeURIComponent(query)}&limit=10`)
        .then(r => r.json())
        .then(tracks => {
            const container = document.getElementById('search-results-list');
            container.innerHTML = '';
            
            if (tracks.length === 0) {
                container.innerHTML = '<p class="text-secondary text-center">Треки не найдены</p>';
                return;
            }
            
            tracks.forEach(track => {
                const item = document.createElement('div');
                item.className = 'list-group-item list-group-item-action bg-secondary border-dark mb-2';
                item.style.cursor = 'pointer';
                item.innerHTML = `
                    <div class="d-flex align-items-center">
                        <img src="${track.thumbnail || placeholder}" 
                             class="rounded me-3" 
                             style="width: 40px; height: 40px; object-fit: cover;">
                        <div class="flex-grow-1">
                            <div class="text-white">${track.title}</div>
                            <div class="text-secondary small">${track.artist}</div>
                            <div class="text-secondary small">
                                <i class="bi bi-youtube text-danger me-1"></i>YouTube
                            </div>
                        </div>
                        <i class="bi bi-chevron-right"></i>
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    // Убираем выделение с предыдущего элемента
                    document.querySelectorAll('#search-results-list .list-group-item').forEach(el => {
                        el.classList.remove('active');
                    });
                    
                    // Выделяем текущий
                    item.classList.add('active');
                    
                    // Сохраняем выбранный трек
                    window.selectedRadioSeed = {
                        ...track,
                        type: 'youtube'
                    };
                });
                
                container.appendChild(item);
            });
            
            // Показываем результаты поиска
            document.getElementById('search-results').style.display = 'block';
        })
        .catch(err => {
            console.error('Ошибка поиска:', err);
            showToast('Ошибка поиска трека', 'danger');
        });
}

// Применение новой основы радио
function applyNewRadioSeed() {
    if (!window.selectedRadioSeed) {
        showToast('Выберите трек для основы радио', 'warning');
        return;
    }
    
    // Закрываем модальное окно
    const modal = bootstrap.Modal.getInstance(document.getElementById('changeRadioSeedModal'));
    if (modal) modal.hide();
    
    // Запускаем радио с новым треком
    createRadioFromTrack(window.selectedRadioSeed, window.selectedRadioSeed.type || 'local');
}

// Сохранение радио как плейлиста
function saveRadioAsPlaylist() {
    const playlistName = `Радио: ${radioSeedTrack.title}`;
    
    // Показываем модальное окно для подтверждения
    const modalHtml = `
        <div class="modal fade" id="saveRadioPlaylistModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="bi bi-save text-success me-2"></i>
                            Сохранить радио как плейлист
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Название плейлиста:</label>
                            <input type="text" 
                                   class="form-control bg-secondary border-secondary text-white" 
                                   id="radio-playlist-name" 
                                   value="${playlistName}">
                        </div>
                        <p class="text-secondary small">
                            Будет создан плейлист с ${radioTracks.length} треками из текущего радио.
                            Треки с YouTube будут добавлены как локальные (если доступно).
                        </p>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                        <button type="button" class="btn btn-success" onclick="confirmSaveRadioPlaylist()">
                            <i class="bi bi-save me-2"></i>Сохранить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    let modal = document.getElementById('saveRadioPlaylistModal');
    if (!modal) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        modal = document.getElementById('saveRadioPlaylistModal');
    }
    
    new bootstrap.Modal(modal).show();
}

// Подтверждение сохранения радио как плейлиста
async function confirmSaveRadioPlaylist() {
    const playlistName = document.getElementById('radio-playlist-name').value.trim();
    if (!playlistName) {
        showToast('Введите название плейлиста', 'warning');
        return;
    }
    
    try {
        // Создаем плейлист
        const playlists = JSON.parse(localStorage.getItem('aurora_playlists') || '{}');
        if (playlists[playlistName]) {
            showToast('Плейлист с таким именем уже существует', 'danger');
            return;
        }
        
        // Собираем треки для плейлиста
        const playlistTracks = [];
        for (const track of radioTracks.slice(0, 100)) { // Ограничиваем 100 треками
            if (track.type === 'local') {
                playlistTracks.push(track.filename);
            } else if (track.videoId) {
                // Для YouTube треков пытаемся добавить в библиотеку
                try {
                    const response = await fetch('/add_from_yt', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({videoId: track.videoId})
                    });
                    
                    if (response.ok) {
                        // Ждем немного, чтобы трек добавился
                        setTimeout(async () => {
                            const tracksResponse = await fetch('/tracks');
                            const allTracks = await tracksResponse.json();
                            const newTrack = allTracks.find(t => 
                                t.title === track.title && t.artist === track.artist
                            );
                            
                            if (newTrack) {
                                playlistTracks.push(newTrack.filename);
                            }
                        }, 1000);
                    }
                } catch (e) {
                    console.error('Ошибка добавления YouTube трека:', e);
                }
            }
        }
        
        // Сохраняем плейлист
        playlists[playlistName] = {
            tracks: playlistTracks,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            isRadio: true,
            seedTrack: radioSeedTrack
        };
        
        localStorage.setItem('aurora_playlists', JSON.stringify(playlists));
        
        // Закрываем модальное окно
        const modal = bootstrap.Modal.getInstance(document.getElementById('saveRadioPlaylistModal'));
        if (modal) modal.hide();
        
        showToast(`Радио сохранено как плейлист "${playlistName}"`, 'success');
        loadPlaylists();
        
    } catch (error) {
        console.error('Ошибка сохранения радио:', error);
        showToast('Ошибка сохранения радио', 'danger');
    }
}

// Добавление трека в избранное
async function addToFavorites(track) {
    try {
        const response = await fetch('/api/favorites/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                track_id: track.videoId || track.filename,
                track_type: track.type || 'local',
                title: track.title,
                artist: track.artist
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка добавления в избранное');
        }
    } catch (error) {
        console.error('Ошибка добавления в избранное:', error);
    }
}

// Выход из радио-режима
function exitRadioMode() {
    if (confirm('Остановить радио и вернуться к библиотеке?')) {
        radioMode = false;
        radioTracks = [];
        radioCurrentIndex = 0;
        radioSeedTrack = null;
        radioBannedTracks.clear();
        radioLikedTracks.clear();
        
        hideRadioMode();
        loadHome();
        
        // Останавливаем воспроизведение
        if (audio && !audio.paused) {
            audio.pause();
        }
        
        showToast('Радио остановлено', 'info');
    }
}

// Функция для добавления кнопки радио в карточку трека
function addRadioButtonToTrackCard(cardElement, track, trackType = 'local') {
    // Находим контейнер для кнопок действий
    const actionsContainer = cardElement.querySelector('.card-actions');
    if (!actionsContainer) return;
    
    // Проверяем, нет ли уже кнопки радио
    if (cardElement.querySelector('.action-btn.radio')) return;
    
    // Создаем кнопку радио
    const radioBtn = document.createElement('button');
    radioBtn.className = 'action-btn radio';
    radioBtn.setAttribute('data-tooltip', 'Запустить радио');
    radioBtn.innerHTML = '<i class="bi bi-radioactive"></i>';
    
    // Добавляем обработчик
    radioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        createRadioFromTrack(track, trackType);
    });
    
    // Добавляем кнопку в начало
    actionsContainer.insertBefore(radioBtn, actionsContainer.firstChild);
}

// Модифицируем функцию renderTracks для добавления кнопки радио
function addRadioButtonsToExistingCards() {
    document.querySelectorAll('.card').forEach(card => {
        // Пропускаем карточки, которые уже имеют кнопку радио
        if (card.querySelector('.action-btn.radio')) return;
        
        // Для карточек на главной странице ищем данные трека
        const playBtn = card.querySelector('.play-overlay-btn');
        if (playBtn) {
            // Определяем тип трека
            if (playBtn.classList.contains('local-track-play-btn')) {
                const filename = playBtn.dataset.filename;
                // Можно добавить позже, когда потребуется
            }
        }
    });
}

// Инициализация радио при загрузке
document.addEventListener('DOMContentLoaded', function() {
    initRadio();
    
    // Добавляем кнопку выхода из радио в навигацию
    const nav = document.querySelector('.navbar-nav');
    if (nav) {
        const exitRadioBtn = document.createElement('li');
        exitRadioBtn.className = 'nav-item';
        exitRadioBtn.id = 'exit-radio-btn';
        exitRadioBtn.style.display = 'none';
        exitRadioBtn.innerHTML = `
            <a href="#" class="nav-link text-danger" onclick="exitRadioMode(); return false;">
                <i class="bi bi-stop-circle me-2"></i>Выйти из радио
            </a>
        `;
        nav.appendChild(exitRadioBtn);
    }
});
