// recommendations.js - Управление рекомендациями на главной

// Загрузка рекомендаций для главной страницы
async function loadRecommendations() {
    try {
        const response = await fetch('/recommendations');
        const data = await response.json();
        
        const trackGrid = document.getElementById('track-grid');
        
        // Отображаем плейлисты
        let html = `
            <div class="col-12">
                <h4 class="text-white mb-4">Популярные плейлисты</h4>
            </div>
        `;
        
        data.playlists.forEach(playlist => {
            html += `
                <div class="col">
                    <div class="card h-100 bg-${playlist.color} bg-opacity-10 border-${playlist.color}">
                        <div class="card-body d-flex flex-column justify-content-center align-items-center">
                            <i class="bi bi-${playlist.icon} fs-1 text-${playlist.color} mb-3"></i>
                            <h5 class="card-title text-white">${playlist.name}</h5>
                            <p class="text-secondary text-center small">${playlist.description}</p>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Отображаем рекомендации
        if (data.recommended_tracks && data.recommended_tracks.length > 0) {
            html += `
                <div class="col-12 mt-5">
                    <h4 class="text-white mb-4">Рекомендации для вас</h4>
                </div>
            `;
            
            data.recommended_tracks.forEach((track, i) => {
                const cover = track.cover || placeholder;
                html += `
                    <div class="col">
                        <div class="card h-100">
                            <div class="card-img-container position-relative">
                                <img src="${cover}" class="card-img-top" alt="cover">
                                <div class="play-overlay">
                                    <button class="btn btn-success rounded-circle shadow-lg play-recommended-btn" data-index="${i}">
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
            
            // Добавляем обработчики для кнопок воспроизведения
            setTimeout(() => {
                document.querySelectorAll('.play-recommended-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const index = parseInt(e.target.closest('.play-recommended-btn').dataset.index);
                        playLocalTrack(index);
                    });
                });
            }, 100);
        } else {
            html += `
                <div class="col-12 mt-5">
                    <div class="alert alert-dark border-secondary">
                        <div class="d-flex align-items-center">
                            <i class="bi bi-info-circle me-3 text-secondary"></i>
                            <div>
                                <div class="text-white">Здесь будут рекомендации</div>
                                <div class="text-secondary small">Загрузите свои треки для получения персональных рекомендаций</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        trackGrid.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки рекомендаций:', error);
        trackGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-wifi-off fs-1 text-secondary"></i>
                <p class="text-secondary mt-3">Не удалось загрузить рекомендации</p>
                <button class="btn btn-outline-secondary mt-3" onclick="loadHome()">Повторить</button>
            </div>
        `;
    }
}

// Обновляем функцию loadHome
function loadHome() {
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('page-title').textContent = 'Главная';
    currentPlaylist = null;
    
    // Загружаем рекомендации
    loadRecommendations();
}
