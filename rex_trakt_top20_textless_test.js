
/*
 * REX — TRAKT TOP 20 TEXTLESS POSTERS
 * Version 1.0.0 — Separate test module
 *
 * Uses the user's existing Trakt lists:
 *
 * 1. today-s-top-20-movies
 * 2. today-s-top-20-tv-shows
 *
 * Selects high-resolution, language-neutral
 * TMDB posters and keeps Trakt ranking.
 *
 * Does not modify or reorder Trakt lists.
 * Does not modify existing Rex widgets.
 */

var WidgetMetadata = {
  id: "junior.trakt.top20.textless.test",
  title: "Trakt Top 20 — Textless Test",
  description:
    "Test HD textless TMDB posters with the existing Trakt Top 20 lists",
  author: "Custom Rex Home",
  version: "1.0.0",
  requiredVersion: "0.0.1",

  globalParams: [
    {
      name: "traktClientId",
      title: "Trakt Client ID",
      type: "input",
      description:
        "Enter your Trakt API Client ID to read your public lists.",
      value: ""
    }
  ],

  modules: [
    {
      id: "top20-movies-textless",
      title: "TEST — Top 20 Movies (Textless)",
      functionName: "loadTop20Movies",
      cacheDuration: 3600,
      params: []
    },
    {
      id: "top20-shows-textless",
      title: "TEST — Top 20 TV Shows (Textless)",
      functionName: "loadTop20Shows",
      cacheDuration: 3600,
      params: []
    }
  ]
};

/* LIST CONFIGURATION */

var TRAKT_USER = "junior2237";

var MOVIE_LIST = "today-s-top-20-movies";
var TV_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;
var CONCURRENCY = 4;
var LANGUAGE = "en-US";

/* RESPONSE HANDLING */

function unwrap(response) {
  if (
    response &&
    response.data !== undefined &&
    response.data !== null
  ) {
    return response.data;
  }

  return response;
}

function numericId(value) {
  var number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : null;
}

/* FETCH AN EXISTING TRAKT LIST */

async function getTraktList(slug, type, clientId) {
  if (!clientId || !String(clientId).trim()) {
    throw new Error(
      "Trakt Client ID is required. " +
      "Enter it in the Rex module configuration."
    );
  }

  var url =
    "https://api.trakt.tv/users/" +
    TRAKT_USER +
    "/lists/" +
    slug +
    "/items/" +
    (type === "movie" ? "movies" : "shows") +
    "/rank/asc";

  var response = await Widget.http.get(url, {
    params: {
      page: 1,
      limit: 20
    },
    headers: {
      "Accept": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": String(clientId).trim()
    }
  });

  if (response && response.ok === false) {
    throw new Error(
      "Trakt request failed: HTTP " +
      String(response.status || "unknown")
    );
  }

  var data = unwrap(response);

  if (!Array.isArray(data)) {
    if (data && Array.isArray(data.items)) {
      data = data.items;
    } else {
      throw new Error(
        "Trakt did not return a list of items."
      );
    }
  }

  /*
   * Preserve the stored Trakt ranking.
   * Use explicit rank when available.
   */

  var entries = data.map(function(row, index) {
    return {
      entry: row,
      rank:
        Number.isInteger(Number(row.rank)) &&
        Number(row.rank) > 0
          ? Number(row.rank)
          : index + 1,
      originalIndex: index
    };
  });

  entries.sort(function(a, b) {
    return a.rank - b.rank ||
      a.originalIndex - b.originalIndex;
  });

  return entries.slice(0, MAX_ITEMS);
}

/* TMDB DETAILS */

async function getDetails(type, tmdbId) {
  return unwrap(
    await Widget.tmdb.get(
      type + "/" + tmdbId,
      {
        params: {
          language: LANGUAGE
        }
      }
    )
  );
}

/* TMDB ALTERNATE POSTERS */

async function getPosterCollection(type, tmdbId) {
  var result = unwrap(
    await Widget.tmdb.get(
      type + "/" + tmdbId + "/images",
      {
        params: {
          include_image_language: "null,en"
        }
      }
    )
  );

  return result && Array.isArray(result.posters)
    ? result.posters
    : [];
}

/* POSTER QUALITY TIERS */

function qualityTier(poster) {
  var w = Number(poster.width) || 0;
  var h = Number(poster.height) || 0;

  if (w >= 2000 && h >= 3000) return 4;
  if (w >= 1600 && h >= 2400) return 3;
  if (w >= 1200 && h >= 1800) return 2;
  if (w >= 1000 && h >= 1500) return 1;

  return 0;
}

function scorePoster(poster) {
  var tier = qualityTier(poster);

  var w = Number(poster.width) || 0;
  var h = Number(poster.height) || 0;

  var votes = Number(poster.vote_count) || 0;
  var rating = Number(poster.vote_average) || 0;

  return (
    tier * 100000 +
    Math.min((w * h) / 1000, 20000) +
    Math.min(votes, 100) * 5 +
    Math.min(rating, 10) * 40
  );
}

/*
 * SELECT HIGH-RES TEXTLESS CANDIDATE
 *
 * Language-neutral artwork is preferred.
 * It is not guaranteed to contain no text.
 *
 * Reject:
 * - Images with assigned language
 * - Non-portrait images
 * - Extremely small images
 *
 * Return a TMDB image path, not a full URL.
 */

function choosePoster(posters, defaultPath) {
  var candidates = posters.filter(function(p) {
    if (!p || !p.file_path) return false;

    if (p.iso_639_1 != null) return false;

    var w = Number(p.width) || 0;
    var h = Number(p.height) || 0;

    var ratio = Number(p.aspect_ratio) ||
      (h > 0 ? w / h : 0);

    return (
      w >= 780 &&
      h >= 1100 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });

  candidates.sort(function(a, b) {
    return scorePoster(b) - scorePoster(a);
  });

  if (candidates.length) {
    return {
      path: candidates[0].file_path,
      qualityTier: qualityTier(candidates[0])
    };
  }

  /*
   * Fallback:
   * Some titles don't have a suitable
   * language-neutral alternative.
   */

  return {
    path: defaultPath || "",
    qualityTier: 0
  };
}

/* BUILD REX MEDIA ITEM */

function makeItem(
  type,
  tmdbId,
  details,
  original,
  rank,
  posterPath
) {
  var title =
    details.title ||
    details.name ||
    original.title ||
    "Untitled";

  var genres = Array.isArray(details.genres)
    ? details.genres.map(function(g) {
        return {
          id: String(g.id),
          title: String(g.name || "")
        };
      })
    : [];

  var networks =
    Array.isArray(details.networks)
      ? details.networks
      : [];

  var firstNetwork =
    networks.length ? networks[0] : null;

  var date =
    details.release_date ||
    details.first_air_date ||
    "";

  var item = {
    id: type + "." + tmdbId,
    tmdbId: tmdbId,

    type: "tmdb",
    mediaType: type,

    title: title,

    rank: rank,
    position: rank,

    posterPath: posterPath,

    backdropPath:
      details.backdrop_path || "",

    releaseDate: date,

    description:
      details.overview || "",

    rating:
      Number(details.vote_average) || 0,

    genreItems: genres,

    genreTitle: genres
      .map(function(g) {
        return g.title;
      })
      .filter(Boolean)
      .join(" · ")
  };

  if (firstNetwork) {
    item.originalNetwork = {
      name: firstNetwork.name || "",
      logoPath: firstNetwork.logo_path || ""
    };

    item.networkLogoPath =
      firstNetwork.logo_path || "";
  }

  return item;
}

/* PROCESS ONE TRAKT TITLE */

async function processTitle(wrapper, type) {
  var entry = wrapper.entry;
  var rank = wrapper.rank;

  var subject =
    entry.movie ||
    entry.show ||
    entry;

  if (!subject) return null;

  var ids = subject.ids || entry.ids || {};

  var tmdbId =
    numericId(ids.tmdb) ||
    numericId(subject.tmdb_id);

  /*
   * Don't guess an ID based on title text.
   * That could silently substitute
   * the wrong movie or TV show.
   */

  if (!tmdbId) {
    console.warn(
      "Missing TMDB ID at Trakt rank " + rank
    );
    return null;
  }

  var details;

  try {
    details = await getDetails(type, tmdbId);
  } catch (error) {
    console.warn(
      "TMDB details failed at rank " + rank
    );
    return null;
  }

  if (!details || !details.id) return null;

  var defaultPoster =
    details.poster_path || "";

  var selectedPoster = defaultPoster;

  try {
    var posters = await getPosterCollection(
      type,
      tmdbId
    );

    var choice = choosePoster(
      posters,
      defaultPoster
    );

    selectedPoster =
      choice.path || defaultPoster;

  } catch (error) {
    /*
     * Don't remove the title if
     * alternate images are unavailable.
     */
    selectedPoster = defaultPoster;
  }

  return makeItem(
    type,
    tmdbId,
    details,
    subject,
    rank,
    selectedPoster
  );
}

/* PROCESS IN SMALL BATCHES */

async function processList(entries, type) {
  var result = [];

  for (
    var start = 0;
    start < entries.length;
    start += CONCURRENCY
  ) {
    var batch = entries.slice(
      start,
      start + CONCURRENCY
    );

    var completed = await Promise.all(
      batch.map(function(entry) {
        return processTitle(entry, type)
          .catch(function() {
            return null;
          });
      })
    );

    for (var i = 0; i < completed.length; i++) {
      if (completed[i]) {
        result.push(completed[i]);
      }
    }
  }

  /*
   * Preserve original rank values,
   * even if an unmatched title was omitted.
   */

  result.sort(function(a, b) {
    return a.rank - b.rank;
  });

  return result;
}

/* TEST MODULE — TOP 20 MOVIES */

async function loadTop20Movies(params) {
  params = params || {};

  var entries = await getTraktList(
    MOVIE_LIST,
    "movie",
    params.traktClientId
  );

  return await processList(
    entries,
    "movie"
  );
}

/* TEST MODULE — TOP 20 TV SHOWS */

async function loadTop20Shows(params) {
  params = params || {};

  var entries = await getTraktList(
    TV_LIST,
    "tv",
    params.traktClientId
  );

  return await processList(
    entries,
    "tv"
  );
}
