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
ALLOWED_HOSTS = [h.strip() for h in config('ALLOWED_HOSTS', default='portal.ehealthpk.com,localhost,127.0.0.1,testserver,*').split(',') if h.strip()]
if 'testserver' not in ALLOWED_HOSTS and '*' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('testserver')

# ── Field-level encryption key (Fernet) ───────────────────────────────────────
# Generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Store in .env as FIELD_ENCRYPTION_KEY=<generated key>
# WARNING: Losing this key means all encrypted patient data is permanently unreadable.
FIELD_ENCRYPTION_KEY = config('FIELD_ENCRYPTION_KEY')  # No default — must be set in .env

INSTALLED_APPS = [
    'daphne',
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
    'django_celery_beat',
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
    'lms',
    'quality',
    'pharmacy',
    'equipment',
    'lab',
    'documents',
    'forms_builder',
    'staff_portal',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
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
_default_db = f'sqlite:///{BASE_DIR / "db.sqlite3"}'
_database_url = config('DATABASE_URL', default=_default_db)
if _database_url in ('sqlite:///./db.sqlite3', 'sqlite://db.sqlite3'):
    _database_url = _default_db
DATABASES = {
    'default': dj_database_url.parse(
        _database_url,
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=not DEBUG,   # SSL required in production; disabled for local SQLite dev
    )
}

# Channel layers (Redis via REDIS_URL in production; InMemory for testing & fallback)
import sys
_redis_url = config('REDIS_URL', default='redis://redis:6379/0').strip()
_is_testing = 'test' in sys.argv

def _get_channel_layer_config():
    if _is_testing:
        return {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
    if _redis_url:
        if not DEBUG:
            return {
                'default': {
                    'BACKEND': 'channels_redis.core.RedisChannelLayer',
                    'CONFIG': {'hosts': [_redis_url]},
                }
            }
        try:
            import redis
            r = redis.from_url(_redis_url, socket_connect_timeout=0.2)
            r.ping()
            return {
                'default': {
                    'BACKEND': 'channels_redis.core.RedisChannelLayer',
                    'CONFIG': {'hosts': [_redis_url]},
                }
            }
        except Exception:
            pass
    return {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

CHANNEL_LAYERS = _get_channel_layer_config()

# Caches — Redis in production (shared across gunicorn workers for DRF throttling);
# fallback to LocMemCache for local dev/testing when Redis is not running
def _get_cache_config():
    if _redis_url:
        if not DEBUG:
            return {
                'default': {
                    'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                    'LOCATION': _redis_url,
                }
            }
        try:
            import redis
            r = redis.from_url(_redis_url, socket_connect_timeout=0.2)
            r.ping()
            return {
                'default': {
                    'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                    'LOCATION': _redis_url,
                }
            }
        except Exception:
            pass
    return {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'homecare-local-cache',
        }
    }

CACHES = _get_cache_config()

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
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
 
# ── Upload & Memory Limits ───────────────────────────────────────────────────
# Allow up to 2GB uploads for high-definition course videos and 200MB media docs
DATA_UPLOAD_MAX_MEMORY_SIZE = 2147483648  # 2 GB
FILE_UPLOAD_MAX_MEMORY_SIZE = 2147483648  # 2 GB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000

# Throttle Rate Configuration (env-configurable)
PUBLIC_BOOKING_THROTTLE_RATE = config('PUBLIC_BOOKING_THROTTLE_RATE', default='10/hour').strip()

# REST Framework
REST_FRAMEWORK = {
    'NUM_PROXIES': 1,
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
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/day',
        'public_booking': PUBLIC_BOOKING_THROTTLE_RATE,
        'staff_portal_post': '60/minute',
        'staff_verify': '30/minute',
    },
}

# Shared API Keys for Public Booking Endpoints (env-configurable)
PUBLIC_BOOKING_API_KEY = config('PUBLIC_BOOKING_API_KEY', default='').strip()
MOBILE_PUBLIC_API_KEY = config('MOBILE_PUBLIC_API_KEY', default='').strip()

# JWT
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
}

# CORS & CSRF
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in config(
        'CORS_ALLOWED_ORIGINS',
        default='https://portal.ehealthpk.com,http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173,http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:3001'
    ).split(',') if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-client-platform',  # required by frontend API client
    'x-public-key',        # shared key for external public website bookings
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip() for origin in config(
        'CSRF_TRUSTED_ORIGINS',
        default='https://portal.ehealthpk.com,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:3001'
    ).split(',') if origin.strip()
]

# ── Security & Proxy Headers (Production HTTPS) ──────────────────────────────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# ── Logging Configuration ─────────────────────────────────────────────────────
# Logs unhandled exceptions with full traceback to stdout so `docker compose logs web` shows cause of any 500
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': config('DJANGO_LOG_LEVEL', default='INFO'),
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'homecareOS': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'tracking': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# API Schema
SPECTACULAR_SETTINGS = {
    'TITLE': 'HomeCare OS API',
    'DESCRIPTION': 'Admin dashboard API for home healthcare platform',
    'VERSION': '1.0.0',
}

# ── Staff Portal Configuration ───────────────────────────────────────────────
OFFICE_HOURS_START = config('OFFICE_HOURS_START', default='09:00').strip()
OFFICE_HOURS_END = config('OFFICE_HOURS_END', default='17:00').strip()
OFFICE_TIMEZONE = config('OFFICE_TIMEZONE', default='Asia/Karachi').strip()
OVERTIME_CLAIM_WINDOW_DAYS = config('OVERTIME_CLAIM_WINDOW_DAYS', default=2, cast=int)
RESIGNATION_NOTICE_PERIOD_DAYS = config('RESIGNATION_NOTICE_PERIOD_DAYS', default=30, cast=int)
SHIFT_NOTE_TIMEOUT_HOURS = config('SHIFT_NOTE_TIMEOUT_HOURS', default=2, cast=int)
NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT = config('NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT', default=7, cast=int)
CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT = config('CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT', default=7, cast=int)
RECENT_VITALS_WINDOW_HOURS = config('RECENT_VITALS_WINDOW_HOURS', default=24, cast=int)

VITALS_THRESHOLDS = {
    'systolic_max': 140,
    'systolic_min': 90,
    'diastolic_max': 90,
    'diastolic_min': 60,
    'heart_rate_max': 100,
    'heart_rate_min': 50,
    'spo2_min': 92,
    'temperature_max': 38.0,
    'temperature_min': 35.5,
    'blood_glucose_max': 180,
    'blood_glucose_min': 70,
    'intake_min_ml': 500,
    'output_min_ml': 400,
}

# PROVISIONAL - needs clinical sign-off
# High-Alert Patient Tier Thresholds for Clinician Portal (doctor, physio, speech, psychotherapist)
CLINICAL_TIER_THRESHOLDS = {
    'critical': {
        'spo2_max': 87,                # SpO2 < 88%
        'systolic_high': 181,          # Systolic > 180 mmHg
        'systolic_low': 79,            # Systolic < 80 mmHg
        'heart_rate_high': 131,        # Heart Rate > 130 bpm
        'heart_rate_low': 39,          # Heart Rate < 40 bpm
        'temperature_high': 39.1,      # Temperature > 39.0 °C
    },
    'less_critical': {
        'spo2_min': 88,
        'spo2_max': 91,                # 88% <= SpO2 <= 91% (below normal spo2_min=92)
        'systolic_high_min': 141,
        'systolic_high_max': 180,      # 141 <= Systolic <= 180 mmHg
        'systolic_low_min': 80,
        'systolic_low_max': 89,        # 80 <= Systolic <= 89 mmHg
        'heart_rate_high_min': 101,
        'heart_rate_high_max': 130,    # 101 <= Heart Rate <= 130 bpm
        'heart_rate_low_min': 40,
        'heart_rate_low_max': 49,      # 40 <= Heart Rate <= 49 bpm
        'temperature_high_min': 38.5,
        'temperature_high_max': 39.0,  # 38.5 <= Temperature <= 39.0 °C
    },
    'mild': {
        'systolic_min': 135,
        'systolic_max': 140,           # 135 <= Systolic <= 140 mmHg (Mildly elevated)
        'temperature_min': 38.1,
        'temperature_max': 38.4,       # 38.1 <= Temperature <= 38.4 °C (Mildly elevated)
    },
}

# ── Roster & Scheduling Configuration ───────────────────────────────────────
# PROVISIONAL - needs HR sign-off
# Maximum weekly scheduled hours before warning highlight is displayed in Roster
ROSTER_MAX_WEEKLY_HOURS = 60

# Determines whether Care Managers may edit draft rosters (cannot publish)
ROSTER_CARE_MANAGER_CAN_EDIT = False

