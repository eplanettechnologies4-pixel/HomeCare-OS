"""
HomeCare OS — Google Maps Link & Coordinates Resolver
======================================================
Securely resolves Google Maps URLs and raw coordinate strings into
validated latitude and longitude pairs with strict anti-SSRF protection.
"""
import re
import urllib.parse
import requests
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

# Strict allowlist of Google Maps hostnames for SSRF protection
ALLOWED_GOOGLE_HOSTS = {
    'maps.google.com',
    'www.google.com',
    'google.com',
    'goo.gl',
    'maps.app.goo.gl',
}

COORDINATE_REGEXES = [
    # 1. @lat,lng (e.g. /@33.684421,73.047891,17z)
    re.compile(r'@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)'),
    # 2. !3dLAT!4dLNG (e.g. data=!4m2!3m1!1s0x...!3d33.684421!4d73.047891)
    re.compile(r'!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)'),
    # 3. Query params: q=lat,lng or ll=lat,lng or query=lat,lng or daddr=lat,lng
    re.compile(r'[?&](?:q|ll|query|daddr|saddr|center)=(-?\d{1,2}\.\d+)[,\+](-?\d{1,3}\.\d+)'),
    # 4. Path segments: /place/lat,lng or /search/lat,lng
    re.compile(r'/(?:place|search)/(-?\d{1,2}\.\d+)[,\+](-?\d{1,3}\.\d+)'),
]

RAW_COORDINATES_REGEX = re.compile(
    r'^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$'
)


def is_allowed_google_host(hostname: str) -> bool:
    """Check if hostname belongs to the approved Google Maps domain allowlist."""
    if not hostname:
        return False
    host = hostname.lower().strip()
    if host in ALLOWED_GOOGLE_HOSTS:
        return True
    # Allow regional Google domains like google.com.pk, maps.google.com.pk
    if host.endswith('.google.com') or host.endswith('.google.com.pk') or host.endswith('.google.pk'):
        return True
    return False


def extract_coordinates_from_text(text: str):
    """Attempt to extract lat/lng from text using known patterns."""
    if not text:
        return None

    # Check known coordinate patterns
    for pattern in COORDINATE_REGEXES:
        match = pattern.search(text)
        if match:
            try:
                lat = float(match.group(1))
                lng = float(match.group(2))
                if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
                    return {'latitude': round(lat, 6), 'longitude': round(lng, 6)}
            except (ValueError, TypeError):
                continue
    return None


def resolve_location_link(input_text: str) -> dict:
    """
    Parses raw 'lat,lng' text or a Google Maps URL.
    Follows redirects server-side (max 5 hops, 5s timeout) only within the Google allowlist.
    Returns {'latitude': float, 'longitude': float} or raises ValueError.
    """
    if not input_text or not isinstance(input_text, str):
        raise ValueError("Location link or coordinates string is required.")

    cleaned = input_text.strip()
    if not cleaned:
        raise ValueError("Location link or coordinates string cannot be empty.")

    # 1. Check raw "lat,lng" text
    raw_match = RAW_COORDINATES_REGEX.match(cleaned)
    if raw_match:
        try:
            lat = float(raw_match.group(1))
            lng = float(raw_match.group(2))
            if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
                return {'latitude': round(lat, 6), 'longitude': round(lng, 6)}
            else:
                raise ValueError(f"Coordinates out of range: latitude {lat}, longitude {lng}")
        except ValueError as e:
            raise ValueError(f"Invalid coordinate numbers: {e}")

    # 2. Treat as URL
    url_candidate = cleaned
    if not (url_candidate.startswith('http://') or url_candidate.startswith('https://')):
        # Check if starts with a known Google host
        for host in ALLOWED_GOOGLE_HOSTS:
            if url_candidate.startswith(host):
                url_candidate = 'https://' + url_candidate
                break

    parsed = urllib.parse.urlparse(url_candidate)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Invalid URL format or raw coordinate input.")

    if not is_allowed_google_host(parsed.hostname):
        raise ValueError(
            f"Host '{parsed.hostname}' is not an authorized Google Maps domain. "
            "Only Google Maps links (maps.google.com, goo.gl, maps.app.goo.gl) are permitted."
        )

    # 3. Check if coordinates are directly present in the initial URL
    coords = extract_coordinates_from_text(url_candidate)
    if coords:
        return coords

    # 4. Follow redirects server-side with strict hop limit, timeout, and SSRF allowlist
    current_url = url_candidate
    max_hops = 5
    timeout_sec = 5.0
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    for _ in range(max_hops):
        # Validate host on every hop
        hop_parsed = urllib.parse.urlparse(current_url)
        if not is_allowed_google_host(hop_parsed.hostname):
            raise ValueError(f"Security error: Redirected to unauthorized external host '{hop_parsed.hostname}'.")

        try:
            resp = requests.get(
                current_url,
                allow_redirects=False,
                timeout=timeout_sec,
                headers=headers,
            )
        except requests.RequestException as exc:
            raise ValueError(f"Failed to connect to Google Maps server: {exc}")

        # Check redirect headers
        if resp.status_code in (301, 302, 303, 307, 308) and 'Location' in resp.headers:
            redirect_target = resp.headers['Location']
            next_url = urllib.parse.urljoin(current_url, redirect_target)
            coords = extract_coordinates_from_text(next_url)
            if coords:
                return coords
            current_url = next_url
            continue

        # If HTTP 200, check the final URL and page content
        if resp.status_code == 200:
            coords = extract_coordinates_from_text(resp.url)
            if coords:
                return coords
            # Try to extract from page HTML (meta tags, staticmap preview, or JSON payload)
            coords = extract_coordinates_from_text(resp.text)
            if coords:
                return coords
            break
        else:
            break

    raise ValueError("Could not extract geographic coordinates from the provided Google Maps link.")


class ResolveLocationLinkView(APIView):
    """
    POST /api/locations/resolve-link/
    Body: {"url": "https://maps.app.goo.gl/..."} or {"link": "33.6844, 73.0479"}
    Resolves Google Maps URLs or raw coordinates into {"latitude": float, "longitude": float}.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        link = (
            request.data.get('url') or
            request.data.get('link') or
            request.data.get('location_link') or
            request.data.get('query') or
            request.data.get('address') or
            ''
        )
        if not link or not str(link).strip():
            return Response(
                {'error': 'A Google Maps URL or raw "lat,lng" coordinate string is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = resolve_location_link(str(link).strip())
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Failed to resolve location link: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

