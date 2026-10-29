export function localDataDir(): string;
export function ensurePrivateDataDir(dir?: string): string;
export function readPrivateFile(name: string): Buffer;
export function writePrivateFile(name: string, data: string | Uint8Array): void;
export function acquireDatabaseLock(dir?: string): () => void;
export function databasePath(): string;
export function assertOutsideCheckout(path: string): void;
export function isDatabaseLocked(dir?: string): boolean;
