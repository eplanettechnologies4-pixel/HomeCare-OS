/**
 * Time and greeting utilities strictly aligned with Asia/Karachi timezone.
 */

/**
 * Returns the hour (0-23) in Asia/Karachi for a given date/time input.
 */
export function getPKTHour(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    hour12: false,
  }).format(d);
  return parseInt(hourStr, 10);
}

/**
 * Returns time-of-day greeting based on Asia/Karachi local hour:
 * - 05:00 to 11:59: 'Good morning'
 * - 12:00 to 16:59: 'Good afternoon'
 * - 17:00 to 04:59: 'Good evening'
 */
export function getPKTGreeting(dateInput = new Date()) {
  const hour = getPKTHour(dateInput);
  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  } else {
    return 'Good evening';
  }
}

/**
 * Formats time in standard 12-hour AM/PM format strictly in Asia/Karachi.
 * e.g., '01:11:00 PM', '12:05:00 AM', '12:00:00 PM'
 */
export function formatPKTTime(dateInput = new Date(), options = {}) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const { includeSeconds = true } = options;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(d);
}

/**
 * Formats date strictly in Asia/Karachi.
 * e.g., 'Friday, Nov 14, 2026'
 */
export function formatPKTDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

