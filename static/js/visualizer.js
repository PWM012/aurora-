// visualizer.js - Аудио-визуализатор

let audioContext;
let analyser;
let dataArray;
let bufferLength;
let canvas;
let ctx;
let animationId;

function initVisualizer(type = 'bars', color = '#1db954') {
    if (!window.audioPlayer) return;
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            
            const source = audioContext.createMediaElementSource(window.audioPlayer);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            
            analyser.fftSize = 256;
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }
        
        // Создаем канвас если его нет
        if (!document.getElementById('visualizer')) {
            canvas = document.createElement('canvas');
            canvas.id = 'visualizer';
            canvas.className = 'visualizer-container';
            document.body.appendChild(canvas);
        } else {
            canvas = document.getElementById('visualizer');
        }
        
        ctx = canvas.getContext('2d');
        
        // Настраиваем размеры
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Запускаем анимацию
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        
        switch(type) {
            case 'bars':
                animateBars(color);
                break;
            case 'wave':
                animateWave(color);
                break;
            case 'circle':
                animateCircle(color);
                break;
            case 'particles':
                animateParticles(color);
                break;
            case 'spectrum':
                animateSpectrum(color);
                break;
            default:
                canvas.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Ошибка инициализации визуализатора:', error);
    }
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = 100;
        canvas.style.width = '100%';
        canvas.style.height = '100px';
    }
}

function animateBars(color) {
    canvas.style.display = 'block';
    
    function draw() {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for(let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i];
            
            // Градиент
            const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, adjustColor(color, -50));
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    }
    
    draw();
}

function animateWave(color) {
    canvas.style.display = 'block';
    
    function draw() {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteTimeDomainData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        
        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;
        
        for(let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            
            if(i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }
    
    draw();
}

function animateCircle(color) {
    canvas.style.display = 'block';
    
    function draw() {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.8;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        for(let i = 0; i < bufferLength; i++) {
            const amplitude = dataArray[i];
            const angle = (i * 2 * Math.PI) / bufferLength;
            
            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + amplitude);
            const y2 = centerY + Math.sin(angle) * (radius + amplitude);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    draw();
}

function adjustColor(color, amount) {
    let usePound = false;
    
    if (color[0] === "#") {
        color = color.slice(1);
        usePound = true;
    }
    
    const num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    
    r = Math.min(Math.max(0, r), 255);
    g = Math.min(Math.max(0, g), 255);
    b = Math.min(Math.max(0, b), 255);
    
    return (usePound ? "#" : "") + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0');
}

// Экспорт функции
if (typeof window !== 'undefined') {
    window.initVisualizer = initVisualizer;
}
