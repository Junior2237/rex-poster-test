
/*
 * REX — TRAKT TOP 20 / NATIVE POSTERS
 * Version 1.2.0
 *
 * Preserves the working 30-minute cache,
 * the Trakt ranking, and the native TMDB
 * image-loading method.
 *
 * Adds a targeted poster fallback for
 * The 90s Club (2022).
 *
 * Also exposes available genre metadata.
 */

var TRAKT_USER = "junior2237";
var MOVIES_LIST = "today-s-top-20-movies";
var SHOWS_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;
var BATCH_SIZE = 4;
var CACHE_SECONDS = 1800;

/*
 * Verified external promotional artwork
 * for The 90s Club (2022).
 *
 * Used ONLY when TMDB has no poster.
 */
var NINETIES_CLUB_POSTER =
  "https://images-na.ssl-images-amazon.com/images/" +
  "S/pv-target-images/" +
  "bf057acc5c7dfd6e38315a3fc26a8bf6f6e8a01ebca533f4702752c25d4d4013" +
  "._RI_TTW_.jpg";

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
    "Native TMDB posters, cached Trakt rankings, and missing-artwork fallback",
  author: "Junior",
  version: "1.2.0",
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

function isNinetiesClub(title, tmdbId, imdbId, mediaType) {
  if (mediaType !== "movie") {
    return false;
  }

  return (
    tmdbId === 950237 ||
    imdbId === "tt18225078" ||
    String(title || "").trim().toLowerCase() === "the 90s club"
  );
}

/*
 * TRAKT — PRESERVE RANKING
 */

async function fetchTraktList(slug, mediaType, clientId) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error(
      "Missing Trakt Client ID. Enter it in Rex."
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
    return a.rank - b.rank || a.index - b.index;
  });

  ranked = ranked.slice(0, MAX_ITEMS);

  if (!ranked.length) {
    throw new Error(
      "No titles returned by Trakt: " + slug
    );
  }

  return ranked;
}

/*
 * TMDB — OFFICIAL ARTWORK + GENRES
 *
 * No experimental textless selection.
 * No forced image resolution.
 * Native TMDB paths remain unchanged.
 */

async function getOfficialArtwork(
  mediaType,
  tmdbId,
  title
) {
  var poster = "";
  var backdrop = "";
  var genres = [];

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

      if (Array.isArray(details.genres)) {
        genres = details.genres
          .map(function(g) {
            return g && g.name
              ? String(g.name)
              : "";
          })
          .filter(Boolean);
      }
    }
  } catch (error) {
    console.warn(
      "TMDB details failed:",
      title,
      errorText(error)
    );
  }

  /*
   * Preserve the existing gallery fallback.
   */
  if (!poster) {
    try {
      var imageResponse = await Widget.tmdb.get(
        mediaType + "/" + tmdbId + "/images",
        {
          params: {
            include_image_language: "en,null"
          }
        }
      );

      var images = unwrap(imageResponse);

      var candidates =
        images && Array.isArray(images.posters)
          ? images.posters.filter(function(p) {
              return p && rawImagePath(p.file_path);
            })
          : [];

      candidates.sort(function(a, b) {
        var langA = a.iso_639_1 === "en" ? 1 : 0;
        var langB = b.iso_639_1 === "en" ? 1 : 0;

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
        "Poster gallery failed:",
        title,
        errorText(error)
      );
    }
  }

  return {
    poster: poster,
    backdrop: backdrop,
    genres: genres
  };
}

/*
 * IMDb -> TMDB FALLBACK
 */

async function resolveTmdbId(mediaType, imdbId) {
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
 * BUILD REX VIDEO ITEM
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

    /*
     * Keep the same poster-loading method
     * already working in v1.1.0.
     */
    if (artwork.poster) {
      result.posterPath = artwork.poster;
      result.detailPoster = artwork.poster;
      result.coverUrl = imageUrl(artwork.poster);
    }

    if (artwork.backdrop) {
      result.backdropPath = artwork.backdrop;
    }

    /*
     * Genre metadata for the future
     * Apple TV-style HTML integration.
     */
    if (artwork.genres.length) {
      result.genreTitle = artwork.genres.join(" · ");
    }
  }

  /*
   * Targeted fallback:
   * The 90s Club documentary.
   *
   * Keep its TMDB identity so movie
   * matching remains unchanged.
   *
   * Only use an external promotional
   * image when TMDB supplies no poster.
   */
  if (
    isNinetiesClub(title, tmdbId, imdbId, mediaType)
  ) {
    if (!result.posterPath) {
      result.coverUrl = NINETIES_CLUB_POSTER;
      result.detailPoster = NINETIES_CLUB_POSTER;

      console.log(
        "External poster fallback:",
        title
      );
    }

    if (!result.genreTitle) {
      result.genreTitle = "Documentary";
    }
  }

  return result;
}

/*
 * BUILD COMPLETE LIST BEFORE RETURN
 *
 * Four concurrent metadata requests.
 * Cache duration: 30 minutes.
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
    return !!(
      item.posterPath ||
      item.coverUrl
    );
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
 * MODULE ENTRY POINTS
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
