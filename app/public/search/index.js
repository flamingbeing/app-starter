// @core/search (incubating here; it moves into app-sync once a second kind of app uses it): full-text search over the
// records an app holds, with operators. Named exports only and nothing runs on import, so a build keeps only what a
// page uses.
//   createSearch(options)  the index: feed, update, remove, search (search.js)
//   parseQuery             the box's text -> terms, on its own (query.js, pure)
export { createSearch } from './search.js';
export { parseQuery, editDistance } from './query.js';
