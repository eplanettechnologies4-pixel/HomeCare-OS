"""
Django settings for HomeCare OS project.

All secrets are loaded EXCLUSIVELY from environment variables (via python-decouple
or the .env file).  Nothing sensitive is hardcoded here.

Required env vars — see .env.example for descriptions:
  SECRET_KEY, DATABASE_URL, FIELD_ENCRYPTION_KEY, REDIS_URL,
  POSTGRES_PASSWORD, GPG_PASSPHRASE
"""
import os
from pathlib import Path
import dj_database_url
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Core secrets (never hardcoded) ────────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY')          # No default — must be set in .env
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = [h.strip() for h in config('ALLOWED_HOSTS', default='*').split(',') if h.strip()]
if 'testserver' not in ALLOWED_HOSTS and '*' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('testserver')

# ── Field-level encryption key (Fernet) ───────────────────────────────────────
# Generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Store in .env as FIELD_ENCRYPTION_KEY=<generated key>
# WARNING: Losing this key means all encrypted patient data is permanently unreadable.
FIELD_ENCRYPTION_KEY = config('FIELD_ENCRYPTION_KEY')  # No default — must be set in .env

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'channels',
    'django_filters',
    'drf_spectacular',
    # Field-level encryption handled by patients.encryption (custom Fernet — django-cryptography
    # is incompatible with Django 6+ due to removed django.utils.baseconv).
    # HomeCare OS apps
    'bookings',
    'staff',
    'patients',
    'tracking',
    'accounts',
    'billing',
    'crm',
    'portal',
    'notifications',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'homecareOS.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'homecareOS.wsgi.application'
ASGI_APPLICATION = 'homecareOS.asgi.application'

# ── Database ─────────────────────────────────────────────────────────────────
# DATABASE_URL is read via decouple (supports .env file) then parsed by dj_database_url.
# Example (from .env): postgresql://homecare:PASSWORD@db:5432/homecare?sslmode=require
# For local dev without Docker/Postgres, use: sqlite:///./db.sqlite3
#
# NEVER hardcode credentials here.  Always load from .env via DATABASE_URL.
_database_url = config('DATABASE_URL', default='sqlite:///./db.sqlite3')
DATABASES = {
    'default': dj_database_url.parse(
        _database_url,
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=not DEBUG,   # SSL required in production; disabled for local SQLite dev
    )
}

# Channel layers (Redis)
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [config('REDIS_URL', default='redis://127.0.0.1:6379')],
        },
    },
}

# Celery
CELERY_BROKER_URL = config('REDIS_URL', default='redis://127.0.0.1:6379')
CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://127.0.0.1:6379')
CELERY_TIMEZONE = 'UTC'

# Celery Beat — periodic task schedule
from celery.schedules import crontab  # noqa: E402
CELERY_BEAT_SCHEDULE = {
    # Check for overdue medications every 15 minutes and notify care managers
    'check-overdue-medications': {
        'task': 'notifications.tasks.check_overdue_medications',
        'schedule': 900.0,  # 900 seconds = 15 minutes
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'   # target dir for `manage.py collectstatic`
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# JWT
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
}

# CORS
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:5173,http://127.0.0.1:5173'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# API Schema
SPECTACULAR_SETTINGS = {
    'TITLE': 'HomeCare OS API',
    'DESCRIPTION': 'Admin dashboard API for home healthcare platform',
    'VERSION': '1.0.0',
}
