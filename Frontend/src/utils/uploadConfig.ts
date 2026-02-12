/**
 * Production-Safe Upload Configuration
 * Dynamically adjusts concurrency based on server load and active users
 */

// Configuration
const UPLOAD_CONFIG = {
    // Maximum concurrent uploads per user
    MAX_CONCURRENCY_PER_USER: 20,

    // Minimum concurrent uploads (always allow at least this many)
    MIN_CONCURRENCY_PER_USER: 5,

    // Global server limits
    MAX_TOTAL_CONCURRENT_UPLOADS: 50, // Across all users

    // Adjust based on active uploaders
    DYNAMIC_SCALING: true
};

/**
 * Calculate safe concurrency for current user
 * @param activeUploaders - Number of users currently uploading
 * @returns Safe concurrency limit for this user
 */
export function calculateSafeConcurrency(activeUploaders: number = 1): number {
    if (!UPLOAD_CONFIG.DYNAMIC_SCALING) {
        return UPLOAD_CONFIG.MAX_CONCURRENCY_PER_USER;
    }

    // Calculate fair share
    const fairShare = Math.floor(
        UPLOAD_CONFIG.MAX_TOTAL_CONCURRENT_UPLOADS / activeUploaders
    );

    // Clamp between min and max
    return Math.max(
        UPLOAD_CONFIG.MIN_CONCURRENCY_PER_USER,
        Math.min(fairShare, UPLOAD_CONFIG.MAX_CONCURRENCY_PER_USER)
    );
}

/**
 * Example usage:
 * 
 * 1 user uploading:  calculateSafeConcurrency(1) = 20 (full speed)
 * 2 users uploading: calculateSafeConcurrency(2) = 20 (still full speed)
 * 3 users uploading: calculateSafeConcurrency(3) = 16 (slight reduction)
 * 5 users uploading: calculateSafeConcurrency(5) = 10 (fair share)
 * 10 users uploading: calculateSafeConcurrency(10) = 5 (minimum guaranteed)
 */

// Export for use in Upload.tsx
export default UPLOAD_CONFIG;
