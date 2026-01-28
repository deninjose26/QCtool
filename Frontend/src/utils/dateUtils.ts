/**
 * Centralized utility for date formatting and timezone handling.
 * Ensures consistent display of UTC timestamps in local timezone.
 */

/**
 * Parses a date string (expected to be UTC from backend) and converts it to local timezone string.
 * @param dateStr ISO date string or date-like string
 * @returns Formatted local date string
 */
export const formatToLocalTime = (dateStr: string | undefined | null): string => {
    if (!dateStr) return 'N/A';

    // The backend now sends timestamps in IST. 
    // We should not force 'Z' (UTC) anymore.
    const normalizedDateStr = dateStr.replace(' ', 'T');

    try {
        const date = new Date(normalizedDateStr);
        if (isNaN(date.getTime())) return 'Invalid Date';

        // Use Indian locale for formatting
        return date.toLocaleString('en-IN');
    } catch (e) {
        return 'Invalid Date';
    }
};

/**
 * Formats a date for Excel export.
 */
export const formatForExcel = (dateStr: string | undefined | null): string => {
    return formatToLocalTime(dateStr);
};
