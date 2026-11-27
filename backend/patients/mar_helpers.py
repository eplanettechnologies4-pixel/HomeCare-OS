"""
HomeCare OS — Medication Administration Record (MAR) Slot & Sheet Helpers
========================================================================
Implements slot generator logic, default times, and paper-style MAR sheet
computation based on MAR.xlsx and hospital drug administration records.
"""
import re
from django.conf import settings


# PROVISIONAL - Default row counts per frequency
DEFAULT_ROW_COUNTS = {
    'OD': 1,
    'BD': 2,
    'TDS': 3,
    'QID': 4,
    'PRN': 4,
    'SOS': 4,
    'STAT': 1,
    '4 Hourly': 6,
    'HS': 1,
}

# PROVISIONAL - Default slot times per frequency (from MAR.xlsx)
DEFAULT_SLOT_TIMES = {
    'TDS': ['06:00', '14:00', '22:00'],
    'QID': ['06:00', '12:00', '18:00', '00:00'],
    '4 Hourly': ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    'OD': ['09:00'],
    'BD': ['08:00', '20:00'],
    'HS': ['22:00'],
    'STAT': ['STAT'],
    'PRN': ['PRN 1', 'PRN 2', 'PRN 3', 'PRN 4'],
    'SOS': ['SOS 1', 'SOS 2', 'SOS 3', 'SOS 4'],
}

FREQUENCY_ALIASES = {
    'od': 'OD',
    'once daily': 'OD',
    'daily': 'OD',
    'bd': 'BD',
    'bid': 'BD',
    'twice daily': 'BD',
    'tds': 'TDS',
    'tid': 'TDS',
    'three times daily': 'TDS',
    'qid': 'QID',
    'four times daily': 'QID',
    'prn': 'PRN',
    'as needed': 'PRN',
    'sos': 'SOS',
    'stat': 'STAT',
    'immediately': 'STAT',
    '4 hourly': '4 Hourly',
    'q4h': '4 Hourly',
    'every 4 hours': '4 Hourly',
    'hs': 'HS',
    'at bedtime': 'HS',
    'once daily at bedtime': 'HS',
}


def normalize_frequency(freq_str):
    """Normalize free text frequency to canonical key, or None if unmapped."""
    if not freq_str:
        return None
    cleaned = str(freq_str).strip().lower()
    if cleaned in FREQUENCY_ALIASES:
        return FREQUENCY_ALIASES[cleaned]
    # Check if starts with alias
    for alias, canon in FREQUENCY_ALIASES.items():
        if cleaned == alias or cleaned.startswith(f"{alias} ") or cleaned.startswith(f"{alias}/"):
            return canon
    return None


def get_frequency_slots(frequency_str, explicit_times=None):
    """
    Returns slot configuration for a frequency:
    {
        'canonical_frequency': str or None,
        'row_count': int,
        'slot_times': list of str,
        'is_unmapped': bool,
        'is_prn_sos': bool,
        'is_stat': bool,
    }
    """
    row_counts = getattr(settings, 'MAR_ROW_COUNTS', DEFAULT_ROW_COUNTS)
    default_slots = getattr(settings, 'MAR_DEFAULT_SLOTS', DEFAULT_SLOT_TIMES)

    canonical = normalize_frequency(frequency_str)

    if explicit_times and isinstance(explicit_times, list) and len(explicit_times) > 0:
        clean_explicit = [str(t).strip() for t in explicit_times if str(t).strip()]
        if clean_explicit:
            return {
                'canonical_frequency': canonical or frequency_str,
                'row_count': len(clean_explicit),
                'slot_times': clean_explicit,
                'is_unmapped': canonical is None,
                'is_prn_sos': canonical in ('PRN', 'SOS'),
                'is_stat': canonical == 'STAT',
            }

    if canonical and canonical in row_counts:
        count = row_counts[canonical]
        slots = list(default_slots.get(canonical, [f"Dose {i+1}" for i in range(count)]))
        return {
            'canonical_frequency': canonical,
            'row_count': count,
            'slot_times': slots,
            'is_unmapped': False,
            'is_prn_sos': canonical in ('PRN', 'SOS'),
            'is_stat': canonical == 'STAT',
        }

    # Fallback for unmapped frequency: single free row
    return {
        'canonical_frequency': None,
        'row_count': 1,
        'slot_times': ['Slot 1'],
        'is_unmapped': True,
        'is_prn_sos': False,
        'is_stat': False,
    }

