// Загружаем радио-скрипты
function loadRadioScripts() {
    // Уже загружено в основном скрипте
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', function() {
    // Загружаем радио-скрипты
    loadRadioScripts();
    
    // Добавляем кнопки радио к существующим карточкам через 1 секунду
    setTimeout(addRadioButtonsToExistingCards, 1000);
    
    // Обработчик окончания трека для автоматического перехода в радио
    if (audio) {
        audio.addEventListener('ended', function() {
            if (radioMode && radioAutoLoad) {
                setTimeout(skipRadioTrack, 1000);
            }
        });
    }
});
