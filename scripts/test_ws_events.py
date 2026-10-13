#!/usr/bin/env python3
"""
Test WebSocket connection to /ws/events/?token=<JWT>
Tests both direct Daphne ASGI connection and Nginx reverse proxy upgrade.
"""
import asyncio
import json
import os
import sys

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(BASE_DIR, 'backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
import django
django.setup()

from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
import websockets


def get_test_jwt(username='admin'):
    user = User.objects.filter(username=username).first()
    if not user:
        user = User.objects.create_superuser(username, 'admin@homecareos.com', 'admin123')
    token = str(RefreshToken.for_user(user).access_token)
    return user, token


async def test_endpoint(ws_url, label):
    print(f"\n[TEST] Connecting to {label}: {ws_url}")
    try:
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            print(f"[SUCCESS] Handshake established with {label}!")
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(msg)
            print(f"[RECEIVED] First message: {json.dumps(data, indent=2)}")

            # Send ping
            await ws.send(json.dumps({'action': 'ping', 'timestamp': 123456}))
            pong = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f"[RECEIVED] Ping response: {pong}")
            return True
    except Exception as e:
        print(f"[FAIL] Error connecting to {label}: {e}")
        return False


async def main(user, token):
    print(f"Generated JWT for user '{user.username}' (ID: {user.id})")

    # Test direct Daphne ASGI port 8000
    direct_url = f"ws://127.0.0.1:8000/ws/events/?token={token}"
    direct_success = await test_endpoint(direct_url, "Direct Daphne (Port 8000)")

    # Test Nginx reverse proxy port 80
    nginx_url = f"ws://127.0.0.1/ws/events/?token={token}"
    nginx_success = await test_endpoint(nginx_url, "Nginx Proxy (Port 80 /ws/)")

    print("\n" + "=" * 50)
    print("WEBSOCKET TEST RESULTS:")
    print(f"Direct Daphne (8000): {'PASS' if direct_success else 'FAIL (Ensure daphne is running)'}")
    print(f"Nginx Proxy   (80):   {'PASS' if nginx_success else 'FAIL (Ensure nginx & daphne are running)'}")
    print("=" * 50)


if __name__ == '__main__':
    user, token = get_test_jwt()
    asyncio.run(main(user, token))

