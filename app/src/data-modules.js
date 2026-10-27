// The data side of the optional modules, each wired in by `node tools/add.mjs <recipe>` (README, "Modules"): one import
// and one slot entry per module, written after the "add:" marks and taken out again by `add.mjs --remove`. cloud.js asks
// for a slot; an empty slot costs the app nothing.
// add: imports

/**
 * The files recipe's data side (recipes/files.json, files-data.js).
 * @typedef {object} FilesData
 * @property {string} coll  the collection the file records sync in
 * @property {(space: string) => unknown} engine  the @core/files module for createApp
 * @property {(app: any, space: string, onFiles: (byItem: Map<string, unknown[]>) => void) => () => void} watch  every item's files, whenever one changes -> stop
 * @property {(app: any, attached: unknown[]) => Promise<void>} removeAll  takes an item's files with it
 */

/** @type {{ files?: FilesData }} */
export const dataModules = {
  // add: slots
};
