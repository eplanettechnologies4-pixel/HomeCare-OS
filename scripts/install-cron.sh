#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  HomeCare OS — Install Nightly Backup Cron Job
#
#  Run once on the VPS as root (or the user that owns the app directory):
#    chmod +x scripts/install-cron.sh
#    sudo bash scripts/install-cron.sh /opt/homecareos
#
#  What it does:
#    • Creates /etc/cron.d/homecareos-backup
#    • Schedules backup_db.sh at 02:00 server local time every night
#    • Sources .env for secrets (PGPASSWORD, GPG_PASSPHRASE, etc.)
#    • Logs output to /var/log/homecareos-backup.log
#
#  To verify the cron is registered:
#    cat /etc/cron.d/homecareos-backup
#
#  To run a manual test immediately:
#    bash /opt/homecareos/scripts/backup_db.sh
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="${1:-/opt/homecareos}"
ENV_FILE="$APP_DIR/.env"
BACKUP_SCRIPT="$APP_DIR/scripts/backup_db.sh"
CRON_FILE="/etc/cron.d/homecareos-backup"
LOG_FILE="/var/log/homecareos-backup.log"
CRON_USER="${SUDO_USER:-root}"

# ── Validations ───────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE"
  echo "       Run: cp .env.example $ENV_FILE && nano $ENV_FILE"
  exit 1
fi

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
  echo "ERROR: backup script not found at $BACKUP_SCRIPT"
  exit 1
fi

chmod +x "$BACKUP_SCRIPT"
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

# ── Write cron file ───────────────────────────────────────────────────────────
cat > "$CRON_FILE" <<EOF
# HomeCare OS — Nightly encrypted database backup
# Runs at 02:00 every night (server local time)
# Logs: $LOG_FILE
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 2 * * * $CRON_USER set -a; source $ENV_FILE; set +a; bash $BACKUP_SCRIPT >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"

echo ""
echo "✔  Cron job installed at: $CRON_FILE"
echo "   Schedule: daily at 02:00 (server local time)"
echo "   Logs:     $LOG_FILE"
echo ""
echo "   Test it now:"
echo "     source $ENV_FILE && bash $BACKUP_SCRIPT"
echo ""
echo "   Watch the log:"
echo "     tail -f $LOG_FILE"
