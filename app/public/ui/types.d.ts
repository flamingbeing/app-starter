// The parts of the engine modules' public APIs the kit reads (app-sync 1.0, README). The kit never imports the engine:
// a page hands each part the module api it shows (app.sync, app.auth, app.update).

export interface SyncStatus { state: string; count: number }

/** One side of a held save, as sync.describe(key) gives it. */
export interface Side { value: unknown; when?: string; by?: string; device?: string }

export interface Conflict {
  key: string;
  mine: Side;
  theirs: Side;
  deleted: { mine: boolean; theirs: boolean };
  fields: { path: string; mine: Side; theirs: Side }[];
}

export type Pick = 'mine' | 'theirs';

export interface RefusedJob { key: string; code?: string; error?: string; record?: Record<string, unknown> | null }

export interface SyncApi {
  status$(cb: (st: SyncStatus) => void): () => void;
  conflicts(): { key: string }[];
  describe(key: string): Conflict | null;
  resolve(key: string, choice: Pick | Record<string, Pick>): Promise<unknown>;
  queue: {
    refused(kind?: string): RefusedJob[];
    retry(key: string): Promise<unknown>;
    discard(key: string): Promise<unknown>;
    onChange(cb: () => void): () => void;
  };
}

export interface AuthApi {
  signIn(): Promise<{ ok: boolean; reason: string; from?: { email?: string } | null }>;
  forget(o: { force: boolean }): Promise<{ ok: boolean; reason: string; failed?: string[] }>;
  onUser(cb: (user: unknown) => void): () => void;
}

export interface UpdateApi {
  versionLabel(): Promise<string>;
  checkNow(): Promise<boolean>;
  retryUpdate(): unknown;
}
