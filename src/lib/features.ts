/**
 * Feature switches for things that are built but not ready to be seen.
 *
 * Hiding beats deleting while a feature is only temporarily off: the server
 * action, the OAuth callback route, and the legal-acknowledgment step all
 * stay in place and tested, so turning it back on is this one line rather
 * than a rebuild.
 */

/**
 * Google sign-in. OFF for now — the Google Cloud credentials aren't set up,
 * so the button led testers into a broken flow. Everything behind it still
 * exists; flip this to true once the OAuth client is configured (SETUP.md).
 */
export const GOOGLE_SIGN_IN_ENABLED = false;
