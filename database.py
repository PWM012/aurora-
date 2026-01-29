# database.py
import os
import json
import hashlib
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey, func, Index, text

db = SQLAlchemy()

class User(db.Model):
    """Модель пользователя"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True)
    avatar = db.Column(db.Text, default='https://via.placeholder.com/150')
    premium = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    playlists = relationship('Playlist', back_populates='user', cascade='all, delete-orphan')
    listening_history = relationship('ListeningHistory', back_populates='user', cascade='all, delete-orphan')
    favorites = relationship('Track', secondary='user_favorites')
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'avatar': self.avatar,
            'premium': self.premium,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'stats': self.get_stats()
        }
    
    def get_stats(self):
        return {
            'playlists_count': len(self.playlists),
            'favorites_count': len(self.favorites),
            'total_listening_time': sum([h.duration for h in self.listening_history])
        }

class Track(db.Model):
    """Модель трека"""
    __tablename__ = 'tracks'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), unique=True, nullable=False)
    file_hash = db.Column(db.String(64), unique=True, nullable=False)  # Для дедупликации
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(200), nullable=False, index=True)
    album = db.Column(db.String(200), index=True)
    genre = db.Column(db.String(100), index=True)
    year = db.Column(db.Integer)
    duration = db.Column(db.Integer, nullable=False)  # в секундах
    bitrate = db.Column(db.Integer)
    filesize = db.Column(db.BigInteger)
    cover = db.Column(db.Text)  # Base64 или путь
    cover_url = db.Column(db.Text)
    lyrics = db.Column(db.Text)
    audio_url = db.Column(db.Text)  # Для YouTube треков
    source = db.Column(db.String(20), default='local')  # 'local' или 'youtube'
    video_id = db.Column(db.String(50), index=True)  # Для YouTube
    play_count = db.Column(db.Integer, default=0)
    last_played = db.Column(db.DateTime)
    added_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    playlists = relationship('Playlist', secondary='playlist_tracks', back_populates='tracks')
    listening_history = relationship('ListeningHistory', back_populates='track', cascade='all, delete-orphan')
    favorited_by = relationship('User', secondary='user_favorites')
    
    # Индексы для быстрого поиска
    __table_args__ = (
        Index('idx_track_title_artist', 'title', 'artist'),
        Index('idx_track_genre_year', 'genre', 'year'),
        Index('idx_track_added_at', 'added_at'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'title': self.title,
            'artist': self.artist,
            'album': self.album,
            'genre': self.genre,
            'year': self.year,
            'duration': self.duration,
            'bitrate': self.bitrate,
            'filesize': self.filesize,
            'cover': self.cover,
            'cover_url': self.cover_url,
            'lyrics': self.lyrics,
            'audio_url': self.audio_url,
            'source': self.source,
            'video_id': self.video_id,
            'play_count': self.play_count,
            'last_played': self.last_played.isoformat() if self.last_played else None,
            'added_at': self.added_at.isoformat() if self.added_at else None
        }
    
    @staticmethod
    def calculate_hash(file_path):
        """Рассчитывает хэш файла для дедупликации"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

class Playlist(db.Model):
    """Модель плейлиста"""
    __tablename__ = 'playlists'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    description = db.Column(db.Text)
    cover = db.Column(db.Text)
    is_public = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    user = relationship('User', back_populates='playlists')
    tracks = relationship('Track', secondary='playlist_tracks', back_populates='playlists')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'cover': self.cover,
            'is_public': self.is_public,
            'user_id': self.user_id,
            'track_count': len(self.tracks),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class PlaylistTrack(db.Model):
    """Промежуточная таблица для треков в плейлистах"""
    __tablename__ = 'playlist_tracks'
    
    id = db.Column(db.Integer, primary_key=True)
    playlist_id = db.Column(db.Integer, ForeignKey('playlists.id', ondelete='CASCADE'), nullable=False)
    track_id = db.Column(db.Integer, ForeignKey('tracks.id', ondelete='CASCADE'), nullable=False)
    position = db.Column(db.Integer, default=0)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Уникальный индекс для предотвращения дубликатов
    __table_args__ = (
        db.UniqueConstraint('playlist_id', 'track_id', name='uix_playlist_track'),
        Index('idx_playlist_track_order', 'playlist_id', 'position'),
    )

class ListeningHistory(db.Model):
    """История прослушиваний"""
    __tablename__ = 'listening_history'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('users.id'), nullable=False, index=True)
    track_id = db.Column(db.Integer, ForeignKey('tracks.id'), nullable=False, index=True)
    played_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    duration = db.Column(db.Integer)  # Сколько секунд прослушано
    completed = db.Column(db.Boolean, default=False)
    
    # Связи
    user = relationship('User', back_populates='listening_history')
    track = relationship('Track', back_populates='listening_history')

class UserFavorite(db.Model):
    """Избранные треки пользователей"""
    __tablename__ = 'user_favorites'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('users.id'), nullable=False)
    track_id = db.Column(db.Integer, ForeignKey('tracks.id'), nullable=False)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        db.UniqueConstraint('user_id', 'track_id', name='uix_user_favorite'),
        Index('idx_user_favorites', 'user_id', 'added_at'),
    )

class Settings(db.Model):
    """Настройки приложения"""
    __tablename__ = 'settings'
    
    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text)
    description = db.Column(db.Text)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def get(key, default=None):
        setting = Settings.query.get(key)
        return setting.value if setting else default
    
    @staticmethod
    def set(key, value, description=None):
        setting = Settings.query.get(key)
        if setting:
            setting.value = value
            if description:
                setting.description = description
        else:
            setting = Settings(key=key, value=value, description=description)
            db.session.add(setting)
        db.session.commit()
        return setting

# Создаем таблицы
def init_db():
    """Инициализация базы данных"""
    db.create_all()
    
    # Создаем дефолтного пользователя если его нет
    if not User.query.first():
        default_user = User(
            username='Андрей',
            avatar='https://ui-avatars.com/api/?name=Андрей&background=1db954&color=fff&size=150',
            premium=True
        )
        db.session.add(default_user)
        db.session.commit()
    
    # Инициализируем настройки по умолчанию
    default_settings = [
        ('color_scheme', 'green', 'Цветовая схема приложения'),
        ('tracks_per_page', '30', 'Количество треков на странице'),
        ('sort_by', 'title', 'Сортировка треков по умолчанию'),
        ('auto_play', 'true', 'Автовоспроизведение'),
        ('cache_enabled', 'true', 'Кэширование обложек'),
        ('notifications', 'true', 'Уведомления'),
        ('high_quality', 'false', 'Высокое качество стриминга'),
        ('lyrics_auto_show', 'false', 'Автопоказ текста песен'),
    ]
    
    for key, value, description in default_settings:
        if not Settings.query.get(key):
            Settings.set(key, value, description)
    
    # Создаем индексы для производительности
    create_indexes()
    
    print("База данных инициализирована!")

def create_indexes():
    """Создаем дополнительные индексы для оптимизации"""
    # Индекс для быстрого поиска треков
    db.session.execute(text('''
        CREATE INDEX IF NOT EXISTS idx_tracks_search 
        ON tracks(title, artist, album, genre)
    '''))
    
    # Индекс для статистики
    db.session.execute(text('''
        CREATE INDEX IF NOT EXISTS idx_history_user_date 
        ON listening_history(user_id, played_at DESC)
    '''))
    
    # Индекс для быстрого получения последних треков
    db.session.execute(text('''
        CREATE INDEX IF NOT EXISTS idx_tracks_recent 
        ON tracks(added_at DESC)
    '''))
    
    db.session.commit()
