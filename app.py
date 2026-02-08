from flask import Flask, render_template, send_from_directory, jsonify, abort, request, redirect, session, send_file
import os
from mutagen import File as MutagenFile
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
from mutagen.id3 import TALB, TPE1, TIT2  
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
from io import BytesIO
import zipfile
import random
import sqlite3
from contextlib import closing
import io
from collections import Counter
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

app = Flask(__name__)
app.secret_key = 'MoshinCompany'  

MUSIC_FOLDER = 'music'
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.flac', '.m4a'}
ytmusic = YTMusic()

# Кэш для данных главной страницы
yt_home_cache = None
yt_home_cache_time = None
CACHE_DURATION = 1800  # 30 минут

# Кэш для предзагруженных аудио-ссылок
audio_url_cache = OrderedDict()
CACHE_MAX_SIZE = 30
CACHE_EXPIRE_SECONDS = 21600  

# Кэш для радио
radio_cache: Dict[str, Dict] = {}
RADIO_CACHE_DURATION = 3600  


# Определяем абсолютный путь к папке music
BASE_DIR = Path(__file__).parent.absolute()
MUSIC_FOLDER = os.path.join(BASE_DIR, 'music')

# Инициализация базы данных
def init_db():
    with closing(sqlite3.connect('music_player.db')) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS play_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT,
                track_type TEXT,
                title TEXT,
                artist TEXT,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT UNIQUE,
                track_type TEXT,
                title TEXT,
                artist TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER,
                track_id TEXT,
                track_type TEXT,
                position INTEGER,
                FOREIGN KEY (playlist_id) REFERENCES playlists (id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT,
                tag TEXT,
                UNIQUE(track_id, tag)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS lyrics_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist TEXT,
                title TEXT,
                lyrics TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(artist, title)
            )
        ''')
        
        # Таблицы для радио
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS radio_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seed_track_id TEXT,
                seed_track_type TEXT,
                station_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS radio_plays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                track_id TEXT,
                track_type TEXT,
                title TEXT,
                artist TEXT,
                liked INTEGER DEFAULT 0,
                banned INTEGER DEFAULT 0,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES radio_sessions (id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS radio_stats (
                track_id TEXT,
                track_type TEXT,
                plays INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                skips INTEGER DEFAULT 0,
                last_played TIMESTAMP,
                PRIMARY KEY (track_id, track_type)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS radio_seeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT,
                track_type TEXT,
                title TEXT,
                artist TEXT,
                times_used INTEGER DEFAULT 0,
                last_used TIMESTAMP
            )
        ''')
        
        conn.commit()

init_db()

# ==========  ФУНКЦИИ ИЗ ПЕРВОГО  ==========


# Замените существующую инициализацию папок в конце файла:
if __name__ == '__main__':
    # Создаем папки если их нет
    os.makedirs(MUSIC_FOLDER, exist_ok=True)
    # Проверяем права доступа к папке
    try:
        test_file = os.path.join(MUSIC_FOLDER, 'test_write.txt')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        print(f"✓ Папка {MUSIC_FOLDER} доступна для записи")
    except Exception as e:
        print(f"✗ Ошибка доступа к папке {MUSIC_FOLDER}: {e}")
        print(f"Создайте папку 'music' вручную: mkdir {MUSIC_FOLDER}")



def fix_file_paths():
    # """Исправляет пути к файлам после скачивания с GitHub"""
    try:
        # Ищем все файлы в различных возможных местах
        possible_locations = [
            'music',
            './music',
            '../music',
            os.path.join(os.path.dirname(__file__), 'music'),
            os.path.join(os.getcwd(), 'music')
        ]
        
        for location in possible_locations:
            if os.path.exists(location):
                print(f"Найдена папка music: {location}")
                # Копируем файлы в правильную папку
                for file in os.listdir(location):
                    if os.path.splitext(file)[1].lower() in ALLOWED_EXTENSIONS:
                        src = os.path.join(location, file)
                        dst = os.path.join(MUSIC_FOLDER, file)
                        if not os.path.exists(dst):
                            shutil.copy2(src, dst)
                            print(f"Скопирован: {file}")
                break
    except Exception as e:
        print(f"Ошибка при исправлении путей: {e}")
def get_audio_url(videoId):
    """Получаем аудио-ссылку для videoId с кэшированием"""
    # Проверяем кэш
    if videoId in audio_url_cache:
        entry = audio_url_cache[videoId]
        if time.time() - entry['timestamp'] < CACHE_EXPIRE_SECONDS:
            audio_url_cache.move_to_end(videoId)
            return entry['url']
        else:
            del audio_url_cache[videoId]
    
    # Если нет в кэше, получаем ссылку
    try:
        url = f"https://www.youtube.com/watch?v={videoId}"
        
        # Улучшенные настройки для yt-dlp
        ydl_opts = {
            'format': 'bestaudio[ext=webm]/bestaudio/best',
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 10,
            'nocheckcertificate': True,
            'retries': 5,
            'fragment_retries': 5,
            'skip_unavailable_fragments': True,
            'continuedl': False,
            'ignoreerrors': True,
            'no_color': True,
            'verbose': False,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'web'],
                    'player_skip': ['webpage', 'configs'],
                }
            },
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        }
        
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Пробуем разные форматы
            if 'url' in info:
                audio_url = info['url']
            elif 'formats' in info:
                # Ищем подходящий аудио формат
                for fmt in info['formats']:
                    if fmt.get('vcodec') == 'none' and fmt.get('acodec') != 'none':
                        if 'url' in fmt:
                            audio_url = fmt['url']
                            break
                else:
                    # Если не нашли, берем первую доступную ссылку
                    audio_url = info['formats'][0]['url']
            else:
                raise Exception("Не удалось получить аудио-ссылку")
            
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
        
        # Пробуем альтернативный метод через pafy (если установлен)
        try:
            import pafy
            video = pafy.new(videoId)
            best_audio = video.getbestaudio()
            audio_url = best_audio.url
            
            # Сохраняем в кэш
            audio_url_cache[videoId] = {
                'url': audio_url,
                'timestamp': time.time(),
                'duration': video.length,
                'title': video.title,
                'artist': video.author
            }
            
            return audio_url
        except ImportError:
            print("pafy не установлен")
        except Exception as e2:
            print(f"Ошибка pafy: {e2}")
        
        raise



def fetch_yt_home_data():
    """Получаем данные для главной из YouTube Music"""
    global yt_home_cache, yt_home_cache_time
    
    try:
        print("Загрузка данных с YouTube Music...")
        
        home_data = {
            'featured_playlists': [],
            'top_charts': [],
            'new_releases': [],
            'mood_playlists': [],
            'trending': [],
            'popular_artists': []
        }
        
        # 1. Получаем популярные плейлисты 
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
            charts = ytmusic.get_charts(country='US')
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
        
        # 3. Получаем новые/популярные треки
        try:
            # Используем поиск популярных треков вместо get_new_releases
            popular_queries = [
                'популярная музыка 2026',
                'новинки музыки 2026', 
                'хиты 2026',
                'top hits 2026',
                'trending music 2026',
                'billboard hot 100',
                'spotify top 50'
            ]
            
            new_releases = []
            
            for query in popular_queries:
                try:
                    results = ytmusic.search(query, filter="songs", limit=10)
                    for item in results:
                        if 'videoId' in item and item['videoId'] not in [track['id'] for track in new_releases]:
                            # Проверяем, что у трека есть нормальные данные
                            if item.get('title') and item.get('artists'):
                                new_releases.append({
                                    'id': item['videoId'],
                                    'title': item.get('title', 'Новый трек'),
                                    'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                                    'duration': item.get('duration_seconds', 0),
                                    'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                    'type': 'track'
                                })
                            
                            if len(new_releases) >= 15:
                                break
                except:
                    continue
                    
                if len(new_releases) >= 15:
                    break
            
            # Если нашли меньше 15 треков, добавляем из чартов
            if len(new_releases) < 15:
                try:
                    charts = ytmusic.get_charts(country='US')
                    if charts and 'tracks' in charts:
                        for track in charts['tracks']:
                            if 'videoId' in track and track['videoId'] not in [t['id'] for t in new_releases]:
                                new_releases.append({
                                    'id': track['videoId'],
                                    'title': track.get('title', 'Популярный трек'),
                                    'artist': ', '.join([a.get('name', '') for a in track.get('artists', [])]),
                                    'duration': track.get('duration_seconds', 0),
                                    'thumbnail': track.get('thumbnails', [{}])[-1].get('url') if track.get('thumbnails') else None,
                                    'type': 'track'
                                })
                                
                            if len(new_releases) >= 15:
                                break
                except:
                    pass
            
            home_data['new_releases'] = new_releases[:15]
            
        except Exception as e:
            print(f"Ошибка получения популярных треков: {e}")
            home_data['new_releases'] = []
        
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
                    # Используем более популярные запросы
                    query = f'{mood_key} hits 2026 playlist'
                    results = ytmusic.search(query, filter='playlists', limit=2)
                    if results:
                        for item in results:
                            if 'browseId' in item and item.get('browseId'):
                                home_data['mood_playlists'].append({
                                    'id': item['browseId'],
                                    'title': mood_name,
                                    'subtitle': f'Лучшие {mood_key} треки',
                                    'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                    'icon': icon,
                                    'type': 'playlist'
                                })
                                break
                except:
                    continue
                
                if len(home_data['mood_playlists']) >= 6:
                    break
        except Exception as e:
            print(f"Ошибка получения плейлистов по настроению: {e}")
        
        # 5. Тренды и популярные
        try:
            trending_queries = [
                'viral hits 2026',
                'trending tiktok songs',
                'popular on youtube',
                'music chart top 10',
                'billboard hot 100'
            ]
            
            trending_tracks = []
            
            for query in trending_queries:
                results = ytmusic.search(query, filter="songs", limit=8)
                for item in results:
                    if 'videoId' in item and item['videoId'] not in [t['id'] for t in trending_tracks]:
                        trending_tracks.append({
                            'id': item['videoId'],
                            'title': item.get('title', 'Тренд'),
                            'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                            'type': 'track'
                        })
                
                if len(trending_tracks) >= 12:
                    break
            
            home_data['trending'] = trending_tracks[:12]
            
        except Exception as e:
            print(f"Ошибка получения трендов: {e}")
            home_data['trending'] = []
        
        # 6. Популярные артисты
        try:
            artist_queries = [
                'popular artists',
                'top singers',
                'famous musicians',
                'best artists 2026'
            ]
            
            popular_artists = []
            
            for query in artist_queries:
                results = ytmusic.search(query, filter="artists", limit=5)
                for item in results:
                    if 'browseId' in item and item['browseId'] not in [a['id'] for a in popular_artists]:
                        popular_artists.append({
                            'id': item['browseId'],
                            'title': item.get('title', 'Артист'),
                            'subtitle': item.get('subtitle', ''),
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                            'type': 'artist'
                        })
                
                if len(popular_artists) >= 6:
                    break
            
            home_data['popular_artists'] = popular_artists[:6]
            
        except Exception as e:
            print(f"Ошибка получения популярных артистов: {e}")
            home_data['popular_artists'] = []
        
        # Удаляем дубликаты
        seen_ids = set()
        for key in home_data:
            if key != 'popular_artists':  # Для артистов другая логика
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
              f"{len(home_data['top_charts'])} чартов, "
              f"{len(home_data['popular_artists'])} артистов")
        
        return home_data
        
    except Exception as e:
        print(f"Критическая ошибка при загрузке данных главной: {e}")
        return {
            'featured_playlists': [],
            'top_charts': [],
            'new_releases': [],
            'mood_playlists': [],
            'trending': [],
            'popular_artists': []
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



def fix_file_paths():
    """Исправляет пути к файлам после скачивания с GitHub"""
    try:
        # Ищем все файлы в различных возможных местах
        possible_locations = [
            'music',
            './music',
            '../music',
            os.path.join(os.path.dirname(__file__), 'music'),
            os.path.join(os.getcwd(), 'music')
        ]
        
        for location in possible_locations:
            if os.path.exists(location):
                print(f"Найдена папка music: {location}")
                # Копируем файлы в правильную папку
                for file in os.listdir(location):
                    if os.path.splitext(file)[1].lower() in ALLOWED_EXTENSIONS:
                        src = os.path.join(location, file)
                        dst = os.path.join(MUSIC_FOLDER, file)
                        if not os.path.exists(dst):
                            shutil.copy2(src, dst)
                            print(f"Скопирован: {file}")
                break
    except Exception as e:
        print(f"Ошибка при исправлении путей: {e}")


def get_cached_lyrics(title, artist):
    """Проверяем кэш текстов песен"""
    try:
        lyrics_cache_file = 'lyrics_cache.json'
        if os.path.exists(lyrics_cache_file):
            with open(lyrics_cache_file, 'r', encoding='utf-8') as f:
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
                cache = json.load(f)
        
        cache_key = f"{artist.lower()}|{title.lower()}"
        cache[cache_key] = lyrics
        
        with open(lyrics_cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except:
        pass


    # Ищем точное совпадение
    for (song_title, song_artist), lyrics in popular_lyrics.items():
        if song_title.lower() in title.lower() and song_artist.lower() in artist.lower():
            return lyrics
    
    # Ищем частичное совпадение
    for (song_title, song_artist), lyrics in popular_lyrics.items():
        if song_title.lower() in title.lower() or title.lower() in song_title.lower():
            return f"Текст песни похожей на '{song_title}' - {song_artist}:\n\n{lyrics}"
    
    return None

# ========== НОВЫЕ ФУНКЦИИ ==========

def analyze_audio_mood(audio_path):
    """Анализ настроения трека (базовый анализ)"""
    try:
        audio = MutagenFile(audio_path)
        if not audio:
            return "unknown"
        
        # Простая эвристика для определения настроения
        duration = audio.info.length
        
        # Проверяем теги
        mood_tags = ['happy', 'sad', 'energetic', 'relax', 'party', 'chill']
        tags = []
        
        if hasattr(audio, 'tags'):
            for tag in audio.tags.values():
                if hasattr(tag, 'text'):
                    for text in tag.text:
                        # Используем безопасное преобразование
                        text_str = safe_tag_value(text)
                        text_lower = text_str.lower()
                        for mood in mood_tags:
                            if mood in text_lower:
                                tags.append(mood)
        
        if tags:
            return max(set(tags), key=tags.count)
        
        # По продолжительности (очень приблизительно)
        if duration < 180:  # менее 3 минут
            return "energetic"
        elif duration > 300:  # более 5 минут
            return "relax"
        else:
            return "chill"
            
    except Exception as e:
        print(f"Ошибка анализа настроения: {e}")
        return "unknown"

def create_smart_playlist(name, criteria):
    """Создание умного плейлиста на основе критериев"""
    tracks = get_local_tracks()
    smart_tracks = []
    
    for track in tracks:
        matches = 0
        
        if 'genre' in criteria and criteria['genre'].lower() in track.get('genre', '').lower():
            matches += 1
        
        if 'year' in criteria:
            try:
                if 'date' in track:
                    track_year = int(track['date'][:4]) if track['date'] else 0
                    criteria_year = int(criteria['year'])
                    if abs(track_year - criteria_year) <= 2:
                        matches += 1
            except:
                pass
        
        if 'mood' in criteria:
            track_mood = analyze_audio_mood(os.path.join(MUSIC_FOLDER, track['filename']))
            if track_mood == criteria['mood']:
                matches += 1
        
        if matches >= (len(criteria) // 2 + 1):
            smart_tracks.append(track)
    
    return {
        'name': name,
        'criteria': criteria,
        'tracks': smart_tracks,
        'count': len(smart_tracks)
    }

def export_to_m3u(playlist_id, filename='playlist.m3u'):
    """Экспорт плейлиста в M3U формат"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            cursor.execute('SELECT name FROM playlists WHERE id = ?', (playlist_id,))
            playlist = cursor.fetchone()
            
            if not playlist:
                return None
            
            cursor.execute('''
                SELECT track_id, track_type, title, artist 
                FROM playlist_tracks 
                WHERE playlist_id = ? 
                ORDER BY position
            ''', (playlist_id,))
            
            tracks = cursor.fetchall()
            
            m3u_content = f"#EXTM3U\n#PLAYLIST:{playlist[0]}\n\n"
            
            for track in tracks:
                track_id, track_type, title, artist = track
                
                if track_type == 'local':
                    filepath = os.path.join(MUSIC_FOLDER, track_id)
                    if os.path.exists(filepath):
                        duration = 0
                        try:
                            audio = MutagenFile(filepath)
                            duration = int(audio.info.length) if audio.info else 0
                        except:
                            pass
                        
                        m3u_content += f"#EXTINF:{duration},{artist} - {title}\n"
                        m3u_content += f"{filepath}\n"
            
            # Сохраняем в файл
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(m3u_content)
            
            return filename
            
    except Exception as e:
        print(f"Ошибка экспорта в M3U: {e}")
        return None

def import_from_m3u(m3u_file):
    """Импорт плейлиста из M3U файла"""
    try:
        with open(m3u_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.split('\n')
        playlist_name = "Импортированный плейлист"
        tracks = []
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            if line.startswith('#PLAYLIST:'):
                playlist_name = line.split(':')[1]
            elif line.startswith('#EXTINF:'):
                # Извлекаем информацию о треке
                parts = line.split(',', 1)
                if len(parts) > 1:
                    artist_title = parts[1]
                    # Пытаемся разделить артиста и название
                    if ' - ' in artist_title:
                        artist, title = artist_title.split(' - ', 1)
                    else:
                        artist = "Неизвестный артист"
                        title = artist_title
                    
                    # Следующая строка - путь к файлу
                    if i + 1 < len(lines):
                        filepath = lines[i + 1].strip()
                        if os.path.exists(filepath):
                            tracks.append({
                                'filepath': filepath,
                                'title': title,
                                'artist': artist
                            })
                        i += 1
            i += 1
        
        return {
            'name': playlist_name,
            'tracks': tracks,
            'count': len(tracks)
        }
        
    except Exception as e:
        print(f"Ошибка импорта из M3U: {e}")
        return None

def get_listening_stats():
    """Получение статистики прослушивания"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Самые прослушиваемые треки
            cursor.execute('''
                SELECT track_id, track_type, COUNT(*) as play_count 
                FROM play_history 
                GROUP BY track_id 
                ORDER BY play_count DESC 
                LIMIT 10
            ''')
            top_tracks = cursor.fetchall()
            
            # Часы прослушивания по дням
            cursor.execute('''
                SELECT DATE(played_at) as date, COUNT(*) as plays 
                FROM play_history 
                GROUP BY DATE(played_at) 
                ORDER BY date DESC 
                LIMIT 7
            ''')
            daily_stats = cursor.fetchall()
            
            # Любимые артисты
            cursor.execute('''
                SELECT artist, COUNT(*) as count 
                FROM play_history 
                WHERE artist IS NOT NULL 
                GROUP BY artist 
                ORDER BY count DESC 
                LIMIT 5
            ''')
            top_artists = cursor.fetchall()
            
            # Общее время прослушивания (приблизительно)
            cursor.execute('SELECT COUNT(*) FROM play_history')
            total_plays = cursor.fetchone()[0]
            total_time = total_plays * 3  # Предполагаем среднюю длину 3 минуты
            
            return {
                'top_tracks': [
                    {
                        'track_id': track[0],
                        'track_type': track[1],
                        'plays': track[2]
                    } for track in top_tracks
                ],
                'daily_stats': [
                    {
                        'date': stat[0],
                        'plays': stat[1]
                    } for stat in daily_stats
                ],
                'top_artists': [
                    {
                        'artist': artist[0],
                        'count': artist[1]
                    } for artist in top_artists
                ],
                'total_plays': total_plays,
                'estimated_hours': total_time / 60
            }
            
    except Exception as e:
        print(f"Ошибка получения статистики: {e}")
        return {}

def get_recommendations_based_on_history():
    """Получение рекомендаций на основе истории прослушивания"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Получаем любимых артистов
            cursor.execute('''
                SELECT artist, COUNT(*) as count 
                FROM play_history 
                WHERE artist IS NOT NULL AND artist != 'Неизвестный артист'
                GROUP BY artist 
                ORDER BY count DESC 
                LIMIT 3
            ''')
            favorite_artists = cursor.fetchall()
            
            recommendations = []
            
            # Ищем похожую музыку на YouTube
            for artist, count in favorite_artists:
                try:
                    search_query = f"{artist[0]} music"
                    results = ytmusic.search(search_query, filter="songs", limit=5)
                    
                    for item in results:
                        if 'videoId' in item:
                            recommendations.append({
                                'videoId': item['videoId'],
                                'title': item.get('title', 'Трек'),
                                'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                                'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                'reason': f'Похоже на {artist[0]}'
                            })
                except:
                    continue
            
            # Удаляем дубликаты
            unique_recs = []
            seen_ids = set()
            for rec in recommendations:
                if rec['videoId'] not in seen_ids:
                    seen_ids.add(rec['videoId'])
                    unique_recs.append(rec)
            
            return unique_recs[:10]
            
    except Exception as e:
        print(f"Ошибка получения рекомендаций: {e}")
        return []

def create_mashup(track1_path, track2_path, output_name="mashup.mp3"):
    """Создание машапа из двух треков (базовая версия)"""
    try:
        output_path = os.path.join(MUSIC_FOLDER, output_name)
        
        # Используем ffmpeg для смешивания аудио
        cmd = [
            'ffmpeg',
            '-i', track1_path,
            '-i', track2_path,
            '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest',
            '-ac', '2',
            '-ab', '192k',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        
        if result.returncode == 0 and os.path.exists(output_path):
            return output_path
            
    except Exception as e:
        print(f"Ошибка создания машапа: {e}")
    return None

def analyze_bpm(audio_path):
    """Анализ BPM (темп) трека"""
    try:
        # Пытаемся определить по имени файла
        filename = os.path.basename(audio_path)
        bpm_match = re.search(r'(\d+)\s*bpm', filename, re.IGNORECASE)
        if bpm_match:
            return int(bpm_match.group(1))
        
        # Проверяем теги ID3
        audio = MutagenFile(audio_path)
        if audio and hasattr(audio, 'tags'):
            for tag in audio.tags.values():
                if hasattr(tag, 'text'):
                    for text in tag.text:
                        # Преобразуем в строку, если это не строка
                        if not isinstance(text, str):
                            try:
                                text = str(text)
                            except:
                                continue
                        
                        # Ищем BPM в тексте тега
                        text_lower = text.lower()
                        if 'bpm' in text_lower:
                            try:
                                # Ищем числа в тексте
                                numbers = re.findall(r'\d+', text)
                                if numbers:
                                    return int(numbers[0])
                            except:
                                pass
        
        # Альтернативный метод: анализируем тег TBPM (стандартный тег для BPM)
        try:
            if hasattr(audio, 'tags'):
                # Пробуем получить BPM из стандартных тегов
                for tag_key in audio.tags:
                    if 'BPM' in tag_key.upper() or 'TEMPO' in tag_key.upper():
                        tag_value = audio.tags[tag_key]
                        if hasattr(tag_value, 'text'):
                            for text in tag_value.text:
                                if not isinstance(text, str):
                                    text = str(text)
                                try:
                                    bpm = int(re.search(r'\d+', text).group())
                                    return bpm
                                except:
                                    pass
        except:
            pass
        
        return None
        
    except Exception as e:
        print(f"Ошибка анализа BPM: {e}")
        return None

def get_similar_tracks(track_id, track_type='local'):
    """Поиск похожих треков"""
    try:
        if track_type == 'local':
            # Анализируем локальный трек
            track_path = os.path.join(MUSIC_FOLDER, track_id)
            if not os.path.exists(track_path):
                return []
            
            # Получаем информацию о треке
            audio = MutagenFile(track_path)
            title = ""
            artist = ""
            
            try:
                tag = EasyID3(track_path)
                title = tag.get('title', [''])[0]
                artist = tag.get('artist', [''])[0]
            except:
                pass
            
            # Ищем похожие по названию и артисту
            similar = []
            local_tracks = get_local_tracks()
            
            for track in local_tracks:
                if track['filename'] != track_id:
                    # Простая эвристика схожести
                    similarity_score = 0
                    
                    if artist and track['artist']:
                        if artist.lower() in track['artist'].lower() or track['artist'].lower() in artist.lower():
                            similarity_score += 3
                    
                    if title and track['title']:
                        common_words = set(title.lower().split()) & set(track['title'].lower().split())
                        similarity_score += len(common_words)
                    
                    if similarity_score > 0:
                        similar.append({
                            'track': track,
                            'score': similarity_score
                        })
            
            # Сортируем по схожести
            similar.sort(key=lambda x: x['score'], reverse=True)
            return [item['track'] for item in similar[:5]]
        
        elif track_type == 'youtube':
            # Используем YouTube API для поиска похожих
            try:
                results = ytmusic.get_song_related(track_id)
                similar = []
                
                for item in results[:5]:
                    if 'videoId' in item:
                        similar.append({
                            'videoId': item['videoId'],
                            'title': item.get('title', 'Трек'),
                            'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None
                        })
                
                return similar
            except:
                return []
                
    except Exception as e:
        print(f"Ошибка поиска похожих треков: {e}")
        return []

# ========== ФУНКЦИИ ДЛЯ РАДИО ==========

def save_radio_seed(track_id: str, track_type: str, title: str, artist: str):
    """Сохранение трека как основы для радио"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Проверяем, существует ли уже
            cursor.execute(
                'SELECT id FROM radio_seeds WHERE track_id = ? AND track_type = ?',
                (track_id, track_type)
            )
            
            if cursor.fetchone():
                # Обновляем счетчик использования
                cursor.execute('''
                    UPDATE radio_seeds 
                    SET times_used = times_used + 1, last_used = CURRENT_TIMESTAMP
                    WHERE track_id = ? AND track_type = ?
                ''', (track_id, track_type))
            else:
                # Добавляем новую запись
                cursor.execute('''
                    INSERT INTO radio_seeds (track_id, track_type, title, artist, times_used, last_used)
                    VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                ''', (track_id, track_type, title, artist))
            
            conn.commit()
    except Exception as e:
        print(f"Ошибка сохранения радио-основы: {e}")

def get_popular_radio_seeds(limit: int = 10):
    """Получение популярных основ для радио"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT track_id, track_type, title, artist, times_used
                FROM radio_seeds 
                ORDER BY times_used DESC 
                LIMIT ?
            ''', (limit,))
            
            seeds = []
            for row in cursor.fetchall():
                seeds.append({
                    'track_id': row[0],
                    'track_type': row[1],
                    'title': row[2],
                    'artist': row[3],
                    'times_used': row[4]
                })
            
            return seeds
    except Exception as e:
        print(f"Ошибка получения популярных основ: {e}")
        return []

def create_radio_from_youtube(video_id: str, limit: int = 30) -> Dict[str, Any]:
    """Создание радио на основе YouTube трека"""
    try:
        # Проверяем кэш
        cache_key = f"youtube_{video_id}_{limit}"
        if cache_key in radio_cache:
            cached_data = radio_cache[cache_key]
            if time.time() - cached_data['timestamp'] < RADIO_CACHE_DURATION:
                return cached_data['data']
        
        # Получаем информацию о seed-треке
        song_info = ytmusic.get_song(video_id)
        if not song_info:
            return {'success': False, 'error': 'Трек не найден'}
        
        # Сохраняем как основу для радио
        save_radio_seed(
            video_id,
            'youtube',
            song_info.get('title', 'Трек'),
            ', '.join([a.get('name', '') for a in song_info.get('artists', [])])
        )
        
        # Получаем похожие треки из YouTube
        try:
            related = ytmusic.get_song_related(video_id)
        except:
            related = []
        
        tracks = []
        
        # Добавляем seed-трек
        tracks.append({
            'videoId': video_id,
            'title': song_info.get('title', 'Трек'),
            'artist': ', '.join([a.get('name', '') for a in song_info.get('artists', [])]),
            'duration': song_info.get('duration_seconds', 0),
            'thumbnail': song_info.get('thumbnails', [{}])[-1].get('url') if song_info.get('thumbnails') else None,
            'type': 'youtube'
        })
        
        # Добавляем похожие треки из YouTube
        for item in related[:20]:  # Берем первые 20 похожих
            if 'videoId' in item:
                tracks.append({
                    'videoId': item['videoId'],
                    'title': item.get('title', 'Трек'),
                    'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                    'duration': item.get('duration_seconds', 0),
                    'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                    'type': 'youtube'
                })
        
        # Добавляем треки из локальной библиотеки с похожим исполнителем
        local_tracks = get_local_tracks()
        seed_artist = song_info.get('artists', [{}])[0].get('name', '')
        
        if seed_artist:
            for track in local_tracks:
                if seed_artist.lower() in track['artist'].lower() or track['artist'].lower() in seed_artist.lower():
                    tracks.append({
                        'filename': track['filename'],
                        'title': track['title'],
                        'artist': track['artist'],
                        'duration': track['duration'],
                        'cover': track['cover'],
                        'type': 'local'
                    })
                
                if len(tracks) >= limit:  # Ограничиваем общее количество
                    break
        
        # Перемешиваем треки
        random.shuffle(tracks)
        
        result = {
            'success': True,
            'station_name': f'Радио: {song_info.get("title", "Трек")}',
            'seed_track': {
                'id': video_id,
                'title': song_info.get('title', 'Трек'),
                'artist': seed_artist,
                'type': 'youtube'
            },
            'tracks': tracks[:limit],  # Ограничиваем лимитом
            'total_found': len(tracks)
        }
        
        # Сохраняем в кэш
        radio_cache[cache_key] = {
            'data': result,
            'timestamp': time.time()
        }
        
        # Очищаем старые записи кэша
        if len(radio_cache) > 50:
            oldest_key = min(radio_cache.keys(), key=lambda k: radio_cache[k]['timestamp'])
            del radio_cache[oldest_key]
        
        return result
        
    except Exception as e:
        print(f"Ошибка создания радио YouTube: {e}")
        return {'success': False, 'error': str(e)}

def create_radio_from_local(filename: str, limit: int = 30) -> Dict[str, Any]:
    """Создание радио на основе локального трека"""
    try:
        # Проверяем кэш
        cache_key = f"local_{filename}_{limit}"
        if cache_key in radio_cache:
            cached_data = radio_cache[cache_key]
            if time.time() - cached_data['timestamp'] < RADIO_CACHE_DURATION:
                return cached_data['data']
        
        # Находим seed-трек
        local_tracks = get_local_tracks()
        seed_track = None
        
        for track in local_tracks:
            if track['filename'] == filename:
                seed_track = track
                break
        
        if not seed_track:
            return {'success': False, 'error': 'Трек не найден в библиотеке'}
        
        # Сохраняем как основу для радио
        save_radio_seed(
            filename,
            'local',
            seed_track['title'],
            seed_track['artist']
        )
        
        tracks = []
        
        # Добавляем seed-трек
        tracks.append({
            'filename': seed_track['filename'],
            'title': seed_track['title'],
            'artist': seed_track['artist'],
            'duration': seed_track['duration'],
            'cover': seed_track['cover'],
            'type': 'local'
        })
        
        # Ищем похожие треки в локальной библиотеке
        for track in local_tracks:
            if track['filename'] == filename:
                continue  # Пропускаем seed-трек
            
            similarity_score = 0
            
            # 1. По исполнителю (самый важный)
            if seed_track['artist'] and track['artist']:
                if seed_track['artist'].lower() in track['artist'].lower() or track['artist'].lower() in seed_track['artist'].lower():
                    similarity_score += 3
            
            # 2. По жанру
            if seed_track['genre'] and track['genre']:
                if seed_track['genre'].lower() == track['genre'].lower():
                    similarity_score += 2
                elif any(g in track['genre'].lower() for g in seed_track['genre'].lower().split()):
                    similarity_score += 1
            
            # 3. По году (близкие годы)
            if seed_track['year'] and track['year']:
                try:
                    seed_year = int(seed_track['year'][:4]) if seed_track['year'] else 0
                    track_year = int(track['year'][:4]) if track['year'] else 0
                    if seed_year > 0 and track_year > 0 and abs(seed_year - track_year) <= 5:
                        similarity_score += 1
                except:
                    pass
            
            # 4. По настроению
            if seed_track.get('mood') and track.get('mood'):
                if seed_track['mood'] == track['mood']:
                    similarity_score += 2
            
            # 5. По BPM
            if seed_track.get('bpm') and track.get('bpm'):
                if abs(seed_track['bpm'] - track['bpm']) <= 20:
                    similarity_score += 1
            
            if similarity_score >= 2:  # Минимальный порог схожести
                tracks.append({
                    'filename': track['filename'],
                    'title': track['title'],
                    'artist': track['artist'],
                    'duration': track['duration'],
                    'cover': track['cover'],
                    'type': 'local'
                })
            
            if len(tracks) >= 15:  # 15 локальных треков достаточно
                break
        
        # Если локальных треков мало, дополняем из YouTube
        if len(tracks) < 10:
            try:
                # Ищем похожие треки на YouTube
                search_query = f"{seed_track['artist']} {seed_track['title']}"
                results = ytmusic.search(search_query, filter="songs", limit=10)
                
                for item in results:
                    if 'videoId' in item:
                        # Проверяем, не дублируется ли с уже добавленными
                        existing_ids = {t.get('videoId') for t in tracks if 'videoId' in t}
                        if item['videoId'] not in existing_ids:
                            tracks.append({
                                'videoId': item['videoId'],
                                'title': item.get('title', 'Трек'),
                                'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                                'duration': item.get('duration_seconds', 0),
                                'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                'type': 'youtube'
                            })
            except Exception as e:
                print(f"Ошибка поиска на YouTube: {e}")
        
        # Перемешиваем треки
        random.shuffle(tracks)
        
        result = {
            'success': True,
            'station_name': f'Радио: {seed_track["title"]}',
            'seed_track': {
                'id': filename,
                'title': seed_track['title'],
                'artist': seed_track['artist'],
                'type': 'local'
            },
            'tracks': tracks[:limit],  # Ограничиваем лимитом
            'total_found': len(tracks)
        }
        
        # Сохраняем в кэш
        radio_cache[cache_key] = {
            'data': result,
            'timestamp': time.time()
        }
        
        # Очищаем старые записи кэша
        if len(radio_cache) > 50:
            oldest_key = min(radio_cache.keys(), key=lambda k: radio_cache[k]['timestamp'])
            del radio_cache[oldest_key]
        
        return result
        
    except Exception as e:
        print(f"Ошибка создания радио локального: {e}")
        return {'success': False, 'error': str(e)}

def get_more_radio_tracks_youtube(video_id: str, limit: int = 15) -> Dict[str, Any]:
    """Получение дополнительных треков для YouTube-радио"""
    try:
        # Получаем больше похожих треков
        try:
            related = ytmusic.get_watch_playlist(video_id)
        except:
            related = {'tracks': []}
        
        tracks = []
        
        if related and 'tracks' in related:
            for item in related['tracks'][:limit]:
                if 'videoId' in item:
                    tracks.append({
                        'videoId': item['videoId'],
                        'title': item.get('title', 'Трек'),
                        'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                        'duration': item.get('duration_seconds', 0),
                        'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                        'type': 'youtube'
                    })
        
        return {
            'success': True,
            'tracks': tracks
        }
        
    except Exception as e:
        print(f"Ошибка загрузки дополнительных треков YouTube: {e}")
        return {'success': False, 'error': str(e)}

def get_more_radio_tracks_local(filename: str, limit: int = 15) -> Dict[str, Any]:
    """Получение дополнительных треков для локального радио"""
    try:
        local_tracks = get_local_tracks()
        tracks = []
        
        # Берем случайные треки из библиотеки
        random.shuffle(local_tracks)
        
        for track in local_tracks[:limit]:
            if track['filename'] != filename:  # Пропускаем seed-трек
                tracks.append({
                    'filename': track['filename'],
                    'title': track['title'],
                    'artist': track['artist'],
                    'duration': track['duration'],
                    'cover': track['cover'],
                    'type': 'local'
                })
        
        # Если недостаточно локальных, добавляем YouTube
        if len(tracks) < limit:
            try:
                # Получаем seed-трек для поиска
                seed_track = None
                for track in local_tracks:
                    if track['filename'] == filename:
                        seed_track = track
                        break
                
                if seed_track:
                    search_query = f"{seed_track['artist']} music"
                    results = ytmusic.search(search_query, filter="songs", limit=limit - len(tracks))
                    
                    for item in results:
                        if 'videoId' in item:
                            tracks.append({
                                'videoId': item['videoId'],
                                'title': item.get('title', 'Трек'),
                                'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                                'duration': item.get('duration_seconds', 0),
                                'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                                'type': 'youtube'
                            })
            except Exception as e:
                print(f"Ошибка поиска YouTube треков: {e}")
        
        return {
            'success': True,
            'tracks': tracks[:limit]
        }
        
    except Exception as e:
        print(f"Ошибка загрузки дополнительных локальных треков: {e}")
        return {'success': False, 'error': str(e)}

def create_radio_from_history(limit: int = 30) -> Dict[str, Any]:
    """Создание радио на основе истории прослушивания"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Получаем наиболее часто прослушиваемых артистов
            cursor.execute('''
                SELECT artist, COUNT(*) as count 
                FROM play_history 
                WHERE artist IS NOT NULL AND artist != 'Неизвестный артист'
                GROUP BY artist 
                ORDER BY count DESC 
                LIMIT 3
            ''')
            
            favorite_artists = cursor.fetchall()
            if not favorite_artists:
                return {'success': False, 'error': 'Недостаточно данных в истории'}
            
            # Берем первого артиста
            top_artist = favorite_artists[0][0]
            
            tracks = []
            
            # Ищем треки этого артиста в локальной библиотеке
            local_tracks = get_local_tracks()
            for track in local_tracks:
                if top_artist.lower() in track['artist'].lower():
                    tracks.append({
                        'filename': track['filename'],
                        'title': track['title'],
                        'artist': track['artist'],
                        'duration': track['duration'],
                        'cover': track['cover'],
                        'type': 'local'
                    })
                
                if len(tracks) >= 15:
                    break
            
            # Дополняем YouTube треками
            try:
                results = ytmusic.search(f"{top_artist} music", filter="songs", limit=15)
                
                for item in results:
                    if 'videoId' in item:
                        tracks.append({
                            'videoId': item['videoId'],
                            'title': item.get('title', 'Трек'),
                            'artist': ', '.join([a.get('name', '') for a in item.get('artists', [])]),
                            'duration': item.get('duration_seconds', 0),
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                            'type': 'youtube'
                        })
                    
                    if len(tracks) >= limit:
                        break
            except:
                pass
            
            # Перемешиваем треки
            random.shuffle(tracks)
            
            return {
                'success': True,
                'station_name': f'Радио: Ваши любимые треки',
                'seed_track': {
                    'id': 'history',
                    'title': f'На основе истории прослушивания',
                    'artist': top_artist,
                    'type': 'history'
                },
                'tracks': tracks[:limit],
                'total_found': len(tracks)
            }
            
    except Exception as e:
        print(f"Ошибка создания радио из истории: {e}")
        return {'success': False, 'error': str(e)}

def save_radio_session(session_data: Dict[str, Any]):
    """Сохранение сессии радио в базу данных"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Сохраняем сессию радио
            cursor.execute('''
                INSERT INTO radio_sessions 
                (seed_track_id, seed_track_type, station_name) 
                VALUES (?, ?, ?)
            ''', (
                session_data.get('seed_track_id'),
                session_data.get('seed_track_type'),
                session_data.get('station_name')
            ))
            
            session_id = cursor.lastrowid
            
            # Сохраняем прослушанные треки
            for track in session_data.get('played_tracks', []):
                cursor.execute('''
                    INSERT INTO radio_plays 
                    (session_id, track_id, track_type, title, artist) 
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    session_id,
                    track.get('track_id'),
                    track.get('track_type'),
                    track.get('title'),
                    track.get('artist')
                ))
            
            conn.commit()
            
            return session_id
    except Exception as e:
        print(f"Ошибка сохранения сессии радио: {e}")
        return None

def update_radio_stats(track_id: str, track_type: str, action: str):
    """Обновление статистики радио (лайк, дизлайк, прослушивание)"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            if action == 'play':
                cursor.execute('''
                    INSERT OR REPLACE INTO radio_stats 
                    (track_id, track_type, plays, last_played) 
                    VALUES (?, ?, COALESCE((SELECT plays FROM radio_stats WHERE track_id = ? AND track_type = ?), 0) + 1, CURRENT_TIMESTAMP)
                ''', (track_id, track_type, track_id, track_type))
            
            elif action == 'like':
                cursor.execute('''
                    INSERT OR REPLACE INTO radio_stats 
                    (track_id, track_type, likes) 
                    VALUES (?, ?, COALESCE((SELECT likes FROM radio_stats WHERE track_id = ? AND track_type = ?), 0) + 1)
                ''', (track_id, track_type, track_id, track_type))
            
            elif action == 'skip':
                cursor.execute('''
                    INSERT OR REPLACE INTO radio_stats 
                    (track_id, track_type, skips) 
                    VALUES (?, ?, COALESCE((SELECT skips FROM radio_stats WHERE track_id = ? AND track_type = ?), 0) + 1)
                ''', (track_id, track_type, track_id, track_type))
            
            conn.commit()
    except Exception as e:
        print(f"Ошибка обновления статистики радио: {e}")

# ========== ОБНОВЛЕННАЯ ФУНКЦИЯ GET_LOCAL_TRACKS ==========

def get_local_tracks():
    """Получение локальных треков с дополнительными полями"""
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
                    
                    title = artist = album = genre = year = 'Неизвестно'
                    cover = None
                    
                    if filename.lower().endswith('.mp3'):
                        try:
                            tag = EasyID3(filepath)
                            # Безопасное получение тегов
                            title = tag.get('title', [filename_base])[0]
                            artist = tag.get('artist', [''])[0] or 'Неизвестный артист'
                            album = tag.get('album', ['Неизвестный альбом'])[0]
                            genre = tag.get('genre', [''])[0] or ''
                            year = tag.get('date', [''])[0] or ''
                            
                            # Преобразуем все значения в строки
                            title = str(title) if not isinstance(title, str) else title
                            artist = str(artist) if not isinstance(artist, str) else artist
                            album = str(album) if not isinstance(album, str) else album
                            genre = str(genre) if not isinstance(genre, str) else genre
                            year = str(year) if not isinstance(year, str) else year
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
                    
                    # Анализируем настроение
                    mood = analyze_audio_mood(filepath)
                    
                    # Анализируем BPM
                    bpm = analyze_bpm(filepath)
                    
                    tracks.append({
                        'title': title,
                        'artist': artist,
                        'album': album,
                        'genre': genre,
                        'year': year,
                        'filename': rel_path,
                        'duration': duration,
                        'cover': f'data:image/jpeg;base64,{cover}' if cover else None,
                        'mood': mood,
                        'bpm': bpm,
                        'file_size': os.path.getsize(filepath),
                        'file_type': os.path.splitext(filename)[1].lower(),
                        'full_path': filepath
                    })
    
    # Добавляем сортировку по разным критериям
    sort_by = request.args.get('sort', 'title') if request else 'title'
    reverse = request.args.get('order', 'asc') == 'desc' if request else False
    
    if sort_by == 'title':
        tracks.sort(key=lambda x: x['title'].lower(), reverse=reverse)
    elif sort_by == 'artist':
        tracks.sort(key=lambda x: x['artist'].lower(), reverse=reverse)
    elif sort_by == 'duration':
        tracks.sort(key=lambda x: x['duration'], reverse=reverse)
    elif sort_by == 'year':
        # Безопасное преобразование года
        def get_year(track):
            try:
                year_str = str(track['year']).strip()
                if year_str and year_str != 'Неизвестно':
                    # Пытаемся извлечь год из строки
                    match = re.search(r'\d{4}', year_str)
                    if match:
                        return int(match.group())
                return 0
            except:
                return 0
        
        tracks.sort(key=get_year, reverse=reverse)
    elif sort_by == 'bpm':
        tracks.sort(key=lambda x: x['bpm'] or 0, reverse=reverse)
    elif sort_by == 'mood':
        tracks.sort(key=lambda x: x['mood'], reverse=reverse)
    
    return tracks


def safe_tag_value(value):
    """Безопасное преобразование значения тега в строку"""
    if value is None:
        return ''
    if isinstance(value, list):
        # Берем первое значение из списка
        value = value[0] if value else ''
    if not isinstance(value, str):
        try:
            return str(value)
        except:
            return ''
    return value
# ========== ОРИГИНАЛЬНЫЕ ЭНДПОИНТЫ ==========

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tracks')
def local_tracks():
    """Обновленный эндпоинт с поддержкой сортировки"""
    return jsonify(get_local_tracks())

@app.route('/yt_search')
def yt_search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])
    
    try:
        results = ytmusic.search(query, filter="songs", limit=50)
        tracks = []
        seen_ids = set()
        
        for item in results:
            if item.get('resultType') != 'song':
                continue
            
            video_id = item.get('videoId')
            if not video_id or video_id in seen_ids:
                continue
                
            seen_ids.add(video_id)
            
            # Проверяем, что у трека есть нормальные метаданные
            title = item.get('title', '').strip()
            artists = item.get('artists', [])
            
            if not title or not artists:
                continue
            
            # Исключаем очевидно плохие треки (слишком короткие названия и т.д.)
            if len(title) < 2:
                continue
            
            tracks.append({
                'videoId': video_id,
                'title': title,
                'artist': ', '.join([a.get('name', 'Неизвестный артист') for a in artists]),
                'duration': item.get('duration_seconds', 0),
                'thumbnail': item['thumbnails'][-1]['url'] if item.get('thumbnails') else None,
                'views': item.get('views', ''),
                'category': item.get('category', '')
            })
        
        # Сортируем по релевантности (можно добавить сортировку по просмотрам)
        return jsonify(tracks[:30])
        
    except Exception as e:
        print(f"Ошибка поиска YouTube: {e}")
        return jsonify([])

@app.route('/add_from_yt', methods=['POST'])
def add_from_yt():
    data = request.get_json()
    video_id = data.get('videoId')
    if not video_id:
        return jsonify({'error': 'No videoId'}), 400
    
    # Получаем информацию о треке для имени файла
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        ydl_info_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
        }
        
        with YoutubeDL(ydl_info_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', f'video_{video_id}')
            artist = info.get('uploader', 'Unknown Artist')
            
            # Если есть информация об артистах
            if 'artist' in info and info['artist']:
                artist = info['artist']
            elif 'artists' in info and info['artists']:
                artist = ', '.join([a.get('name', '') for a in info['artists'][:2]])
            
            # Очищаем имя файла
            safe_title = re.sub(r'[<>:"/\\|?*]', '', title)[:100]
            safe_artist = re.sub(r'[<>:"/\\|?*]', '', artist)[:100]
            
            filename = f"{safe_title} - {safe_artist}"
    except Exception as e:
        print(f"Ошибка получения информации: {e}")
        filename = f"youtube_{video_id}"
    
    # Полный путь для файла
    output_template = os.path.join(MUSIC_FOLDER, f"{filename}.%(ext)s")
    
    # Улучшенные настройки с гарантированным добавлением обложки
    ydl_opts = {
        'format': 'bestaudio[ext=webm]/bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [
            {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            },
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            },
            {
                'key': 'EmbedThumbnail',
                'already_have_thumbnail': False,
            }
        ],
        'writethumbnail': True,  # Скачиваем обложку отдельно
        'embedthumbnail': True,  # Встраиваем обложку
        'embed_metadata': True,  # Встраиваем метаданные
        'ignoreerrors': True,
        'no_warnings': True,
        'quiet': False,
        'retries': 10,
        'fragment_retries': 10,
        'keepvideo': False,
        'continuedl': False,
        'noplaylist': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web'],
                'player_skip': ['webpage', 'configs'],
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
        }
    }
    
    try:
        with YoutubeDL(ydl_opts) as ydl:
            # Скачиваем видео
            print(f"Начинаем загрузку: {title} - {artist}")
            result = ydl.download([url])
            
            # Ищем скачанный файл
            downloaded_files = []
            for file in os.listdir(MUSIC_FOLDER):
                if file.endswith('.mp3'):
                    # Проверяем по ID или по названию
                    if video_id in file or filename[:30].lower() in file.lower():
                        downloaded_files.append(file)
                        
                        # Проверяем и исправляем метаданные
                        fix_metadata(file, title, artist, video_id)
            
            if downloaded_files:
                return jsonify({
                    'success': True, 
                    'message': 'Музыка успешно добавлена с обложкой',
                    'files': downloaded_files
                })
            else:
                return jsonify({
                    'success': False, 
                    'error': 'Файл не найден после загрузки'
                })
                    
    except Exception as e:
        print(f"Ошибка загрузки с YouTube: {str(e)}")
        return jsonify({
            'success': False, 
            'error': f'Ошибка загрузки: {str(e)}'
        }), 500

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

@app.route('/playlist_stats')
def playlist_stats():
    """Получение статистики по плейлистам"""
    try:
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

@app.route('/yt_home_data')
def yt_home_data():
    """API для получения данных главной страницы"""
    data = get_yt_home_data()
    return jsonify(data)

@app.route('/yt_playlist/<playlist_id>')
def yt_playlist(playlist_id):
    """Получение информации о плейлисте YouTube"""
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

# ========== ЭНДПОИНТЫ ДЛЯ РАДИО ==========

@app.route('/api/radio_yt/<video_id>')
def api_radio_youtube(video_id):
    """Создание радио на основе YouTube трека"""
    limit = request.args.get('limit', 30, type=int)
    return jsonify(create_radio_from_youtube(video_id, limit))

@app.route('/api/radio_local/<path:filename>')
def api_radio_local(filename):
    """Создание радио на основе локального трека"""
    limit = request.args.get('limit', 30, type=int)
    return jsonify(create_radio_from_local(filename, limit))

@app.route('/api/radio_yt_more/<video_id>')
def api_radio_youtube_more(video_id):
    """Получение дополнительных треков для YouTube-радио"""
    limit = request.args.get('limit', 15, type=int)
    return jsonify(get_more_radio_tracks_youtube(video_id, limit))

@app.route('/api/radio_local_more/<path:filename>')
def api_radio_local_more(filename):
    """Получение дополнительных треков для локального радио"""
    limit = request.args.get('limit', 15, type=int)
    return jsonify(get_more_radio_tracks_local(filename, limit))

@app.route('/api/radio_history')
def api_radio_from_history():
    """Создание радио на основе истории прослушивания"""
    limit = request.args.get('limit', 30, type=int)
    return jsonify(create_radio_from_history(limit))

@app.route('/api/radio_session', methods=['POST'])
def api_save_radio_session():
    """Сохранение сессии радио"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'})
        
        session_id = save_radio_session(data)
        if session_id:
            return jsonify({'success': True, 'session_id': session_id})
        else:
            return jsonify({'success': False, 'error': 'Ошибка сохранения'})
    except Exception as e:
        print(f"Ошибка сохранения сессии радио: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/radio_stats', methods=['POST'])
def api_update_radio_stats():
    """Обновление статистики радио"""
    try:
        data = request.get_json()
        track_id = data.get('track_id')
        track_type = data.get('track_type')
        action = data.get('action')  # 'play', 'like', 'skip'
        
        if not all([track_id, track_type, action]):
            return jsonify({'success': False, 'error': 'Недостаточно данных'})
        
        update_radio_stats(track_id, track_type, action)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка обновления статистики радио: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/radio_seeds')
def api_get_radio_seeds():
    """Получение популярных основ для радио"""
    limit = request.args.get('limit', 10, type=int)
    seeds = get_popular_radio_seeds(limit)
    return jsonify({'success': True, 'seeds': seeds})

@app.route('/api/radio_info/<cache_key>')
def api_get_radio_info(cache_key):
    """Получение информации о радио из кэша"""
    if cache_key in radio_cache:
        return jsonify({'success': True, 'data': radio_cache[cache_key]})
    return jsonify({'success': False, 'error': 'Не найдено в кэше'})

@app.route('/api/radio_quick')
def api_quick_radio():
    """Быстрый запуск радио на основе популярных треков"""
    try:
        # Получаем случайный популярный трек
        results = ytmusic.search('popular music', filter='songs', limit=20)
        if results:
            random_track = random.choice(results)
            video_id = random_track.get('videoId')
            
            if video_id:
                limit = request.args.get('limit', 20, type=int)
                radio_data = create_radio_from_youtube(video_id, limit)
                
                if radio_data['success']:
                    return jsonify(radio_data)
        
        # Если не получилось с YouTube, пробуем локальные треки
        local_tracks = get_local_tracks()
        if local_tracks:
            random_track = random.choice(local_tracks)
            limit = request.args.get('limit', 20, type=int)
            radio_data = create_radio_from_local(random_track['filename'], limit)
            return jsonify(radio_data)
        
        return jsonify({'success': False, 'error': 'Не удалось создать радио'})
    except Exception as e:
        print(f"Ошибка быстрого радио: {e}")
        return jsonify({'success': False, 'error': str(e)})

# ========== НОВЫЕ ЭНДПОИНТЫ ==========

@app.route('/api/stats')
def api_stats():
    """API для получения статистики"""
    stats = get_listening_stats()
    return jsonify(stats)

@app.route('/api/recommendations')
def api_recommendations():
    """API для получения рекомендаций"""
    recs = get_recommendations_based_on_history()
    return jsonify(recs)

@app.route('/api/playlists/create', methods=['POST'])
def api_create_playlist():
    """Создание нового плейлиста"""
    data = request.get_json()
    name = data.get('name')
    description = data.get('description', '')
    
    if not name:
        return jsonify({'error': 'Не указано название'}), 400
    
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO playlists (name, description) VALUES (?, ?)',
                (name, description)
            )
            playlist_id = cursor.lastrowid
            conn.commit()
        
        return jsonify({
            'success': True,
            'playlist_id': playlist_id,
            'name': name
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/playlists/<int:playlist_id>/add', methods=['POST'])
def api_add_to_playlist(playlist_id):
    """Добавление трека в плейлист"""
    data = request.get_json()
    track_id = data.get('track_id')
    track_type = data.get('track_type', 'local')
    title = data.get('title', '')
    artist = data.get('artist', '')
    
    if not track_id:
        return jsonify({'error': 'Не указан ID трека'}), 400
    
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Проверяем существование плейлиста
            cursor.execute('SELECT id FROM playlists WHERE id = ?', (playlist_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Плейлист не найден'}), 404
            
            # Получаем следующую позицию
            cursor.execute(
                'SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?',
                (playlist_id,)
            )
            max_pos = cursor.fetchone()[0] or 0
            
            # Добавляем трек
            cursor.execute(
                '''INSERT INTO playlist_tracks 
                   (playlist_id, track_id, track_type, position) 
                   VALUES (?, ?, ?, ?)''',
                (playlist_id, track_id, track_type, max_pos + 1)
            )
            conn.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites/add', methods=['POST'])
def api_add_favorite():
    """Добавление трека в избранное"""
    data = request.get_json()
    track_id = data.get('track_id')
    track_type = data.get('track_type', 'local')
    title = data.get('title', '')
    artist = data.get('artist', '')
    
    if not track_id:
        return jsonify({'error': 'Не указан ID трека'}), 400
    
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            # Проверяем, не добавлен ли уже
            cursor.execute(
                'SELECT id FROM favorites WHERE track_id = ?',
                (track_id,)
            )
            
            if cursor.fetchone():
                return jsonify({'success': True, 'message': 'Уже в избранном'})
            
            # Добавляем
            cursor.execute(
                '''INSERT INTO favorites (track_id, track_type, title, artist) 
                   VALUES (?, ?, ?, ?)''',
                (track_id, track_type, title, artist)
            )
            conn.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/favorites')
def api_get_favorites():
    """Получение избранных треков"""
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM favorites ORDER BY added_at DESC')
            
            favorites = []
            for row in cursor.fetchall():
                favorites.append({
                    'id': row[0],
                    'track_id': row[1],
                    'track_type': row[2],
                    'title': row[3],
                    'artist': row[4],
                    'added_at': row[5]
                })
            
            return jsonify(favorites)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/history/add', methods=['POST'])
def api_add_history():
    """Добавление трека в историю прослушивания"""
    data = request.get_json()
    track_id = data.get('track_id')
    track_type = data.get('track_type', 'local')
    title = data.get('title', '')
    artist = data.get('artist', '')
    
    if not track_id:
        return jsonify({'error': 'Не указан ID трека'}), 400
    
    try:
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            
            cursor.execute(
                '''INSERT INTO play_history (track_id, track_type, title, artist) 
                   VALUES (?, ?, ?, ?)''',
                (track_id, track_type, title, artist)
            )
            conn.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/history')
def api_get_history():
    """Получение истории прослушивания"""
    try:
        limit = request.args.get('limit', 50)
        
        with closing(sqlite3.connect('music_player.db')) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?',
                (limit,)
            )
            
            history = []
            for row in cursor.fetchall():
                history.append({
                    'id': row[0],
                    'track_id': row[1],
                    'track_type': row[2],
                    'title': row[3],
                    'artist': row[4],
                    'played_at': row[5]
                })
            
            return jsonify(history)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/smart_playlist', methods=['POST'])
def api_create_smart_playlist():
    """Создание умного плейлиста"""
    data = request.get_json()
    name = data.get('name', 'Умный плейлист')
    criteria = data.get('criteria', {})
    
    playlist = create_smart_playlist(name, criteria)
    return jsonify(playlist)

@app.route('/api/analyze/<path:filename>')
def api_analyze(filename):
    """Анализ аудиофайла"""
    filepath = os.path.join(MUSIC_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'Файл не найден'}), 404
    
    try:
        # Получаем метаданные
        audio = MutagenFile(filepath)
        metadata = {}
        
        if audio:
            metadata['duration'] = int(audio.info.length) if audio.info else 0
            metadata['bitrate'] = audio.info.bitrate if hasattr(audio.info, 'bitrate') else 0
            metadata['channels'] = audio.info.channels if hasattr(audio.info, 'channels') else 0
            
            if hasattr(audio, 'tags'):
                for key, value in audio.tags.items():
                    if hasattr(value, 'text'):
                        metadata[key] = value.text[0] if value.text else ''
        
        # Анализируем настроение
        mood = analyze_audio_mood(filepath)
        
        # Анализируем BPM
        bpm = analyze_bpm(filepath)
        
        return jsonify({
            'metadata': metadata,
            'mood': mood,
            'bpm': bpm,
            'file_size': os.path.getsize(filepath),
            'file_type': os.path.splitext(filename)[1].lower()
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/similar/<path:filename>')
def api_similar_tracks(filename):
    """Поиск похожих треков"""
    similar = get_similar_tracks(filename, 'local')
    return jsonify(similar)

@app.route('/api/export_playlist/<int:playlist_id>')
def api_export_playlist(playlist_id):
    """Экспорт плейлиста"""
    m3u_file = export_to_m3u(playlist_id, f'playlist_{playlist_id}.m3u')
    
    if m3u_file and os.path.exists(m3u_file):
        return send_file(m3u_file, as_attachment=True)
    
    return jsonify({'error': 'Не удалось экспортировать'}), 500

@app.route('/api/batch_convert', methods=['POST'])
def api_batch_convert():
    """Пакетная конвертация аудиофайлов"""
    data = request.get_json()
    files = data.get('files', [])
    format = data.get('format', 'mp3')
    quality = data.get('quality', '192')
    
    converted_files = []
    
    for filename in files:
        filepath = os.path.join(MUSIC_FOLDER, filename)
        
        if os.path.exists(filepath):
            try:
                output_name = f"{os.path.splitext(filename)[0]}_converted.{format}"
                output_path = os.path.join(MUSIC_FOLDER, output_name)
                
                cmd = [
                    'ffmpeg',
                    '-i', filepath,
                    '-codec:a', 'libmp3lame' if format == 'mp3' else 'copy',
                    '-b:a', f'{quality}k',
                    output_path
                ]
                
                subprocess.run(cmd, capture_output=True, timeout=30)
                
                if os.path.exists(output_path):
                    converted_files.append(output_name)
                    
            except Exception as e:
                print(f"Ошибка конвертации {filename}: {e}")
    
    return jsonify({
        'success': len(converted_files) > 0,
        'converted': converted_files
    })

@app.route('/api/duplicates')
def api_find_duplicates():
    """Поиск дубликатов аудиофайлов"""
    try:
        tracks = get_local_tracks()
        duplicates = {}
        
        # Группируем по названию и артисту
        for track in tracks:
            key = f"{track['title'].lower()}-{track['artist'].lower()}"
            if key not in duplicates:
                duplicates[key] = []
            duplicates[key].append(track)
        
        # Фильтруем только дубликаты
        result = {k: v for k, v in duplicates.items() if len(v) > 1}
        
        return jsonify({
            'total_duplicates': sum(len(v) for v in result.values()),
            'duplicate_groups': result
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auto_tag', methods=['POST'])
def api_auto_tag():
    """Автоматическое добавление тегов к трекам"""
    data = request.get_json()
    filenames = data.get('files', [])
    
    tagged = 0
    
    for filename in filenames:
        filepath = os.path.join(MUSIC_FOLDER, filename)
        
        if os.path.exists(filepath) and filename.lower().endswith('.mp3'):
            try:
                # Используем MusicBrainz или другой сервис для тегов
                # Здесь упрощенная версия
                audio = MP3(filepath)
                
                if audio.tags is None:
                    audio.add_tags()
                
                # Парсим имя файла для тегов
                name_parts = os.path.splitext(filename)[0].split(' - ')
                
                if len(name_parts) >= 2:
                    # Предполагаем формат "Артист - Название"
                    artist = name_parts[0].strip()
                    title = name_parts[1].strip()
                    
                    audio.tags.add(TALB(encoding=3, text=['Неизвестный альбом']))
                    audio.tags.add(TPE1(encoding=3, text=[artist]))
                    audio.tags.add(TIT2(encoding=3, text=[title]))
                    
                    audio.save()
                    tagged += 1
                    
            except Exception as e:
                print(f"Ошибка тегирования {filename}: {e}")
    
    return jsonify({'tagged': tagged})

@app.route('/api/shuffle_all')
def api_shuffle_all():
    """Получение случайных треков из всей библиотеки"""
    tracks = get_local_tracks()
    
    # Перемешиваем
    random.shuffle(tracks)
    
    return jsonify(tracks[:50])  # Возвращаем первые 50 после перемешивания

@app.route('/api/mood_playlist/<mood>')
def api_mood_playlist(mood):
    """Плейлист по настроению"""
    tracks = get_local_tracks()
    mood_tracks = []
    
    for track in tracks:
        filepath = os.path.join(MUSIC_FOLDER, track['filename'])
        track_mood = analyze_audio_mood(filepath)
        
        if track_mood == mood:
            mood_tracks.append(track)
    
    # Если недостаточно треков, добавляем случайные
    if len(mood_tracks) < 10:
        additional = [t for t in tracks if t not in mood_tracks]
        random.shuffle(additional)
        mood_tracks.extend(additional[:10 - len(mood_tracks)])
    
    return jsonify({
        'mood': mood,
        'tracks': mood_tracks,
        'count': len(mood_tracks)
    })

@app.route('/api/download_playlist', methods=['POST'])
def api_download_playlist():
    """Скачивание плейлиста как ZIP архива"""
    data = request.get_json()
    track_ids = data.get('tracks', [])
    
    # Создаем временный ZIP архив
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for track_id in track_ids:
            filepath = os.path.join(MUSIC_FOLDER, track_id)
            
            if os.path.exists(filepath):
                # Добавляем файл в архив
                zip_file.write(filepath, os.path.basename(track_id))
    
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        as_attachment=True,
        download_name='playlist.zip',
        mimetype='application/zip'
    )

# ========== ДОПОЛНИТЕЛЬНЫЕ ЭНДПОИНТЫ ==========

@app.route('/yt_quality_playlists')
def yt_quality_playlists():
    """Получение качественных плейлистов"""
    try:
        quality_playlists = [
            {'query': 'official playlist top hits', 'name': 'Топ хиты'},
            {'query': 'viral music playlist 2026', 'name': 'Вирусные треки'},
            {'query': 'best songs of all time', 'name': 'Лучшие всех времён'},
            {'query': 'chill hits playlist', 'name': 'Расслабляющие хиты'},
            {'query': 'workout music 2026', 'name': 'Тренировка 2026'},
            {'query': 'party hits playlist', 'name': 'Вечеринка'}
        ]
        
        playlists = []
        
        for pl in quality_playlists:
            try:
                results = ytmusic.search(pl['query'], filter="playlists", limit=2)
                for item in results:
                    if 'browseId' in item:
                        playlists.append({
                            'id': item['browseId'],
                            'title': item.get('title', pl['name']),
                            'description': pl['query'],
                            'thumbnail': item.get('thumbnails', [{}])[-1].get('url') if item.get('thumbnails') else None,
                            'type': 'playlist'
                        })
                        break
            except:
                continue
        
        return jsonify({'playlists': playlists[:6]})
        
    except Exception as e:
        print(f"Ошибка получения качественных плейлистов: {e}")
        return jsonify({'playlists': []})

# ========== ЗАПУСК ПРИЛОЖЕНИЯ ==========

if __name__ == '__main__':
    # Создаем папки если их нет
    os.makedirs(MUSIC_FOLDER, exist_ok=True)
    
    # Создаем папку для кэша
    os.makedirs('cache', exist_ok=True)
    
    # Предзагрузка данных для главной страницы
    print("Предзагрузка данных YouTube Music для главной страницы...")
    fetch_yt_home_data()
    
    print("=" * 60)
    print("ЗАПУСК МУЗЫКАЛЬНОГО ПЛЕЕРА AURORA С ФУНКЦИЕЙ 'РАДИО'")
    print("=" * 60)
    print("Доступные функции:")
    print("1. 📻 Радио на основе трека (локальное + YouTube)")
    print("2. 🎵 Умные плейлисты")
    print("3. 📊 Статистика прослушивания")
    print("4. 🔍 Рекомендации")
    print("5. 🎯 Анализ BPM и настроения")
    print("6. 🔄 Поиск дубликатов")
    print("7. 📤 Экспорт/импорт")
    print("8. ⚙️ Пакетная конвертация")
    print("9. 🎸 Популярные артисты")
    print("10. 🎶 Качественные плейлисты")
    print("=" * 60)
    print(f"Сервер запущен: http://localhost:8000")
    print("Радио-функции доступны через API:")
    print("  - /api/radio_yt/<video_id> - радио на основе YouTube трека")
    print("  - /api/radio_local/<filename> - радио на основе локального трека")
    print("  - /api/radio_history - радио на основе истории прослушивания")
    print("  - /api/radio_quick - быстрое радио")
    print("Новые функции:")
    print("  - /yt_quality_playlists - качественные плейлисты")
    print("  - /yt_home_data - главная с популярными артистами")
    print("=" * 60)
    
    app.run(debug=True, port=8000, threaded=True, host='0.0.0.0')
