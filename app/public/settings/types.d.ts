// Types for @core/settings (app/public/settings/). The comments at the top of module.js say what each does.

export interface OptionSpec {
  scope?: 'device' | 'account';
  default?: unknown;
  clean?: (value: unknown) => unknown;
  portable?: boolean;
}

export interface ProfileSpec {
  label?: string;
  defaults?: Record<string, unknown>;
}

export interface SettingsOptions {
  options: Record<string, OptionSpec>;
  profiles?: Record<string, ProfileSpec>;
  collection?: string;
  scope?: string | ((user: { uid: string }) => string);
}

export interface SettingsApi {
  get(key: string): any;
  set(key: string, value: unknown): Promise<void>;
  watch(key: string | null, fn: (value: any, key: string) => void): () => void;
  activeProfile(): string | null;
  profile(id: string | null): Promise<void>;
  isCustom(): boolean;
  profiles(): { id: string; label: string }[];
  exportFile(): string;
  importFile(text: string): Promise<{ changed: string[]; dropped: string[] }>;
  follow(): () => void;
}
