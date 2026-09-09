#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  HomeCare OS — Nightly Database Backup Script
#
#  Workflow:
#    1. pg_dump → plaintext SQL into RAM-backed tmpfs (/dev/shm)
#    2. GPG AES-256 symmetric encryption → .sql.gpg on disk
#    3. Securely delete (shred) the plaintext dump
#    4. Rotate: keep only the last N backups (default: 7)
#
#  Required environment variables (loaded from .env or set in cron):
#    PGPASSWORD     — Postgres user password
#    GPG_PASSPHRASE — Symmetric passphrase for GPG encryption
#    BACKUP_DIR     — Absolute path where .gpg files are stored
#
#  Optional:
#    PG_HOST        — default: db  (Docker service name)
#    PG_PORT        — default: 5432
#    PG_USER        — default: homecare
#    PG_DB          — default: homecare
#    KEEP_BACKUPS   — number of backups to retain (default: 7)
#
#  Usage (manual test):
#    source /opt/homecareos/.env
#    bash /opt/homecareos/scripts/backup_db.sh
#
#  Decrypt a backup:
#    gpg --decrypt --batch --passphrase "$GPG_PASSPHRASE" \
#        homecare_2026-09-09_02-00.sql.gpg | psql homecare
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
PG_HOST="${PG_HOST:-db}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-homecare}"
PG_DB="${PG_DB:-homecare}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M)"
BACKUP_FILENAME="homecare_${TIMESTAMP}.sql"
ENCRYPTED_FILENAME="${BACKUP_FILENAME}.gpg"

# Tmpfs directory (in-memory — plaintext NEVER touches spinning disk / SSD)
TMPFS_DIR="/dev/shm/homecareos_backup"

# ── Validate required env vars ────────────────────────────────────────────────
: "${PGPASSWORD:?ERROR: PGPASSWORD is not set. Aborting.}"
: "${GPG_PASSPHRASE:?ERROR: GPG_PASSPHRASE is not set. Aborting.}"
: "${BACKUP_DIR:?ERROR: BACKUP_DIR is not set. Aborting.}"

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
mkdir -p "$TMPFS_DIR"
chmod 700 "$TMPFS_DIR"

PLAIN_DUMP="$TMPFS_DIR/$BACKUP_FILENAME"
ENCRYPTED_OUT="$BACKUP_DIR/$ENCRYPTED_FILENAME"

echo "[$(date)] Starting backup: $ENCRYPTED_FILENAME"

# ── Step 1: Dump (SSL required) ────────────────────────────────────────────────
export PGPASSWORD
pg_dump \
  --host="$PG_HOST" \
  --port="$PG_PORT" \
  --username="$PG_USER" \
  --dbname="$PG_DB" \
  --no-password \
  --format=plain \
  --file="$PLAIN_DUMP" \
  --sslmode=require

echo "[$(date)] pg_dump complete ($(du -sh "$PLAIN_DUMP" | cut -f1))"

# ── Step 2: Encrypt with GPG AES-256 ─────────────────────────────────────────
gpg \
  --batch \
  --yes \
  --symmetric \
  --cipher-algo AES256 \
  --passphrase "$GPG_PASSPHRASE" \
  --output "$ENCRYPTED_OUT" \
  "$PLAIN_DUMP"

echo "[$(date)] GPG encryption complete → $ENCRYPTED_OUT"

# ── Step 3: Securely delete plaintext dump ────────────────────────────────────
if command -v shred &>/dev/null; then
  shred -u "$PLAIN_DUMP"
else
  # shred not available (some minimal containers) — overwrite + delete
  dd if=/dev/urandom of="$PLAIN_DUMP" bs=1M count="$(du -sm "$PLAIN_DUMP" | cut -f1)" 2>/dev/null || true
  rm -f "$PLAIN_DUMP"
fi

# Also clean up the tmpfs directory if empty
rmdir "$TMPFS_DIR" 2>/dev/null || true

echo "[$(date)] Plaintext dump securely deleted."

# ── Step 4: Rotate — keep only KEEP_BACKUPS most recent ──────────────────────
cd "$BACKUP_DIR"
BACKUP_COUNT=$(ls -1 homecare_*.sql.gpg 2>/dev/null | wc -l)

if (( BACKUP_COUNT > KEEP_BACKUPS )); then
  EXCESS=$(( BACKUP_COUNT - KEEP_BACKUPS ))
  echo "[$(date)] Rotating: removing $EXCESS old backup(s) (keeping last $KEEP_BACKUPS)..."
  ls -1t homecare_*.sql.gpg | tail -n "$EXCESS" | xargs rm -f
fi

echo "[$(date)] Backup complete. Retained backups in $BACKUP_DIR:"
ls -lh homecare_*.sql.gpg 2>/dev/null || echo "  (none)"
