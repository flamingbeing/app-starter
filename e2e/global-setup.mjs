import { waitForEmulators } from '../.devkit/playwright/helpers.mjs';
export default () => waitForEmulators(['firestore', 'auth']);
