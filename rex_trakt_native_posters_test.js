
/*
 * REX — TRAKT TOP 20 / NATIVE POSTERS
 * Version 1.1.0
 *
 * Uses official TMDB poster paths.
 * Rex handles image delivery and rendering.
 *
 * Preserves Trakt order.
 * Caches the completed list for 30 minutes.
 * Does not modify production widgets.
 */

var TRAKT_USER = "junior2237";
var MOVIES_LIST = "today-s-top-20-movies";
var SHOWS_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;
var BATCH_SIZE = 4;
var CACHE_SECONDS = 1800;

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
    "Official TMDB posters with cached Trakt Top 20 rankings",
  author: "Junior",
  version: "1.1.0",
  requiredVersion: "0.0.1",

  modules: [
    {
      id: "native-top20-movies-with-posters",
      title: "TEST — Movies (Rex Posters)",
      functionName: "loadNativeMovies",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "native-top20-shows-with-posters",
      title: "TEST — TV Shows (Rex Posters)",
      functionName: "loadNativeShows",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    }
  ]
};

/*
 * RESPONSE HELPERS
 */

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

  return data;
}

function positiveId(value) {
  var id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function errorText(error) {
  return error && error.message
    ? error.message
    : String(error);
}

function rawImagePath(value) {
  return (
    typeof value === "string" &&
    /^\/[^/]/.test(value)
  ) ? value : "";
}

function imageUrl(path) {
  return path
    ? "https://image.tmdb.org/t/p/original" + path
    : "";
}

/*
 * TRAKT — COMPLETE RANKED LIST
 */

async function fetchTraktList(
  slug,
  mediaType,
  clientId
) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error(
      "Missing Trakt Client ID. Enter it in the module settings."
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

  if (
    data &&
    !Array.isArray(data) &&
    Array.isArray(data.items)
  ) {
    data = data.items;
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Unexpected Trakt response: " + slug
    );
  }

  var expected =
    mediaType === "movie" ? "movie" : "show";

  var ranked = data
    .filter(function(row) {
      return row && (
        row[expected] ||
        row.type === expected
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

  ranked = ranked.slice(0, MAX_ITEMS);

  if (!ranked.length) {
    throw new Error(
      "No titles returned by Trakt: " + slug
    );
  }

  console.log(
    "TRAKT LIST:",
    slug,
    ranked.length,
    "titles"
  );

  return ranked;
}

/*
 * TMDB — OFFICIAL POSTER METADATA
 *
 * Request the standard TMDB poster_path.
 * No textless image selection.
 * No forced w185 / w500 image size.
 */

async function getOfficialArtwork(
  mediaType,
  tmdbId,
  title
) {
  var poster = "";
  var backdrop = "";

  try {
    var response = await Widget.tmdb.get(
      mediaType + "/" + tmdbId,
      {
        params: {
          language: "en-US"
        }
      }
    );

    var details = unwrap(response);

    if (details) {
      poster = rawImagePath(
        details.poster_path ||
        details.posterPath
      );

      backdrop = rawImagePath(
        details.backdrop_path ||
        details.backdropPath
      );
    }
  } catch (error) {
    console.warn(
      "TMDB details failed:",
      title,
      errorText(error)
    );
  }

  /*
   * Fallback only when TMDB details
   * did not return a usable poster.
   */

  if (!poster) {
    try {
      var response = await Widget.tmdb.get(
        mediaType + "/" + tmdbId + "/images",
        {
          params: {
            include_image_language: "en,null"
          }
        }
      );

      var images = unwrap(response);

      var candidates =
        images && Array.isArray(images.posters)
          ? images.posters.filter(function(p) {
              return p &&
                rawImagePath(p.file_path);
            })
          : [];

      candidates.sort(function(a, b) {
        var langA =
          a.iso_639_1 === "en" ? 1 : 0;
        var langB =
          b.iso_639_1 === "en" ? 1 : 0;

        if (langA !== langB) {
          return langB - langA;
        }

        var areaA =
          (Number(a.width) || 0) *
          (Number(a.height) || 0);

        var areaB =
          (Number(b.width) || 0) *
          (Number(b.height) || 0);

        return areaB - areaA;
      });

      if (candidates.length) {
        poster = candidates[0].file_path;
      }
    } catch (error) {
      console.warn(
        "TMDB poster fallback failed:",
        title,
        errorText(error)
      );
    }
  }

  if (!poster) {
    console.warn(
      "No official poster found:",
      title,
      tmdbId
    );
  }

  return {
    poster: poster,
    backdrop: backdrop
  };
}

/*
 * RESOLVE IMDb-ONLY TITLES
 */

async function resolveTmdbId(
  mediaType,
  imdbId
) {
  if (!/^tt\d+$/.test(imdbId || "")) {
    return null;
  }

  try {
    var response = await Widget.tmdb.get(
      "find/" + imdbId,
      {
        params: {
          external_source: "imdb_id"
        }
      }
    );

    var data = unwrap(response);

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
      "IMDb lookup failed:",
      imdbId,
      errorText(error)
    );
  }

  return null;
}

/*
 * BUILD ONE COMPLETE REX ITEM
 */

async function buildItem(entry, mediaType) {
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

  var imdbId = String(
    ids.imdb ||
    subject.imdb_id ||
    subject.imdbId ||
    ""
  );

  if (!tmdbId) {
    tmdbId = await resolveTmdbId(
      mediaType,
      imdbId
    );
  }

  if (!tmdbId && !/^tt\d+$/.test(imdbId)) {
    console.warn(
      "No usable media ID:",
      entry.rank,
      title
    );

    return null;
  }

  var result = {
    id: tmdbId
      ? mediaType + "." + tmdbId
      : imdbId,

    type: tmdbId ? "tmdb" : "imdb",

    mediaType: mediaType,

    title: title,

    rank: entry.rank,
    position: entry.rank
  };

  if (tmdbId) {
    result.tmdbId = tmdbId;

    var artwork = await getOfficialArtwork(
      mediaType,
      tmdbId,
      title
    );

    if (artwork.poster) {
      /*
       * Raw poster path:
       * Rex handles image loading and size.
       */
      result.posterPath = artwork.poster;
      result.detailPoster = artwork.poster;

      /*
       * Generic fallback for other slots.
       * Does not override posterPath priority.
       */
      result.coverUrl = imageUrl(
        artwork.poster
      );
    }

    if (artwork.backdrop) {
      result.backdropPath = artwork.backdrop;
    }
  }

  return result;
}

/*
 * LOAD ALL ITEMS BEFORE RETURNING
 *
 * Four concurrent metadata requests per batch.
 */

async function loadNativeList(
  mediaType,
  slug,
  params
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
      batch.map(async function(entry) {
        try {
          return await buildItem(
            entry,
            mediaType
          );
        } catch (error) {
          console.warn(
            "Item failed:",
            entry.rank,
            errorText(error)
          );

          return null;
        }
      })
    );

    results = results.concat(
      completed.filter(Boolean)
    );
  }

  results.sort(function(a, b) {
    return a.rank - b.rank;
  });

  var withPosters = results.filter(function(item) {
    return !!item.posterPath;
  }).length;

  console.log(
    "REX COMPLETE:",
    mediaType,
    "titles:",
    results.length,
    "posters:",
    withPosters
  );

  if (!results.length) {
    throw new Error(
      "No usable titles returned."
    );
  }

  return results;
}

/*
 * REX MODULE ENTRY POINTS
 */

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
