export function localDataDir(): string;
export function ensurePrivateDataDir(): string;
export function readPrivateFile(name: string): Buffer;
export function writePrivateFile(name: string, data: string | Uint8Array): void;
export function acquireDatabaseLock(): () => void;
export function databasePath(): string;
export function assertOutsideCheckout(path: string): void;
