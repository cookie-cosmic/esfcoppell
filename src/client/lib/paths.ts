/**
 * Private base path for the staff console. It is intentionally not linked from the
 * public navigation, and the only way in is the small staff icon in the site footer.
 * (Authorization is enforced by the server on every /api/admin request regardless.)
 */
export const STAFF_BASE = '/staff-portal';
