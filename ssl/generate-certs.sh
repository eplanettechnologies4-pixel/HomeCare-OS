#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  HomeCare OS — Generate Self-Signed SSL Certificates for Postgres
#
#  Run ONCE on the VPS before the first `docker compose up`:
#    chmod +x ssl/generate-certs.sh
#    ./ssl/generate-certs.sh
#
#  Output:
#    ssl/server.crt  — server certificate (public)
#    ssl/server.key  — private key (KEEP SECURE, never commit)
#
#  Both files are mounted read-only into the Postgres container.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR"

echo "▶  Generating self-signed SSL certificate for Postgres..."
echo "   Output directory: $CERT_DIR"

openssl req \
  -new \
  -x509 \
  -days 3650 \
  -nodes \
  -newkey rsa:4096 \
  -keyout "$CERT_DIR/server.key" \
  -out   "$CERT_DIR/server.crt" \
  -subj  "/C=US/ST=State/L=City/O=HomeCareOS/CN=db"

# Postgres requires the private key to be owner-read-only (chmod 600)
chmod 600 "$CERT_DIR/server.key"
chmod 644 "$CERT_DIR/server.crt"

echo ""
echo "✔  Certificates generated:"
echo "   $CERT_DIR/server.crt"
echo "   $CERT_DIR/server.key"
echo ""
echo "⚠  server.key is listed in .gitignore — never commit it."
echo "   Renew before expiry: $(date -d '+3650 days' '+%Y-%m-%d' 2>/dev/null || date -v+3650d '+%Y-%m-%d' 2>/dev/null || echo '(3650 days from now)')"
