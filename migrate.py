# migrate.py
import os
import json
import sqlite3
from datetime import datetime
from database import db, Track, User, Playlist, PlaylistTrack, init_db
from app import app

def migrate_existing_data():
    """Миграция существующих данных в новую БД"""
    with app.app_context():
        print("Начинаем миграцию данных...")
        
        # Создаем таблицы
        db.create_all()
        
        # Создаем дефолтного пользователя
        default_user = User.query.first()
        if not default_user:
            default_user = User(
                username='Андрей',
                avatar='https://ui-avatars.com/api/?name=Андрей&background=1db954&color=fff&size=150',
                premium=True
            )
            db.session.add(default_user)
            db.session.commit()
            print("Создан дефолтный пользователь")
        
        # Мигрируем треки из папки uploads
        uploads_dir = 'uploads'
        if os.path.exists(uploads_dir):
            migrated_count = 0
            for filename in os.listdir(uploads_dir):
                if filename.endswith(('.mp3', '.wav', '.flac', '.ogg', '.m4a')):
                    # Проверяем, не существует ли уже трек
                    existing = Track.query.filter_by(filename=filename).first()
                    if existing:
                        print(f"Трек уже существует: {filename}")
                        continue
                    
                    # Получаем метаданные
                    from app import get_audio_metadata
                    file_path = os.path.join(uploads_dir, filename)
                    metadata = get_audio_metadata(file_path)
                    
                    if metadata:
                        track = Track(
                            filename=filename,
                            file_hash=Track.calculate_hash(file_path),
                            title=metadata.get('title', os.path.splitext(filename)[0]),
                            artist=metadata.get('artist', 'Неизвестный исполнитель'),
                            album=metadata.get('album', 'Неизвестный альбом'),
                            year=metadata.get('year'),
                            genre=metadata.get('genre', 'Неизвестный жанр'),
                            duration=metadata.get('duration', 0),
                            bitrate=metadata.get('bitrate', 0),
                            filesize=os.path.getsize(file_path),
                            cover=metadata.get('cover'),
                            source='local',
                            added_at=datetime.utcnow()
                        )
                        
                        db.session.add(track)
                        migrated_count += 1
            
            db.session.commit()
            print(f"Мигрировано {migrated_count} треков из папки uploads")
        
        # Мигрируем плейлисты из localStorage (если есть экспорт)
        playlists_file = 'playlists_export.json'
        if os.path.exists(playlists_file):
            with open(playlists_file, 'r', encoding='utf-8') as f:
                playlists_data = json.load(f)
            
            for playlist_name, playlist_data in playlists_data.items():
                # Создаем плейлист
                playlist = Playlist(
                    name=playlist_name,
                    user_id=default_user.id,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.session.add(playlist)
                db.session.flush()  # Получаем ID
                
                # Добавляем треки в плейлист
                if 'tracks' in playlist_data:
                    for i, filename in enumerate(playlist_data['tracks']):
                        track = Track.query.filter_by(filename=filename).first()
                        if track:
                            playlist_track = PlaylistTrack(
                                playlist_id=playlist.id,
                                track_id=track.id,
                                position=i
                            )
                            db.session.add(playlist_track)
            
            db.session.commit()
            print(f"Мигрировано {len(playlists_data)} плейлистов")
        
        print("Миграция завершена!")

if __name__ == '__main__':
    migrate_existing_data()
