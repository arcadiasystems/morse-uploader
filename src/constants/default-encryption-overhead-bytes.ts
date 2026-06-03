/**
 * Approximate bytes the Seal envelope adds to a ciphertext, used to nudge the
 * cost estimate when encryption is enabled. Small relative to most files;
 * consumers override per-call via `encryptionOverheadBytes`.
 */
export const DEFAULT_ENCRYPTION_OVERHEAD_BYTES = 150;
