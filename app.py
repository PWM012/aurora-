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
import json
from datetime import datetime, timedelta
from functools import lru_cache
import threading
from collections import OrderedDict

app = Flask(__name__)

MUSIC_FOLDER = 'music'
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.flac'}
ytmusic = YTMusic()

# Кэш для данных главной страницы
yt_home_cache = None
yt_home_cache_time = None
CACHE_DURATION = 1800  # 30 минут

# Кэш для предзагруженных аудио-ссылок
audio_url_cache = OrderedDict()
CACHE_MAX_SIZE = 30
CACHE_EXPIRE_SECONDS = 21600  # 6 часов (ссылки YouTube живут около 6 часов)

def get_audio_url(videoId):
    """Получаем аудио-ссылку для videoId с кэшированием"""
    # Проверяем кэш
    if videoId in audio_url_cache:
        entry = audio_url_cache[videoId]
        if time.time() - entry['timestamp'] < CACHE_EXPIRE_SECONDS:
            # Обновляем порядок использования
            audio_url_cache.move_to_end(videoId)
            return entry['url']
        else:
            # Удаляем просроченное
            del audio_url_cache[videoId]
    
    # Если нет в кэше, получаем ссылку
    try:
        url = f"https://www.youtube.com/watch?v={videoId}"
        # Используем более быстрые настройки
        ydl_opts = {
            'format': 'bestaudio[ext=webm]/bestaudio',
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 8,
            'nocheckcertificate': True,
            'http_chunk_size': 1048576,  # 1MB chunks
            'retries': 3,
            'fragment_retries': 3,
            'skip_unavailable_fragments': True,
            'continuedl': False,
            'ignoreerrors': True,
            'no_color': True,
            'verbose': False
        }
        
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            audio_url = info['url']
            
            # Сохраняем в кэш
            audio_url_cache[videoId] = {
                'url': audio_url,
                'timestamp': time.time(),
                'duration': info.get('duration', 0),
                'title': info.get('title', ''),
                'artist': info.get('artist', '')
            }
            
            # Ограничиваем размер кэша
            if len(audio_url_cache) > CACHE_MAX_SIZE:
                audio_url_cache.popitem(last=False)
            
            print(f"Кэширован аудио для: {videoId}")
            return audio_url
    except Exception as e:
        print(f"Ошибка получения аудио-ссылки для {videoId}: {e}")
        raise

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

def fetch_yt_home_data():
    """Получаем данные для главной из Aurora """
    global yt_home_cache, yt_home_cache_time
    
    try:
        print("Загрузка данных с Aurora ...")
        
        home_data = {
            'featured_playlists': [],
            'top_charts': [],
            'new_releases': [],
            'mood_playlists': [],
            'trending': []
        }
        
        # 1. Получаем популярные плейлисты (фичеред)
        try:
            # Пробуем получить домашнюю страницу
            home = ytmusic.get_home(limit=20)
            
            # Ищем секции с плейлистами
            for section in home:
                if 'contents' in section:
                    for item in section['contents'][:5]:
                        if 'playlistId' in item and item.get('playlistId'):
                            home_data['featured_playlists'].append({
                                'id': item['playlistId'],
                                'title': item.get('title', 'Плейлист'),
                                'subtitle': item.get('subtitle', ''),
                                'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                'type': 'playlist'
                            })
                            if len(home_data['featured_playlists']) >= 6:
                                break
                if len(home_data['featured_playlists']) >= 6:
                    break
        except Exception as e:
            print(f"Ошибка получения фичеред плейлистов: {e}")
            # Альтернативный вариант - поиск популярных плейлистов
            try:
                search_queries = ['top hits', 'popular music', 'viral hits', 'trending now']
                for query in search_queries:
                    results = ytmusic.search(query, filter='playlists', limit=2)
                    for item in results:
                        if 'browseId' in item and item.get('browseId'):
                            home_data['featured_playlists'].append({
                                'id': item['browseId'],
                                'title': item.get('title', query.title()),
                                'subtitle': f'Популярные треки',
                                'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                'type': 'playlist'
                            })
                    if len(home_data['featured_playlists']) >= 6:
                        break
            except Exception as e2:
                print(f"Альтернативный поиск также не удался: {e2}")
        
        # 2. Получаем чарты
        try:
            charts = ytmusic.get_charts(country='RU')
            if charts:
                # Топ треки
                if 'tracks' in charts and charts['tracks']:
                    for track in charts['tracks'][:10]:
                        if 'videoId' in track:
                            home_data['top_charts'].append({
                                'id': track['videoId'],
                                'title': track.get('title', 'Трек'),
                                'artist': track.get('artists', [{'name': 'Неизвестный артист'}])[0]['name'],
                                'position': track.get('position', 0),
                                'thumbnail': track.get('thumbnails', [{}])[-1].get('url') if track.get('thumbnails') else None,
                                'type': 'track'
                            })
                
                # Топ плейлисты чартов
                if 'playlists' in charts and charts['playlists']:
                    for i, playlist in enumerate(charts['playlists'][:3]):
                        home_data['top_charts'].append({
                            'id': playlist.get('playlistId'),
                            'title': playlist.get('title', f'Топ-чарт #{i+1}'),
                            'subtitle': 'Официальные чарты',
                            'thumbnail': playlist.get('thumbnails', [{}])[-1].get('url') if playlist.get('thumbnails') else None,
                            'type': 'playlist'
                        })
        except Exception as e:
            print(f"Ошибка получения чартов: {e}")
        
        # 3. Получаем новые релизы
        try:
            new_releases = ytmusic.get_new_releases(limit=15)
            for release in new_releases:
                if 'videoId' in release:
                    home_data['new_releases'].append({
                        'id': release['videoId'],
                        'title': release.get('title', 'Новый релиз'),
                        'artist': ', '.join([a['name'] for a in release.get('artists', [{'name': 'Неизвестный артист'}])]),
                        'duration': release.get('duration_seconds', 0),
                        'thumbnail': release.get('thumbnails', [{}])[-1].get('url') if release.get('thumbnails') else None,
                        'type': 'track'
                    })
        except Exception as e:
            print(f"Ошибка получения новых релизов: {e}")
        
        # 4. Плейлисты по настроению
        try:
            moods = [
                ('chill', 'Расслабление', 'cloud-moon'),
                ('workout', 'Тренировка', 'lightning-charge'),
                ('party', 'Вечеринка', 'balloon'),
                ('focus', 'Фокус', 'bullseye'),
                ('sleep', 'Для сна', 'moon'),
                ('energy', 'Энергия', 'lightning')
            ]
            
            for mood_key, mood_name, icon in moods:
                try:
                    results = ytmusic.search(f'{mood_key} music playlist', filter='playlists', limit=1)
                    if results and results[0].get('browseId'):
                        item = results[0]
                        home_data['mood_playlists'].append({
                            'id': item['browseId'],
                            'title': mood_name,
                            'subtitle': f'Музыка для {mood_key}',
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                            'icon': icon,
                            'type': 'playlist'
                        })
                except:
                    continue
                
                if len(home_data['mood_playlists']) >= 6:
                    break
        except Exception as e:
            print(f"Ошибка получения плейлистов по настроению: {e}")
        
        # 5. Тренды
        try:
            # Поиск трендовых запросов
            trending_queries = ['viral hits 2024', 'trending on Aurora', 'tiktok viral']
            for query in trending_queries:
                results = ytmusic.search(query, filter='songs', limit=5)
                for item in results:
                    if 'videoId' in item:
                        home_data['trending'].append({
                            'id': item['videoId'],
                            'title': item.get('title', 'Тренд'),
                            'artist': ', '.join([a['name'] for a in item.get('artists', [{'name': 'Неизвестный артист'}])]),
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                            'type': 'track'
                        })
                if len(home_data['trending']) >= 10:
                    break
        except Exception as e:
            print(f"Ошибка получения трендов: {e}")
        
        # Удаляем дубликаты
        seen_ids = set()
        for key in home_data:
            unique_items = []
            for item in home_data[key]:
                if item['id'] not in seen_ids:
                    seen_ids.add(item['id'])
                    unique_items.append(item)
            home_data[key] = unique_items[:12]  # Ограничиваем количество
        
        yt_home_cache = home_data
        yt_home_cache_time = datetime.now()
        
        print(f"Загружено: {len(home_data['featured_playlists'])} плейлистов, "
              f"{len(home_data['new_releases'])} релизов, "
              f"{len(home_data['top_charts'])} чартов")
        
        return home_data
        
    except Exception as e:
        print(f"Критическая ошибка при загрузке данных главной: {e}")
        return {
            'featured_playlists': [],
            'top_charts': [],
            'new_releases': [],
            'mood_playlists': [],
            'trending': []
        }

def get_yt_home_data():
    """Получаем данные для главной с кэшированием"""
    global yt_home_cache, yt_home_cache_time
    
    if (yt_home_cache is None or 
        yt_home_cache_time is None or 
        (datetime.now() - yt_home_cache_time).seconds > CACHE_DURATION):
        
        # Запускаем в фоновом потоке, чтобы не блокировать
        thread = threading.Thread(target=fetch_yt_home_data)
        thread.daemon = True
        thread.start()
        
        # Если кэш пустой, ждем первую загрузку
        if yt_home_cache is None:
            return fetch_yt_home_data()
    
    return yt_home_cache

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
        print(f"Ошибка поиска Aurora: {e}")
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
    """Стриминг аудио с YouTube с кэшированием"""
    try:
        audio_url = get_audio_url(videoId)
        return redirect(audio_url)
    except Exception as e:
        print(f"Ошибка стриминга для {videoId}: {e}")
        abort(404)

@app.route('/prefetch_yt/<videoId>')
def prefetch_yt(videoId):
    """Предзагрузка аудио-ссылки в фоне"""
    try:
        # Если уже в кэше и не просрочена, то ничего не делаем
        if videoId in audio_url_cache:
            entry = audio_url_cache[videoId]
            if time.time() - entry['timestamp'] < CACHE_EXPIRE_SECONDS:
                return jsonify({'status': 'already_cached'})
        
        # Запускаем в фоновом потоке
        def fetch():
            try:
                get_audio_url(videoId)
                print(f"Предзагружено: {videoId}")
            except Exception as e:
                print(f"Ошибка предзагрузки {videoId}: {e}")
        
        thread = threading.Thread(target=fetch)
        thread.daemon = True
        thread.start()
        
        return jsonify({'status': 'prefetching'})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)})

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
                    lyrics = re.sub(r'<.*?>', '', lyrics) 
                    lyrics = re.sub(r'\[.*?\]', '', lyrics) 
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

# Новые эндпоинты для главной страницы с YouTube Music

@app.route('/yt_home_data')
def yt_home_data():
    """API для получения данных главной страницы"""
    data = get_yt_home_data()
    return jsonify(data)

@app.route('/yt_playlist/<playlist_id>')
def yt_playlist(playlist_id):
    """Получение информации о плейлисте  Aurora"""
    try:
        playlist = ytmusic.get_playlist(playlist_id, limit=50)
        
        tracks = []
        for item in playlist.get('tracks', []):
            if 'videoId' in item:
                tracks.append({
                    'videoId': item['videoId'],
                    'title': item.get('title', 'Без названия'),
                    'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                    'duration': item.get('duration_seconds', 0),
                    'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None
                })
        
        return jsonify({
            'success': True,
            'title': playlist.get('title', 'Плейлист'),
            'author': playlist.get('author', {}).get('name', 'YouTube Music'),
            'description': playlist.get('description', ''),
            'trackCount': playlist.get('trackCount', 0),
            'duration': playlist.get('duration', ''),
            'thumbnail': playlist.get('thumbnails', [{}])[-1].get('url') if playlist.get('thumbnails') else None,
            'tracks': tracks
        })
    except Exception as e:
        print(f"Ошибка получения плейлиста: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/yt_artist/<artist_id>')
def yt_artist(artist_id):
    """Получение информации об артисте"""
    try:
        artist = ytmusic.get_artist(artist_id)
        
        # Получаем популярные треки артиста
        top_tracks = []
        if 'songs' in artist and 'browseId' in artist['songs']:
            songs_playlist = ytmusic.get_playlist(artist['songs']['browseId'], limit=10)
            for item in songs_playlist.get('tracks', []):
                if 'videoId' in item:
                    top_tracks.append({
                        'videoId': item['videoId'],
                        'title': item.get('title', 'Трек'),
                        'duration': item.get('duration_seconds', 0),
                        'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None
                    })
        
        return jsonify({
            'success': True,
            'name': artist.get('name', 'Артист'),
            'description': artist.get('description', ''),
            'thumbnail': artist.get('thumbnails', [{}])[-1].get('url') if artist.get('thumbnails') else None,
            'subscribers': artist.get('subscribers', ''),
            'top_tracks': top_tracks
        })
    except Exception as e:
        print(f"Ошибка получения артиста: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/refresh_home_cache')
def refresh_home_cache():
    """Принудительное обновление кэша главной страницы"""
    try:
        fetch_yt_home_data()
        return jsonify({
            'success': True,
            'message': 'Кэш главной страницы обновлен'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/yt_suggestions')
def yt_suggestions():
    """Получение рекомендаций на основе прослушивания"""
    try:
        # Получаем 5 случайных популярных треков
        results = ytmusic.search('popular music', filter='songs', limit=20)
        suggestions = []
        
        import random
        random.shuffle(results)
        
        for item in results[:10]:
            if 'videoId' in item:
                suggestions.append({
                    'videoId': item['videoId'],
                    'title': item.get('title', 'Трек'),
                    'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                    'duration': item.get('duration_seconds', 0),
                    'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None
                })
        
        return jsonify({
            'success': True,
            'suggestions': suggestions
        })
    except Exception as e:
        print(f"Ошибка получения рекомендаций: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/cache_info')
def cache_info():
    """Информация о кэше"""
    return jsonify({
        'audio_cache_size': len(audio_url_cache),
        'audio_cache_keys': list(audio_url_cache.keys()),
        'home_cache_time': str(yt_home_cache_time) if yt_home_cache_time else None,
        'home_cache_has_data': yt_home_cache is not None
    })

if __name__ == '__main__':
    # Создаем папки если их нет
    os.makedirs(MUSIC_FOLDER, exist_ok=True)
    
    # Предзагрузка данных для главной страницы
    print("Предзагрузка данных Aurora для главной страницы...")
    fetch_yt_home_data()
    
    app.run(debug=True, port=8000, threaded=True)
