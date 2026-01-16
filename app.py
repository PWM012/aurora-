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
import lyricsgenius

app = Flask(__name__)

MUSIC_FOLDER = 'music'
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.flac'}
ytmusic = YTMusic()


GENIUS_API_KEY = 'Fx3OpxR3bmP6xJxizrD9C78VIMYZ48iBYkURj2yHQEh4L_Gmv8EdRz2slPdVH7Y44Zc7xHUkRMoMMI1lPT41Fg'  # Замените на свой ключ
genius = lyricsgenius.Genius(GENIUS_API_KEY, verbose=False)

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
                        
                        mp3 = MP3(filepath)
                        for tag in mp3.tags.values() if mp3.tags else []:
                            if hasattr(tag, 'FrameID') and tag.FrameID in ['APIC', 'PIC']:
                                cover = base64.b64encode(tag.data).decode('ascii')
                                break
                    
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
    
    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    return jsonify({'success': True})

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
            file.save(os.path.join(MUSIC_FOLDER, filename))
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

@app.route('/lyrics')
def get_lyrics():
    title = request.args.get('title', '')
    artist = request.args.get('artist', '')
    video_id = request.args.get('videoId', '')
    
    # Пробуем получить текст разными способами
    
    # 1. Пробуем через Genius API
    if GENIUS_API_KEY != 'Fx3OpxR3bmP6xJxizrD9C78VIMYZ48iBYkURj2yHQEh4L_Gmv8EdRz2slPdVH7Y44Zc7xHUkRMoMMI1lPT41Fg':
        try:
            song = genius.search_song(title, artist)
            if song and song.lyrics:
                return jsonify({'lyrics': song.lyrics})
        except:
            pass
    
    # 2. Пробуем через YouTube Music
    if video_id:
        try:
            lyrics_data = ytmusic.get_lyrics(video_id)
            if lyrics_data and lyrics_data.get('lyrics'):
                return jsonify({'lyrics': lyrics_data.get('lyrics')})
        except:
            pass
    
    # 3. Пробуем через локальную базу
    try:
        # Проверяем есть ли локальный файл с текстом
        lyrics_file = os.path.join('lyrics', f"{artist} - {title}.txt")
        if os.path.exists(lyrics_file):
            with open(lyrics_file, 'r', encoding='utf-8') as f:
                lyrics = f.read()
                return jsonify({'lyrics': lyrics})
    except:
        pass
    
    # 4. Возвращаем заглушку
    return jsonify({
        'lyrics': f'Текст песни "{title}" - {artist} не найден.\n\nЧтобы добавить текст:\n1. Создайте файл в папке lyrics с именем "{artist} - {title}.txt"\n2. Вставьте в него текст песни\n3. Обновите страницу'
    })

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
    os.makedirs('lyrics', exist_ok=True)
    
    app.run(debug=True, port=5000)
