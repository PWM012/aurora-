from flask import Flask, render_template, send_from_directory, jsonify, abort, request, redirect
import os
from mutagen import File as MutagenFile
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
import base64
from werkzeug.utils import secure_filename
from ytmusicapi import YTMusic
from yt_dlp import YoutubeDL

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
                        
                        mp3 = MP3(filepath)
                        for tag in mp3.tags.values() if mp3.tags else []:
                            if hasattr(tag, 'FrameID') and tag.FrameID in ['APIC', 'PIC']:
                                cover = base64.b64encode(tag.data).decode('ascii')
                                break
                    
                   
                    parts = filename_base.split(' - ')
                    if len(parts) >= 2:
                        if len(parts) == 3:
                            title = parts[0].strip()
                            artist = parts[1].strip()
                        else:
                            title = parts[0].strip()
                            artist = parts[1].strip()
                    
                    tracks.append({
                        'title': title,
                        'artist': artist,
                        'album': album,
                        'filename': rel_path,
                        'duration': duration,
                        'cover': f'data:image/jpeg;base64,{cover}' if cover else None
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
        'outtmpl': os.path.join(MUSIC_FOLDER, '%(title)s - %(artist)s - %(id)s.%(ext)s'),
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
    videoId = request.args.get('videoId')
    if videoId:
        try:
            lyrics_data = ytmusic.get_lyrics(videoId)
            lyrics = lyrics_data.get('lyrics', 'Текст песни не найден.')
            return jsonify({'lyrics': lyrics})
        except:
            return jsonify({'lyrics': 'Текст песни не найден.'})
    return jsonify({'lyrics': 'Текст недоступен.'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
