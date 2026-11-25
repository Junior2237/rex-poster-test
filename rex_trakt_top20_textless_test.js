
/*
 * REX — TRAKT TOP 20
 * Version 1.6.0
 *
 * Adds Original Quality test modules.
 * Preserves the working v1.5-style modules.
 * Does not change production widgets.
 */

var TRAKT_USER = "junior2237";
var TRAKT_MOVIES = "today-s-top-20-movies";
var TRAKT_SHOWS = "today-s-top-20-tv-shows";
var MAX_TITLES = 20;
var BATCH_SIZE = 4;

var TRAKT_PARAM = {
  name: "traktClientId",
  title: "Trakt Client ID (required)",
  type: "input",
  description: "Your Trakt API Client ID",
  value: ""
};

var WidgetMetadata = {
  id: "junior.trakt.top20.textless.test",
  title: "Trakt Top 20 — Poster Quality Test",
  description: "Compare standard and original-quality TMDB posters",
  author: "Junior",
  version: "1.6.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      id: "top20-movies-textless",
      title: "TEST — Movies (Working v1.5)",
      functionName: "loadMoviesStandard",
      cacheDuration: 0,
      params: [TRAKT_PARAM]
    },
    {
      id: "top20-shows-textless",
      title: "TEST — TV Shows (Working v1.5)",
      functionName: "loadShowsStandard",
      cacheDuration: 0,
      params: [TRAKT_PARAM]
    },
    {
      id: "top20-movies-original",
      title: "TEST — Movies (Original Quality)",
      functionName: "loadMoviesOriginal",
      cacheDuration: 0,
      params: [TRAKT_PARAM]
    },
    {
      id: "top20-shows-original",
      title: "TEST — TV Shows (Original Quality)",
      functionName: "loadShowsOriginal",
      cacheDuration: 0,
      params: [TRAKT_PARAM]
    }
  ]
};

function unwrapResponse(response) {
  var value = response;

  if (
    value &&
    typeof value === "object" &&
    value.data !== undefined
  ) {
    value = value.data;
  }

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error("API returned non-JSON data");
    }
  }

  return value;
}

function errorMessage(error) {
  return error && error.message
    ? error.message
    : String(error);
}

function positiveId(value) {
  var n = Number(value);

  return Number.isSafeInteger(n) && n > 0
    ? n
    : null;
}

function getTitle(entry) {
  var subject = entry.movie || entry.show || entry;

  return String(
    subject.title ||
    subject.name ||
    "Untitled"
  );
}

function getIds(entry) {
  var subject = entry.movie || entry.show || entry;
  var ids = subject.ids || entry.ids || {};

  var imdb =
    ids.imdb ||
    subject.imdb_id ||
    subject.imdbId ||
    "";

  return {
    tmdb: positiveId(
      ids.tmdb ||
      subject.tmdb_id ||
      subject.tmdbId
    ),

    imdb:
      typeof imdb === "string" &&
      /^tt\d+$/.test(imdb)
        ? imdb
        : null
  };
}

function getRank(entry, index) {
  var rank = Number(entry.rank);

  return Number.isInteger(rank) && rank > 0
    ? rank
    : index + 1;
}

/*
 * TRAKT — PRESERVE CURRENT RANKING
 */

async function fetchTraktList(
  slug,
  mediaType,
  clientId
) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error(
      "Missing Trakt Client ID in module settings."
    );
  }

  var url =
    "https://api.trakt.tv/users/" +
    encodeURIComponent(TRAKT_USER) +
    "/lists/" +
    encodeURIComponent(slug) +
    "/items";

  var response;

  try {
    response = await Widget.http.get(url, {
      headers: {
        Accept: "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": key
      },
      params: {
        page: 1,
        limit: 100
      }
    });
  } catch (error) {
    throw new Error(
      "Trakt request failed: " +
      errorMessage(error)
    );
  }

  var data = unwrapResponse(response);

  if (
    data &&
    !Array.isArray(data) &&
    Array.isArray(data.items)
  ) {
    data = data.items;
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Unexpected Trakt response for " + slug
    );
  }

  var expected =
    mediaType === "movie" ? "movie" : "show";

  var ranked = data.filter(function(entry) {
    return entry && (
      entry[expected] ||
      entry.type === expected
    );
  }).map(function(entry, index) {
    return {
      entry: entry,
      rank: getRank(entry, index),
      originalIndex: index
    };
  });

  ranked.sort(function(a, b) {
    return (
      a.rank - b.rank ||
      a.originalIndex - b.originalIndex
    );
  });

  ranked = ranked.slice(0, MAX_TITLES);

  if (!ranked.length) {
    throw new Error(
      "Trakt returned no titles for " + slug
    );
  }

  console.log(
    "TRAKT:",
    slug,
    ranked.length,
    "titles"
  );

  return ranked;
}

/*
 * TMDB IMAGE UTILITIES
 */

function validImagePath(path) {
  return (
    typeof path === "string" &&
    (
      path.charAt(0) === "/" ||
      /^https?:\/\//i.test(path)
    )
  );
}

function originalUrl(path) {
  if (!validImagePath(path)) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return (
    "https://image.tmdb.org/t/p/original" +
    path
  );
}

/*
 * WORKING V1.5 POSTER SELECTION
 *
 * Largest valid textless image first.
 */

function standardSelection(posters, textlessOnly) {
  if (!Array.isArray(posters)) {
    return null;
  }

  var candidates = posters.filter(function(p) {
    if (!p || !validImagePath(p.file_path)) {
      return false;
    }

    if (textlessOnly && p.iso_639_1 != null) {
      return false;
    }

    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;
    var ratio = height ? width / height : 0;

    return (
      width >= 500 &&
      height >= 700 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });

  candidates.sort(function(a, b) {
    var areaA =
      (Number(a.width) || 0) *
      (Number(a.height) || 0);

    var areaB =
      (Number(b.width) || 0) *
      (Number(b.height) || 0);

    if (areaB !== areaA) {
      return areaB - areaA;
    }

    return (
      (Number(b.vote_average) || 0) -
      (Number(a.vote_average) || 0)
    );
  });

  return candidates[0] || null;
}

/*
 * ORIGINAL QUALITY POSTER SELECTION
 *
 * Priorities:
 * 1. High-resolution textless
 * 2. High-resolution conventional
 * 3. Best remaining textless
 * 4. Best remaining conventional
 *
 * Within each tier, quality votes and
 * actual source dimensions determine rank.
 */

function qualitySelection(posters) {
  if (!Array.isArray(posters)) {
    return null;
  }

  var valid = posters.filter(function(p) {
    if (!p || !validImagePath(p.file_path)) {
      return false;
    }

    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;
    var ratio = height ? width / height : 0;

    return (
      width >= 500 &&
      height >= 700 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });

  function tier(p) {
    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;

    var highRes =
      width >= 1200 &&
      height >= 1800;

    var textless =
      p.iso_639_1 == null;

    if (highRes && textless) return 4;
    if (highRes) return 3;
    if (textless) return 2;
    return 1;
  }

  function score(p) {
    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;

    var votes = Math.max(
      0,
      Number(p.vote_count) || 0
    );

    var rating = Math.max(
      0,
      Number(p.vote_average) || 0
    );

    var pixels = Math.min(
      width * height,
      12000000
    );

    return (
      Math.min(votes, 200) * 1000 +
      rating * 1000 +
      pixels / 1000
    );
  }

  valid.sort(function(a, b) {
    return (
      tier(b) - tier(a) ||
      score(b) - score(a)
    );
  });

  return valid[0] || null;
}

/*
 * IMDb -> TMDB ID FALLBACK
 */

async function resolveTmdbId(
  mediaType,
  ids,
  title
) {
  if (ids.tmdb) {
    return ids.tmdb;
  }

  if (!ids.imdb) {
    return null;
  }

  try {
    var response = await Widget.tmdb.get(
      "find/" + ids.imdb,
      {
        params: {
          external_source: "imdb_id"
        }
      }
    );

    var data = unwrapResponse(response);

    var matches =
      mediaType === "movie"
        ? data.movie_results
        : data.tv_results;

    if (
      Array.isArray(matches) &&
      matches.length
    ) {
      return positiveId(matches[0].id);
    }
  } catch (error) {
    console.warn(
      "TMDB ID lookup failed:",
      title,
      errorMessage(error)
    );
  }

  return null;
}

/*
 * POSTER FETCHING
 */

async function fetchPoster(
  mediaType,
  tmdbId,
  title,
  qualityMode
) {
  if (!tmdbId) {
    return "";
  }

  try {
    var response = await Widget.tmdb.get(
      mediaType + "/" + tmdbId + "/images",
      {
        params: {
          include_image_language: "null,en"
        }
      }
    );

    var images = unwrapResponse(response);
    var posters = images && images.posters;

    var selected;

    if (qualityMode === "original") {
      selected = qualitySelection(posters);
    } else {
      selected =
        standardSelection(posters, true) ||
        standardSelection(posters, false);
    }

    if (selected) {
      console.log(
        "POSTER:",
        title,
        selected.width + "x" + selected.height,
        "mode:",
        qualityMode
      );

      return selected.file_path;
    }
  } catch (error) {
    console.warn(
      "Poster gallery failed:",
      title,
      errorMessage(error)
    );
  }

  /*
   * Preserve the successful fallback
   * from v1.5.0.
   */

  try {
    var response = await Widget.tmdb.get(
      mediaType + "/" + tmdbId,
      {
        params: {
          language: "en-US"
        }
      }
    );

    var details = unwrapResponse(response);

    if (
      details &&
      validImagePath(details.poster_path)
    ) {
      return details.poster_path;
    }

    if (
      details &&
      validImagePath(details.backdrop_path)
    ) {
      return details.backdrop_path;
    }
  } catch (error) {
    console.warn(
      "Poster fallback failed:",
      title,
      errorMessage(error)
    );
  }

  return "";
}

/*
 * BUILD REX ITEMS
 */

async function buildItem(
  rankedItem,
  mediaType,
  qualityMode
) {
  var entry = rankedItem.entry;

  var title = getTitle(entry);
  var ids = getIds(entry);

  var tmdbId = await resolveTmdbId(
    mediaType,
    ids,
    title
  );

  if (!tmdbId && !ids.imdb) {
    console.warn(
      "Missing ID:",
      title,
      rankedItem.rank
    );

    return null;
  }

  var result = {
    id: tmdbId
      ? mediaType + "." + tmdbId
      : ids.imdb,

    type: tmdbId ? "tmdb" : "imdb",

    mediaType: mediaType,

    title: title,

    rank: rankedItem.rank,
    position: rankedItem.rank
  };

  if (tmdbId) {
    result.tmdbId = tmdbId;

    var path = await fetchPoster(
      mediaType,
      tmdbId,
      title,
      qualityMode
    );

    if (path) {
      if (qualityMode === "original") {
        /*
         * Direct ORIGINAL CDN request.
         *
         * No posterPath here:
         * in portrait slots Rex should
         * fall through to coverUrl.
         *
         * This tests whether bypassing
         * Rex's normal TMDB path sizing
         * improves image sharpness.
         */
        result.coverUrl = originalUrl(path);
      } else {
        /*
         * Preserve working v1.5 behavior.
         */
        result.posterPath = path;
        result.detailPoster = path;
        result.coverUrl = originalUrl(path);
      }
    }
  }

  return result;
}

/*
 * COMPLETE TOP 20 LOAD
 */

async function runList(
  mediaType,
  slug,
  params,
  qualityMode
) {
  var options = params || {};

  var ranked = await fetchTraktList(
    slug,
    mediaType,
    options.traktClientId
  );

  var results = [];

  for (
    var start = 0;
    start < ranked.length;
    start += BATCH_SIZE
  ) {
    var batch = ranked.slice(
      start,
      start + BATCH_SIZE
    );

    var completed = await Promise.all(
      batch.map(async function(item) {
        try {
          return await buildItem(
            item,
            mediaType,
            qualityMode
          );
        } catch (error) {
          console.warn(
            "Title failed:",
            item.rank,
            errorMessage(error)
          );

          return null;
        }
      })
    );

    results = results.concat(
      completed.filter(Boolean)
    );
  }

  console.log(
    "FINAL:",
    mediaType,
    qualityMode,
    results.length,
    "of",
    ranked.length
  );

  if (!results.length) {
    throw new Error(
      "No usable titles returned."
    );
  }

  return results;
}

/*
 * WORKING TEST MODULES
 */

async function loadMoviesStandard(params) {
  return runList(
    "movie",
    TRAKT_MOVIES,
    params,
    "standard"
  );
}

async function loadShowsStandard(params) {
  return runList(
    "tv",
    TRAKT_SHOWS,
    params,
    "standard"
  );
}

/*
 * ORIGINAL QUALITY TEST MODULES
 */

async function loadMoviesOriginal(params) {
  return runList(
    "movie",
    TRAKT_MOVIES,
    params,
    "original"
  );
}

async function loadShowsOriginal(params) {
  return runList(
    "tv",
    TRAKT_SHOWS,
    params,
    "original"
  );
}
