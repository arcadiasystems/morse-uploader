/**
 * Default number of Walrus epochs to store a blob for when neither the upload
 * call nor the provider specifies one. Consumers override via the provider's
 * `defaultEpochs` or per-upload `epochs`.
 */
export const DEFAULT_EPOCHS = 12;
