// Use an absolute file: URL on a persistent disk in production.
export const mastraStorageUrl = process.env.MASTRA_STORAGE_URL ?? 'file:../memory.db';
