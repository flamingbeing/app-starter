// Types the checker can't find on its own (tsconfig.json). Firebase and the update register script load by URL
// (index.html's import map), so they are typed loosely here; app-sync's own types come from its .d.ts.
declare module 'firebase/app';
declare module 'firebase/auth';
declare module 'firebase/firestore';
declare module 'app-update/register.js';

interface Window {
  /** What the tests read: set by app.js. */
  starter: {
    ready: boolean;
    add: (text: string) => Promise<unknown> | undefined;
    phase?: string;
    role?: string | null;
    items?: string[];
    status?: string;
    conflicts?: number;
    [key: string]: unknown;
  };
}
