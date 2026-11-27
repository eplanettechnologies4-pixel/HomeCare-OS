"""
HomeCare OS — Duty Countdown & Roster Helpers
==============================================
Calculates shift countdown and duty status accurately, including overnight shifts
crossing midnight (e.g. 20:00 to 08:00) in Asia/Karachi timezone, and provides
shift name derivation and location mapping helpers.
"""
import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo
from django.conf import settings
from django.utils import timezone


# PROVISIONAL: start 06:00-12:59 Morning, 13:00-19:59 Evening, 20:00-05:59 Night
SHIFT_NAME_RANGES = (
    ("Morning", datetime.time(6, 0), datetime.time(12, 59)),
    ("Evening", datetime.time(13, 0), datetime.time(19, 59)),
    ("Night", datetime.time(20, 0), datetime.time(5, 59)),
)


def get_shift_category(start_time):
    """
    Categorizes shift based on start_time:
      06:00 - 12:59 -> Morning
      13:00 - 19:59 -> Evening
      20:00 - 05:59 -> Night
    """
    if start_time is None:
        return "Morning"

    # Convert to minutes from midnight
    minutes = start_time.hour * 60 + start_time.minute
    if 6 * 60 <= minutes <= 12 * 60 + 59:
        return "Morning"
    elif 13 * 60 <= minutes <= 19 * 60 + 59:
        return "Evening"
    else:
        return "Night"


def derive_shift_name(start_time, stored_shift_name=None):
    """
    Derives shift name from shift start time unless roster already stores a recognized shift type.
    Boundary examples:
      05:59 -> Night Shift
      06:00 -> Morning Shift
      12:59 -> Morning Shift
      13:00 -> Evening Shift
      19:59 -> Evening Shift
      20:00 -> Night Shift
    """
    if stored_shift_name:
        s_lower = str(stored_shift_name).strip().lower()
        if any(k in s_lower for k in ('morning', 'evening', 'night')):
            return str(stored_shift_name).strip()

    category = get_shift_category(start_time)
    return f"{category} Shift"


def format_12hr_time(t):
    """
    Formats a datetime.time or datetime.datetime object into 12-hour format without leading zero.
    e.g. 08:00:00 -> 8:00 AM, 16:30:00 -> 4:30 PM.
    """
    if t is None:
        return ""
    if isinstance(t, str):
        return t
    h = t.hour
    m = t.minute
    ampm = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}:{m:02d} {ampm}"


def build_maps_link(patient=None, booking=None, address=None):
    """
    Builds Google Maps link prioritizing saved coordinates:
    1. Patient latitude/longitude if both are present
    2. Booking latitude/longitude if both are present
    3. Written street address
    """
    lat = None
    lng = None
    if patient and getattr(patient, 'latitude', None) is not None and getattr(patient, 'longitude', None) is not None:
        lat = patient.latitude
        lng = patient.longitude
    elif booking and getattr(booking, 'latitude', None) is not None and getattr(booking, 'longitude', None) is not None:
        lat = booking.latitude
        lng = booking.longitude

    if lat is not None and lng is not None:
        return f"https://www.google.com/maps?q={lat},{lng}"

    addr = address or (getattr(patient, 'address', None) if patient else None) or (getattr(booking, 'address', None) if booking else None)
    if addr and str(addr).strip() and str(addr).strip() != 'Not recorded':
        return f"https://www.google.com/maps/search/?api=1&query={quote(str(addr).strip())}"

    return ""


def calculate_duty_countdown(start_dt, end_dt, current_dt=None):
    """
    Calculates countdown and status for a shift given start_dt and end_dt.
    Returns:
    {
        'status': 'before_shift' | 'on_duty' | 'off_duty',
        'text': 'Starts in H hrs M mins' | 'On duty, ends in H hrs M mins' | 'Off duty',
        'hours_remaining': int,
        'minutes_remaining': int,
        'seconds_remaining': int,
    }
    """
    if current_dt is None:
        tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = timezone.get_current_timezone()
        current_dt = timezone.now().astimezone(local_tz)

    if current_dt < start_dt:
        diff_s = int((start_dt - current_dt).total_seconds())
        hrs = diff_s // 3600
        mins = (diff_s % 3600) // 60
        return {
            'status': 'before_shift',
            'text': f"Starts in {hrs} hrs {mins} mins",
            'formatted_text': f"Starts in {hrs} hrs {mins} mins",
            'hours_remaining': hrs,
            'minutes_remaining': mins,
            'seconds_remaining': diff_s,
        }
    elif start_dt <= current_dt <= end_dt:
        diff_s = int((end_dt - current_dt).total_seconds())
        hrs = diff_s // 3600
        mins = (diff_s % 3600) // 60
        return {
            'status': 'on_duty',
            'text': f"On duty, ends in {hrs} hrs {mins} mins",
            'formatted_text': f"On duty, ends in {hrs} hrs {mins} mins",
            'hours_remaining': hrs,
            'minutes_remaining': mins,
            'seconds_remaining': diff_s,
        }
    else:
        return {
            'status': 'off_duty',
            'text': "Off duty",
            'formatted_text': "Off duty",
            'hours_remaining': 0,
            'minutes_remaining': 0,
            'seconds_remaining': 0,
        }
