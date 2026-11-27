/**
 * HomeCare OS — Duty Countdown & Next Shift Helpers
 * ==================================================
 * Calculates duty countdown and status string for staff shifts,
 * handling overnight shifts that cross midnight, and next-shift formatting.
 */

export const SHIFT_NAME_RANGES = [
  { name: 'Morning', start: '06:00', end: '12:59' },
  { name: 'Evening', start: '13:00', end: '19:59' },
  { name: 'Night', start: '20:00', end: '05:59' },
];

/**
 * Derives shift category from start time:
 * 06:00 - 12:59 -> Morning
 * 13:00 - 19:59 -> Evening
 * 20:00 - 05:59 -> Night
 *
 * @param {string|Date} startInput
 * @returns {'Morning' | 'Evening' | 'Night'}
 */
export function getShiftCategory(startInput) {
  if (!startInput) return 'Morning';
  let hours = 0;
  let mins = 0;
  if (typeof startInput === 'string' && startInput.includes(':')) {
    const parts = startInput.trim().split(':');
    hours = parseInt(parts[0], 10);
    mins = parseInt(parts[1], 10) || 0;
  } else if (startInput instanceof Date) {
    hours = startInput.getHours();
    mins = startInput.getMinutes();
  }
  const totalMins = hours * 60 + mins;
  if (totalMins >= 6 * 60 && totalMins <= 12 * 60 + 59) {
    return 'Morning';
  } else if (totalMins >= 13 * 60 && totalMins <= 19 * 60 + 59) {
    return 'Evening';
  } else {
    return 'Night';
  }
}

/**
 * Formats next shift display string or fallback.
 *
 * @param {object|null} nextShift
 * @returns {string}
 */
export function formatNextShift(nextShift) {
  if (!nextShift) {
    return 'No upcoming shift in published roster';
  }
  const dateStr = nextShift.date_formatted || nextShift.date || '';
  const shiftName = nextShift.shift_name || 'Shift';
  const windowStr = nextShift.window ? ` (${nextShift.window})` : '';
  return `${dateStr}, ${shiftName}${windowStr}`.trim();
}

/**
 * Calculates duty countdown and status string for staff shifts,
 * handling overnight shifts that cross midnight.
 *
 * @param {Date|string} startInput - Shift start datetime
 * @param {Date|string} endInput - Shift end datetime
 * @param {Date|string} [currentInput] - Reference current time (defaults to now)
 * @returns {{
 *   status: 'before_shift' | 'on_duty' | 'off_duty',
 *   text: string,
 *   formatted_text: string,
 *   hours_remaining: number,
 *   minutes_remaining: number,
 *   seconds_remaining: number
 * }}
 */
export function calculateDutyCountdown(startInput, endInput, currentInput = new Date()) {
  const startDt = new Date(startInput);
  let endDt = new Date(endInput);
  const currentDt = new Date(currentInput);

  // If end time is before or equal to start time on same date, advance end date by 1 day
  if (endDt <= startDt) {
    endDt = new Date(endDt.getTime() + 24 * 60 * 60 * 1000);
  }

  if (currentDt < startDt) {
    const diffSeconds = Math.max(0, Math.floor((startDt.getTime() - currentDt.getTime()) / 1000));
    const hours = Math.floor(diffSeconds / 3600);
    const mins = Math.floor((diffSeconds % 3600) / 60);
    const formatted = `Starts in ${hours} hrs ${mins} mins`;
    return {
      status: 'before_shift',
      text: formatted,
      formatted_text: formatted,
      hours_remaining: hours,
      minutes_remaining: mins,
      seconds_remaining: diffSeconds,
    };
  } else if (currentDt >= startDt && currentDt <= endDt) {
    const diffSeconds = Math.max(0, Math.floor((endDt.getTime() - currentDt.getTime()) / 1000));
    const hours = Math.floor(diffSeconds / 3600);
    const mins = Math.floor((diffSeconds % 3600) / 60);
    const formatted = `On duty, ends in ${hours} hrs ${mins} mins`;
    return {
      status: 'on_duty',
      text: formatted,
      formatted_text: formatted,
      hours_remaining: hours,
      minutes_remaining: mins,
      seconds_remaining: diffSeconds,
    };
  } else {
    return {
      status: 'off_duty',
      text: 'Off duty',
      formatted_text: 'Off duty',
      hours_remaining: 0,
      minutes_remaining: 0,
      seconds_remaining: 0,
    };
  }
}
