// Утилиты для радио

// Получение радио-статистики
async function getRadioStats() {
    try {
        const response = await fetch('/api/radio_stats');
        return await response.json();
    } catch (error) {
        console.error('Ошибка получения статистики радио:', error);
        return {};
    }
}

// Получение истории радио
async function getRadioHistory() {
    try {
        const response = await fetch('/api/radio_history?limit=20');
        return await response.json();
    } catch (error) {
        console.error('Ошибка получения истории радио:', error);
        return [];
    }
}

// Создание радио на основе истории прослушивания
async function createRadioFromHistory() {
    try {
        const response = await fetch('/api/radio_from_history');
        const data = await response.json();
        
        if (data.success && data.tracks.length > 0) {
            createRadioFromTrack({
                title: 'Ваши любимые треки',
                artist: 'На основе вашей истории',
                cover: data.seed_track?.thumbnail || placeholder
            }, 'history');
        }
    } catch (error) {
        console.error('Ошибка создания радио из истории:', error);
    }
}

// Экспорт радио-сессии
function exportRadioSession() {
    if (!radioSeedTrack) return;
    
    const sessionData = {
        seed_track: radioSeedTrack,
        station_name: radioStationName,
        played_tracks: radioTracks.slice(0, radioCurrentIndex + 1),
        created_at: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(sessionData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `radio-session-${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showToast('Сессия радио экспортирована', 'success');
}

// Импорт радио-сессии
function importRadioSession(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const sessionData = JSON.parse(e.target.result);
            
            // Восстанавливаем радио-сессию
            radioSeedTrack = sessionData.seed_track;
            radioStationName = sessionData.station_name;
            radioTracks = sessionData.played_tracks;
            radioCurrentIndex = radioTracks.length - 1;
            radioMode = true;
            
            renderRadioInterface();
            showToast('Сессия радио восстановлена', 'success');
        } catch (error) {
            console.error('Ошибка импорта сессии:', error);
            showToast('Ошибка импорта сессии радио', 'danger');
        }
    };
    
    reader.readAsText(file);
}
