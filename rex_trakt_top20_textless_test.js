
/*
 * REX — TRAKT TOP 20 TEXTLESS TEST
 * Version 1.2.0
 *
 * Separate test module.
 * Does not modify production widgets.
 *
 * Movies:
 * today-s-top-20-movies
 *
 * TV:
 * today-s-top-20-tv-shows
 */

var WidgetMetadata = {
  id: "junior.trakt.top20.textless.test",
  title: "Trakt Top 20 — Textless Test",
  description:
    "Test high-quality textless TMDB posters using existing Trakt rankings",
  author: "Custom Rex Home",
  version: "1.2.0",
  requiredVersion: "0.0.1",

  globalParams: [
    {
      name: "traktClientId",
      title: "Trakt Client ID (required)",
      type: "input",
      description:
        "Enter your Trakt API Client ID. Do not enter the Client Secret.",
      value: ""
    }
  ],

  modules: [
    {
      id: "top20-movies-textless",
      title: "TEST — Top 20 Movies (Textless)",
      functionName: "loadTop20Movies",
      cacheDuration: 300,
      params: []
    },
    {
      id: "top20-shows-textless",
      title: "TEST — Top 20 TV Shows (Textless)",
      functionName: "loadTop20Shows",
      cacheDuration: 300,
      params: []
    }
  ]
};

var TRAKT_USER = "junior2237";
var MOVIES_LIST = "today-s-top-20-movies";
var SHOWS_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;
var BATCH_SIZE = 4;

function toId(value) {
  var n = Number(value);

  if (!Number.isSafeInteger(n) || n <= 0) {
    return null;
  }

  return n;
}

function errorText(error) {
  return error && error.message
    ? error.message
    : String(error);
}

/*
 * FETCH TRAKT LIST
 */

async function getTraktList(slug, mediaType, clientId) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error(
      "Missing Trakt Client ID. Enter it in the module settings."
    );
  }

  var category =
    mediaType === "movie" ? "movies" : "shows";

  var url =
    "https://api.trakt.tv/users/" +
    TRAKT_USER +
    "/lists/" +
    slug +
    "/items/" +
    category +
    "/rank/asc";

  console.log("Loading Trakt list:", slug);

  var response;

  try {
    response = await Widget.http.get(url, {
      params: {
        page: 1,
        limit: MAX_ITEMS
      },
      headers: {
        Accept: "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": key
      }
    });
  } catch (error) {
    throw new Error(
      "Trakt request failed for " +
      slug +
      ": " +
      errorText(error)
    );
  }

  var data = response.data;

  if (!Array.isArray(data)) {
    throw new Error(
      "Unexpected Trakt response for " + slug
    );
  }

  var entries = data.map(function(row, index) {
    var rank = Number(row.rank);

    return {
      row: row,
      rank:
        Number.isInteger(rank) && rank > 0
          ? rank
          : index + 1,
      originalIndex: index
    };
  });

  entries.sort(function(a, b) {
    return (
      a.rank - b.rank ||
      a.originalIndex - b.originalIndex
    );
  });

  entries = entries.slice(0, MAX_ITEMS);

  console.log(
    "Trakt returned " +
    entries.length +
    " items for " +
    slug
  );

  if (entries.length !== MAX_ITEMS) {
    throw new Error(
      "Expected 20 items from " +
      slug +
      ", received " +
      entries.length
    );
  }

  return entries;
}

/*
 * EXTRACT TMDB ID
 */

function getTmdbId(row) {
  var subject = row.movie || row.show || row;
  var ids = subject.ids || row.ids || {};

  return (
    toId(ids.tmdb) ||
    toId(subject.tmdb_id) ||
    toId(subject.tmdbId)
  );
}

/*
 * SELECT HIGH-QUALITY TEXTLESS POSTER
 */

function posterScore(poster) {
  var width = Number(poster.width) || 0;
  var height = Number(poster.height) || 0;

  var votes = Number(poster.vote_count) || 0;
  var rating = Number(poster.vote_average) || 0;

  var tier = 0;

  if (width >= 2000 && height >= 3000) {
    tier = 4;
  } else if (width >= 1600 && height >= 2400) {
    tier = 3;
  } else if (width >= 1200 && height >= 1800) {
    tier = 2;
  } else if (width >= 780 && height >= 1100) {
    tier = 1;
  }

  return (
    tier * 1000000 +
    Math.min(width * height / 1000, 30000) +
    Math.min(votes, 500) * 5 +
    rating * 40
  );
}

function chooseTextlessPoster(posters) {
  if (!Array.isArray(posters)) {
    return null;
  }

  var candidates = posters.filter(function(p) {
    if (!p || !p.file_path) {
      return false;
    }

    if (p.iso_639_1 != null) {
      return false;
    }

    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;

    var ratio =
      height > 0 ? width / height : 0;

    return (
      width >= 780 &&
      height >= 1100 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });

  candidates.sort(function(a, b) {
    return posterScore(b) - posterScore(a);
  });

  return candidates.length
    ? candidates[0]
    : null;
}

/*
 * FETCH POSTER COLLECTION
 */

async function getBestPoster(mediaType, tmdbId, title) {
  var selected = null;

  try {
    var images = await Widget.tmdb.get(
      mediaType + "/" + tmdbId + "/images",
      {
        params: {
          include_image_language: "null,en"
        }
      }
    );

    var posters =
      images && Array.isArray(images.posters)
        ? images.posters
        : [];

    selected = chooseTextlessPoster(posters);

    if (selected) {
      console.log(
        "TEXTLESS:",
        title,
        selected.width + "x" + selected.height
      );

      return selected.file_path;
    }
  } catch (error) {
    console.warn(
      "TMDB images failed:",
      title,
      errorText(error)
    );
  }

  /*
   * Fallback to default TMDB poster.
   * Only request details when needed.
   */

  try {
    var details = await Widget.tmdb.get(
      mediaType + "/" + tmdbId,
      {
        params: {
          language: "en-US"
        }
      }
    );

    if (details && details.poster_path) {
      console.warn(
        "DEFAULT POSTER FALLBACK:",
        title
      );

      return details.poster_path;
    }
  } catch (error) {
    console.warn(
      "TMDB fallback failed:",
      title,
      errorText(error)
    );
  }

  console.warn("NO POSTER FOUND:", title);

  return "";
}

/*
 * BUILD REX MEDIA ITEM
 */

async function processTitle(wrapper, mediaType) {
  var row = wrapper.row;
  var rank = wrapper.rank;

  var subject =
    row.movie ||
    row.show ||
    row;

  var title =
    subject.title ||
    subject.name ||
    "Untitled";

  var tmdbId = getTmdbId(row);

  if (!tmdbId) {
    throw new Error(
      "Missing TMDB ID at rank " +
      rank +
      ": " +
      title
    );
  }

  var posterPath = await getBestPoster(
    mediaType,
    tmdbId,
    title
  );

  /*
   * Important:
   * For type "tmdb", Rex requires
   * the actual numeric TMDB ID.
   */

  return {
    id: tmdbId,
    tmdbId: tmdbId,

    type: "tmdb",
    mediaType: mediaType,

    title: title,

    rank: rank,
    position: rank,

    posterPath: posterPath
  };
}

/*
 * PROCESS EXACTLY 20 ENTRIES
 */

async function processList(entries, mediaType) {
  var results = [];

  for (
    var start = 0;
    start < entries.length;
    start += BATCH_SIZE
  ) {
    var batch = entries.slice(
      start,
      start + BATCH_SIZE
    );

    var completed = await Promise.all(
      batch.map(function(entry) {
        return processTitle(entry, mediaType);
      })
    );

    results = results.concat(completed);
  }

  results.sort(function(a, b) {
    return a.rank - b.rank;
  });

  var missingPosters = results.filter(function(item) {
    return !item.posterPath;
  });

  console.log(
    "FINAL RESULT:",
    mediaType,
    results.length + " items"
  );

  console.log(
    "Missing posters:",
    missingPosters.length
  );

  if (results.length !== MAX_ITEMS) {
    throw new Error(
      "Expected 20 processed items, received " +
      results.length
    );
  }

  return results;
}

/*
 * TOP 20 MOVIES
 */

async function loadTop20Movies(params) {
  params = params || {};

  var entries = await getTraktList(
    MOVIES_LIST,
    "movie",
    params.traktClientId
  );

  return processList(entries, "movie");
}

/*
 * TOP 20 TV SHOWS
 */

async function loadTop20Shows(params) {
  params = params || {};

  var entries = await getTraktList(
    SHOWS_LIST,
    "tv",
    params.traktClientId
  );

  return processList(entries, "tv");
}
