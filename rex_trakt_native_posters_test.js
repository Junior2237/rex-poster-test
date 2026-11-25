
/*
 * REX — TRAKT TOP 20 NATIVE POSTERS
 * Version 1.0.0
 *
 * Uses Rex's native TMDB poster handling.
 * Returns the complete ranked list together.
 * Avoids custom poster URLs and image requests.
 *
 * Separate diagnostic module.
 * Production modules remain unchanged.
 */

var TRAKT_USER = "junior2237";

var MOVIES_LIST = "today-s-top-20-movies";
var SHOWS_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;

var TRAKT_PARAM = {
  name: "traktClientId",
  title: "Trakt Client ID (required)",
  type: "input",
  description: "Enter your Trakt API Client ID.",
  value: ""
};

var WidgetMetadata = {
  id: "junior.trakt.top20.native.test",
  title: "Trakt Top 20 — Rex Native Posters",
  description:
    "Top 20 rankings with Rex native artwork and cached list data",
  author: "Junior",
  version: "1.0.0",
  requiredVersion: "0.0.1",

  modules: [
    {
      id: "native-top20-movies",
      title: "TEST — Movies (Rex Native)",
      functionName: "loadNativeMovies",
      cacheDuration: 1800,
      params: [TRAKT_PARAM]
    },
    {
      id: "native-top20-shows",
      title: "TEST — TV Shows (Rex Native)",
      functionName: "loadNativeShows",
      cacheDuration: 1800,
      params: [TRAKT_PARAM]
    }
  ]
};

function unwrap(response) {
  var data = response;

  if (
    data &&
    typeof data === "object" &&
    data.data !== undefined
  ) {
    data = data.data;
  }

  if (typeof data === "string") {
    data = JSON.parse(data);
  }

  if (
    data &&
    !Array.isArray(data) &&
    Array.isArray(data.items)
  ) {
    data = data.items;
  }

  return data;
}

function positiveId(value) {
  var n = Number(value);

  return Number.isSafeInteger(n) && n > 0
    ? n
    : null;
}

function errorText(error) {
  return error && error.message
    ? error.message
    : String(error);
}

async function fetchList(slug, mediaType, clientId) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error(
      "Missing Trakt Client ID in Rex settings."
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
      "Trakt request failed: " + errorText(error)
    );
  }

  var data = unwrap(response);

  if (!Array.isArray(data)) {
    throw new Error(
      "Invalid Trakt response for " + slug
    );
  }

  var field =
    mediaType === "movie" ? "movie" : "show";

  var ranked = data
    .filter(function(row) {
      return row && (
        row[field] ||
        row.type === field
      );
    })
    .map(function(row, index) {
      var rank = Number(row.rank);

      return {
        row: row,
        rank:
          Number.isInteger(rank) && rank > 0
            ? rank
            : index + 1,
        index: index
      };
    });

  ranked.sort(function(a, b) {
    return (
      a.rank - b.rank ||
      a.index - b.index
    );
  });

  return ranked.slice(0, MAX_ITEMS);
}

function toNativeItem(entry, mediaType) {
  var row = entry.row;

  var subject =
    row.movie ||
    row.show ||
    row;

  var title = String(
    subject.title ||
    subject.name ||
    "Untitled"
  );

  var ids = subject.ids || row.ids || {};

  var tmdbId = positiveId(
    ids.tmdb ||
    subject.tmdb_id ||
    subject.tmdbId
  );

  var imdbId =
    ids.imdb ||
    subject.imdb_id ||
    subject.imdbId ||
    "";

  var item;

  if (tmdbId) {
    item = {
      id: mediaType + "." + tmdbId,
      type: "tmdb",
      tmdbId: tmdbId,
      mediaType: mediaType,
      title: title,
      rank: entry.rank,
      position: entry.rank
    };
  } else if (
    typeof imdbId === "string" &&
    /^tt\d+$/.test(imdbId)
  ) {
    item = {
      id: imdbId,
      type: "imdb",
      mediaType: mediaType,
      title: title,
      rank: entry.rank,
      position: entry.rank
    };
  } else {
    console.warn(
      "No usable identifier:",
      entry.rank,
      title
    );

    return null;
  }

  /*
   * Intentionally NO:
   *
   * posterPath
   * coverUrl
   * detailPoster
   * cleanPosterPath
   *
   * Rex handles native artwork.
   */

  return item;
}

async function loadNativeList(
  mediaType,
  slug,
  params
) {
  var config = params || {};

  var ranked = await fetchList(
    slug,
    mediaType,
    config.traktClientId
  );

  var results = ranked
    .map(function(entry) {
      return toNativeItem(entry, mediaType);
    })
    .filter(Boolean);

  console.log(
    "REX NATIVE:",
    mediaType,
    results.length,
    "titles loaded"
  );

  if (!results.length) {
    throw new Error(
      "No matching media IDs available."
    );
  }

  if (results.length !== MAX_ITEMS) {
    console.warn(
      "Expected 20 titles, got",
      results.length
    );
  }

  return results;
}

async function loadNativeMovies(params) {
  return loadNativeList(
    "movie",
    MOVIES_LIST,
    params
  );
}

async function loadNativeShows(params) {
  return loadNativeList(
    "tv",
    SHOWS_LIST,
    params
  );
}
