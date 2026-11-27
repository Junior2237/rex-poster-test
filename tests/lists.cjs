const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const registry = JSON.parse(read('face_safe_posters.json'));
const logos = JSON.parse(read('artwork_overrides.json'));
const source = read('rex_trakt_native_posters_test.js');
const subjects = {movie: [], tv: []};
for (const [key, row] of Object.entries(registry.overrides)) {
  const [media, id] = key.split(':');
  if (row.layouts.top20 && row.layouts.trending && !logos.overrides[key]?.requireManualLogo) {
    subjects[media].push({title: row.title, ids: {tmdb: Number(id)}});
  }
}
const storage = new Map();
let requests = 0, offlineRegistry = false, reverseRank = false;
let now = Math.max(Date.now(), Date.parse(registry.generatedAt));
const genre = {id: 18, name: 'Drama'};
const logo = {file_path: '/fixture-logo.png', width: 1000, height: 250, iso_639_1: 'en'};
const poster = {file_path: '/unapproved.jpg', width: 2000, height: 3000, iso_639_1: null};
function rows(media) {
  const entries = subjects[media].slice();
  return reverseRank ? entries.reverse() : entries;
}
function launch() {
  const context = {
    console: {log() {}, warn() {}},
    Date: class extends Date { static now() { return now; } },
    Widget: {
      storage: {get: k => storage.get(k), set: (k,v) => storage.set(k,v)},
      http: {async get(url) {
        requests++;
        if (url.includes('face_safe_posters')) {
          if (offlineRegistry) throw Error('Unreachable');
          return registry;
        }
        if (url.includes('artwork_overrides')) return logos;
        assert.ok(url.startsWith('https://api.trakt.tv/'), url);
        const media = url.includes('movies') ? 'movie' : 'tv';
        const key = media === 'tv' ? 'show' : 'movie';
        return rows(media).map((subject,i) => ({[key]: subject, rank: i+1}));
      }},
      tmdb: {async get(url) {
        requests++;
        if (url === 'trending/all/day') {
          const mixed = rows('movie').flatMap((m,i) => [[m,'movie'],[rows('tv')[i],'tv']])
            .filter(([subject]) => subject)
            .map(([subject,media_type]) => ({id:subject.ids.tmdb,title:subject.title,media_type}));
          return {results: mixed};
        }
        return {images: {posters:[poster], logos:[logo], backdrops:[]},
          genres:[genre],poster_path:poster.file_path,backdrop_path:'/landscape.jpg',vote_average:7,vote_count:100};
      }}
    }
  };
  vm.runInNewContext(source, context);
  return context;
}
async function runLists(context) {
  const summary = [];
  for (const [index,module] of context.WidgetMetadata.modules.entries()) {
    const results = await context[module.functionName]({traktClientId:'fixture'});
    const expected = index < 2 ? 20 : 30;
    assert.equal(results.length, expected, module.id);
    assert.equal(new Set(results.map(r => r.mediaType+':'+r.id)).size, expected);
    for (const item of results) {
      const choice = registry.overrides[item.mediaType+':'+item.id].layouts[index < 2 ? 'top20' : 'trending'];
      assert.equal(item.posterPath, choice.posterPath);
      assert.ok(item.lockedPosterPath.endsWith(choice.posterPath));
      assert.equal(item.backdropPaths[0], item.posterPath);
      assert.ok(item.titleLogoPath.endsWith('.png'));
    }
    summary.push(results.map(r => [r.id,r.posterPath]));
  }
  assert.equal(summary.length,7);
  return JSON.parse(JSON.stringify(summary));
}
(async () => {
  const first = await runLists(launch());
  const coldRequests = requests;
  assert.deepEqual(await runLists(launch()),first);
  assert.equal(requests,coldRequests,'warm restart should use zero requests');
  now += 5*3600000;
  offlineRegistry = true;
  assert.deepEqual(await runLists(launch()),first);
  reverseRank = true;
  now += 5*3600000;
  const reordered = await runLists(launch());
  assert.notDeepEqual(reordered,first,'rankings should change independently');
  storage.clear();
  offlineRegistry = false;
  assert.deepEqual(await runLists(launch()),reordered);
  console.log('Seven modules passed cold, warm restart, expired cache, registry outage, ranking changes and empty-storage restart. Warm requests: 0.');
})().catch(error => {console.error(error);process.exitCode=1;});
