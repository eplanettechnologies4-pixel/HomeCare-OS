# ════════════════════════════════════════════════════════════════════════════
#  HomeCare OS — Django Backend Dockerfile
# ════════════════════════════════════════════════════════════════════════════
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies required by psycopg2 and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        libjpeg-dev \
        libpng-dev \
        zlib1g-dev \
        gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy project source
COPY . .

# Collect static files (requires SECRET_KEY; use a dummy value at build time)
RUN SECRET_KEY=build-time-placeholder \
    DATABASE_URL=sqlite:////tmp/build.db \
    FIELD_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    python manage.py collectstatic --noinput

EXPOSE 8000
