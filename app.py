from flask import Flask, render_template, send_from_directory, jsonify, abort, request, redirect
import os
from mutagen import File as MutagenFile
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
import base64
from werkzeug.utils import secure_filename
from ytmusicapi import YTMusic
from yt_dlp import YoutubeDL
import requests
import re
import time

app = Flask(__name__)

MUSIC_FOLDER = 'music'
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.flac'}
ytmusic = YTMusic()

def get_local_tracks():
    tracks = []
    if os.path.exists(MUSIC_FOLDER):
        for root, _, files in os.walk(MUSIC_FOLDER):
            for filename in files:
                if os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS:
                    filepath = os.path.join(root, filename)
                    rel_path = os.path.relpath(filepath, MUSIC_FOLDER).replace('\\', '/')
                    filename_base = os.path.splitext(filename)[0]
                    
                    audio = MutagenFile(filepath)
                    duration = int(audio.info.length) if audio.info else 0
                    
                    title = artist = album = 'Неизвестно'
                    cover = None
                    
                    if filename.lower().endswith('.mp3'):
                        try:
                            tag = EasyID3(filepath)
                            title = tag.get('title', [filename_base])[0]
                            artist = tag.get('artist', [''])[0] or 'Неизвестный артист'
                            album = tag.get('album', ['Неизвестный альбом'])[0]
                        except:
                            pass
                        
                        try:
                            mp3 = MP3(filepath)
                            if mp3.tags:
                                for tag in mp3.tags.values():
                                    if hasattr(tag, 'FrameID') and tag.FrameID in ['APIC', 'PIC']:
                                        cover = base64.b64encode(tag.data).decode('ascii')
                                        break
                        except:
                            pass
                    
                    # Фикс артиста из имени файла (Title - Artist - id.mp3)
                    parts = filename_base.split(' - ')
                    if len(parts) >= 2:
                        title = parts[0].strip()
                        artist = parts[1].strip() if len(parts) >= 2 else 'Неизвестный артист'
                    
                    tracks.append({
                        'title': title,
                        'artist': artist,
                        'album': album,
                        'filename': rel_path,
                        'duration': duration,
                        'cover': f'data:image/jpeg;base64,{cover}' if cover else None,
                    })
    tracks.sort(key=lambda x: x['title'].lower())
    return tracks

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tracks')
def local_tracks():
    return jsonify(get_local_tracks())

@app.route('/yt_search')
def yt_search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])
    
    try:
        results = ytmusic.search(query, filter="songs", limit=30)
        tracks = []
        for item in results:
            if item.get('resultType') != 'song':
                continue
            tracks.append({
                'videoId': item['videoId'],
                'title': item['title'],
                'artist': ', '.join([a['name'] for a in item.get('artists', [{'name': 'Неизвестный артист'}])]),
                'duration': item.get('duration_seconds', 0),
                'thumbnail': item['thumbnails'][-1]['url'] if item.get('thumbnails') else None
            })
        return jsonify(tracks)
    except Exception as e:
        print(f"Ошибка поиска YouTube: {e}")
        return jsonify([])

@app.route('/add_from_yt', methods=['POST'])
def add_from_yt():
    data = request.get_json()
    video_id = data.get('videoId')
    if not video_id:
        return jsonify({'error': 'No videoId'}), 400
    
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(MUSIC_FOLDER, '%(title)s - %(artist)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }, {
            'key': 'EmbedThumbnail',
            'already_have_thumbnail': False
        }],
        'writethumbnail': True,
        'embed_metadata': True,
        'ignoreerrors': True
    }
    
    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка загрузки с YouTube: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_files():
    if 'files' not in request.files:
        return jsonify({'error': 'No files'}), 400
    
    files = request.files.getlist('files')
    saved = []
    
    for file in files:
        if file.filename == '':
            continue
        if os.path.splitext(file.filename)[1].lower() in ALLOWED_EXTENSIONS:
            filename = secure_filename(file.filename)
            file_path = os.path.join(MUSIC_FOLDER, filename)
            file.save(file_path)
            saved.append(filename)
    
    return jsonify({'saved': saved})

@app.route('/stream/<path:filename>')
def stream(filename):
    filepath = os.path.join(MUSIC_FOLDER, filename)
    if not os.path.exists(filepath):
        abort(404)
    return send_from_directory(MUSIC_FOLDER, filename)

@app.route('/download/<path:filename>')
def download(filename):
    filepath = os.path.join(MUSIC_FOLDER, filename)
    if not os.path.exists(filepath):
        abort(404)
    return send_from_directory(MUSIC_FOLDER, filename, as_attachment=True)

@app.route('/yt_stream/<videoId>')
def yt_stream(videoId):
    try:
        url = f"https://www.youtube.com/watch?v={videoId}"
        ydl_opts = {'format': 'bestaudio/best', 'noplaylist': True}
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            audio_url = info['url']
        return redirect(audio_url)
    except:
        abort(404)

@app.route('/delete', methods=['POST'])
def delete_track():
    data = request.get_json()
    filename = data.get('filename')
    if filename:
        filepath = os.path.join(MUSIC_FOLDER, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404

def search_lyrics_online(title, artist):
    """Автоматический поиск текста песни в интернете"""
    try:
        # Очищаем строки от лишних символов
        title = re.sub(r'[^\w\s\-\(\)\[\]]', '', title)
        artist = re.sub(r'[^\w\s\-\(\)\[\]]', '', artist)
        
        # Пробуем разные источники
        
        # 1. Пробуем через AZ Lyrics API (неофициальный метод)
        try:
            url = f"https://www.azlyrics.com/lyrics/{artist.lower().replace(' ', '')}/{title.lower().replace(' ', '')}.html"
            response = requests.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }, timeout=5)
            
            if response.status_code == 200:
                # Парсим текст песни с AZ Lyrics
                pattern = r'<!-- Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement\. Sorry\. -->(.*?)</div>'
                match = re.search(pattern, response.text, re.DOTALL)
                if match:
                    lyrics = match.group(1).strip()
                    lyrics = re.sub(r'<.*?>', '', lyrics)  # Удаляем HTML теги
                    lyrics = re.sub(r'\s+', ' ', lyrics)  # Убираем лишние пробелы
                    if len(lyrics) > 100:  # Проверяем, что нашли достаточно текста
                        return lyrics
        except:
            pass
        
        # 2. Пробуем через Genius API (через веб-скрапинг, так как без API ключа)
        try:
            search_url = f"https://genius.com/{artist.replace(' ', '-')}-{title.replace(' ', '-')}-lyrics"
            response = requests.get(search_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }, timeout=5)
            
            if response.status_code == 200:
                # Ищем текст песни в ответе
                pattern = r'data-lyrics-container="true"[^>]*>([\s\S]*?)</div>'
                matches = re.findall(pattern, response.text)
                if matches:
                    lyrics = ' '.join(matches)
                    lyrics = re.sub(r'<.*?>', '', lyrics)  # Удаляем HTML теги
                    lyrics = re.sub(r'\[.*?\]', '', lyrics)  # Удаляем метки типа [Куплет 1]
                    if len(lyrics) > 100:
                        return lyrics
        except:
            pass
        
        # 3. Пробуем через YouTube Music API
        try:
            # Ищем песню на YouTube Music
            search_query = f"{artist} {title} lyrics"
            results = ytmusic.search(search_query, filter="songs", limit=1)
            
            if results and results[0].get('videoId'):
                video_id = results[0]['videoId']
                # Пробуем получить текст через YouTube Music
                lyrics_data = ytmusic.get_lyrics(video_id)
                if lyrics_data and lyrics_data.get('lyrics'):
                    return lyrics_data.get('lyrics')
        except:
            pass
        
        # 4. Пробуем через Musixmatch (неофициальный метод)
        try:
            search_url = f"https://www.musixmatch.com/lyrics/{artist.replace(' ', '-')}/{title.replace(' ', '-')}"
            response = requests.get(search_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }, timeout=5)
            
            if response.status_code == 200:
                # Ищем текст в JSON-LD структуре
                pattern = r'"description":"(.*?)"'
                matches = re.findall(pattern, response.text)
                if matches:
                    for match in matches:
                        if len(match) > 100 and title.lower() in match.lower():
                            lyrics = match.replace('\\n', '\n').replace('\\"', '"')
                            return lyrics
        except:
            pass
        
    except Exception as e:
        print(f"Ошибка при поиске текста: {e}")
    
    return None

def get_cached_lyrics(title, artist):
    """Проверяем кэш текстов песен"""
    try:
        lyrics_cache_file = 'lyrics_cache.json'
        if os.path.exists(lyrics_cache_file):
            with open(lyrics_cache_file, 'r', encoding='utf-8') as f:
                import json
                cache = json.load(f)
                
                # Ищем в кэше по ключу
                cache_key = f"{artist.lower()}|{title.lower()}"
                if cache_key in cache:
                    return cache[cache_key]
    except:
        pass
    return None

def save_to_cache(title, artist, lyrics):
    """Сохраняем текст в кэш"""
    try:
        lyrics_cache_file = 'lyrics_cache.json'
        cache = {}
        
        if os.path.exists(lyrics_cache_file):
            with open(lyrics_cache_file, 'r', encoding='utf-8') as f:
                import json
                cache = json.load(f)
        
        cache_key = f"{artist.lower()}|{title.lower()}"
        cache[cache_key] = lyrics
        
        with open(lyrics_cache_file, 'w', encoding='utf-8') as f:
            import json
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except:
        pass

@app.route('/lyrics')
def get_lyrics():
    title = request.args.get('title', '')
    artist = request.args.get('artist', '')
    video_id = request.args.get('videoId', '')
    
    if not title or not artist:
        return jsonify({'lyrics': 'Укажите название песни и исполнителя'})
    
    # Пробуем получить из кэша
    cached_lyrics = get_cached_lyrics(title, artist)
    if cached_lyrics:
        return jsonify({'lyrics': cached_lyrics, 'cached': True})
    
    # Если есть videoId, пробуем YouTube Music
    if video_id:
        try:
            lyrics_data = ytmusic.get_lyrics(video_id)
            if lyrics_data and lyrics_data.get('lyrics'):
                lyrics = lyrics_data.get('lyrics')
                save_to_cache(title, artist, lyrics)
                return jsonify({'lyrics': lyrics, 'source': 'youtube_music'})
        except:
            pass
    
    # Автоматический поиск в интернете
    try:
        lyrics = search_lyrics_online(title, artist)
        if lyrics:
            save_to_cache(title, artist, lyrics)
            return jsonify({'lyrics': lyrics, 'source': 'online_search'})
    except Exception as e:
        print(f"Ошибка при автоматическом поиске текста: {e}")
    
    # Если ничего не нашли, используем локальную базу
    try:
        local_lyrics = get_local_lyrics(title, artist)
        if local_lyrics:
            save_to_cache(title, artist, local_lyrics)
            return jsonify({'lyrics': local_lyrics, 'source': 'local_database'})
    except:
        pass
    
    return jsonify({
        'lyrics': f'К сожалению, не удалось найти текст песни "{title}" - {artist}.\n\nВы можете:\n1. Проверить правильность названия и исполнителя\n2. Поискать текст вручную в интернете\n3. Добавить трек через поиск YouTube (там текст находится чаще)'
    })

def get_local_lyrics(title, artist):
    """Проверяем локальную базу текстов"""
    # Популярные тексты для демонстрации
    popular_lyrics = {
        ("Blinding Lights", "The Weeknd"): """Yeah
I been tryna call
I been on my own for long enough
Maybe you can show me how to love, maybe
I'm going through withdrawals
You don't even have to do too much
You can turn me on with just a touch, baby

I look around and Sin City's cold and empty (oh)
No one's around to judge me (oh)
I can't see clearly when you're gone

I said, ooh, I'm blinded by the lights
No, I can't sleep until I feel your touch
I said, ooh, I'm drowning in the night
Oh, when I'm like this, you're the one I trust
Hey, hey, hey""",
        
        ("Shape of You", "Ed Sheeran"): """The club isn't the best place to find a lover
So the bar is where I go
Me and my friends at the table doing shots
Drinking fast and then we talk slow
Come over and start up a conversation with just me
And trust me I'll give it a chance now
Take my hand, stop, put Van the Man on the jukebox
And then we start to dance, and now I'm singing like""",
        
        ("Stay", "Justin Bieber"): """I do the same thing I told you that I never would
I told you I changed, even when I knew I never could
I know that I can't find nobody else as good as you
I need you to stay, need you to stay, hey
I get drunk, wake up, I'm wasted still
I realize the time that I wasted here
I feel like you can't feel the way I feel
Oh, I'll be fucked up if you can't be right here""",
        
        ("Bad Guy", "Billie Eilish"): """White shirt now red, my bloody nose
Sleepin', you're on your tippy toes
Creepin' around like no one knows
Think you're so criminal
Bruises on both my knees for you
Don't say thank you or please
I do what I want when I'm wanting to
My soul? So cynical""",
        
        ("Dance Monkey", "Tones and I"): """They say, oh my god, I see the way you shine
Take your hand, my dear, and place them both in mine
You know you stopped me dead while I was passing by
And now I beg to see you dance just one more time

Ooh, I see you, see you, see you every time
And, oh my, I, I like your style
You, you make me, make me, make me wanna cry
And now I beg to see you dance just one more time""",
        
        ("Bohemian Rhapsody", "Queen"): """Is this the real life? Is this just fantasy?
Caught in a landslide, no escape from reality
Open your eyes, look up to the skies and see
I'm just a poor boy, I need no sympathy
Because I'm easy come, easy go, little high, little low
Any way the wind blows doesn't really matter to me, to me""",
    }
    
    # Ищем точное совпадение
    for (song_title, song_artist), lyrics in popular_lyrics.items():
        if song_title.lower() in title.lower() and song_artist.lower() in artist.lower():
            return lyrics
    
    # Ищем частичное совпадение
    for (song_title, song_artist), lyrics in popular_lyrics.items():
        if song_title.lower() in title.lower() or title.lower() in song_title.lower():
            return f"Текст песни похожей на '{song_title}' - {song_artist}:\n\n{lyrics}"
    
    return None

@app.route('/playlist_stats')
def playlist_stats():
    """Получение статистики по плейлистам"""
    try:
        import json
        playlists_data = {}
        playlists_file = 'playlists.json'
        
        if os.path.exists(playlists_file):
            with open(playlists_file, 'r', encoding='utf-8') as f:
                playlists_data = json.load(f)
        
        return jsonify({
            'count': len(playlists_data),
            'playlists': list(playlists_data.keys()),
            'total_tracks': sum(len(p['tracks']) for p in playlists_data.values())
        })
    except:
        return jsonify({'count': 0, 'playlists': [], 'total_tracks': 0})

if __name__ == '__main__':
    # Создаем папки если их нет
    os.makedirs(MUSIC_FOLDER, exist_ok=True)
    
    app.run(debug=True, port=5000, threaded=True)
