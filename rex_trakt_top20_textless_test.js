
/*
 * REX — Trakt Top 20 Textless Test
 * Version 1.5.0
 * Textless first; reliable artwork fallback if none is available.
 * Production widgets are not changed.
 */

var TRAKT_USER = "junior2237";
var TRAKT_MOVIES = "today-s-top-20-movies";
var TRAKT_SHOWS = "today-s-top-20-tv-shows";
var MAX_TITLES = 20;
var TMDB_BATCH_SIZE = 4;

var traktKeyParameter = {
  name: "traktClientId",
  title: "Trakt Client ID (required)",
  type: "input",
  description: "Trakt API Client ID, not your Client Secret.",
  value: ""
};

var WidgetMetadata = {
  id: "junior.trakt.top20.textless.test",
  title: "Trakt Top 20 — Textless Test",
  description: "Ranked movies and shows; textless posters with safe TMDB fallback",
  author: "Junior",
  version: "1.5.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      id: "top20-movies-textless",
      title: "TEST — Top 20 Movies (Textless)",
      functionName: "loadTop20Movies",
      cacheDuration: 0,
      params: [traktKeyParameter]
    },
    {
      id: "top20-shows-textless",
      title: "TEST — Top 20 TV Shows (Textless)",
      functionName: "loadTop20Shows",
      cacheDuration: 0,
      params: [traktKeyParameter]
    }
  ]
};

function unwrapResponse(response) {
  var value = response;
  if (value && typeof value === "object" && value.data !== undefined) {
    value = value.data;
  }
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (_) {
      throw new Error("API returned non-JSON data");
    }
  }
  return value;
}

function failureMessage(error) {
  return error && error.message ? error.message : String(error);
}

function positiveId(value) {
  var number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function titleFrom(entry) {
  var subject = entry.movie || entry.show || entry;
  return String(subject.title || subject.name || "Untitled");
}

function identifiersFrom(entry) {
  var subject = entry.movie || entry.show || entry;
  var ids = subject.ids || entry.ids || {};
  var imdb = ids.imdb || subject.imdb_id || subject.imdbId || "";
  return {
    tmdb: positiveId(ids.tmdb || subject.tmdb_id || subject.tmdbId),
    imdb: typeof imdb === "string" && /^tt\d+$/.test(imdb) ? imdb : null
  };
}

function rankFrom(entry, index) {
  var rank = Number(entry.rank);
  return Number.isInteger(rank) && rank > 0 ? rank : index + 1;
}

async function fetchTraktList(slug, mediaType, clientId) {
  var key = String(clientId || "").trim();
  if (!key) {
    throw new Error("Trakt Client ID is missing. Enter it in this Rex module's settings.");
  }

  var url = "https://api.trakt.tv/users/" + encodeURIComponent(TRAKT_USER) +
    "/lists/" + encodeURIComponent(slug) + "/items";
  var response;
  try {
    response = await Widget.http.get(url, {
      headers: {
        "Accept": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": key
      },
      params: { page: 1, limit: 100 }
    });
  } catch (error) {
    throw new Error("Trakt list request failed for " + slug + ": " + failureMessage(error));
  }

  var data = unwrapResponse(response);
  if (data && !Array.isArray(data) && Array.isArray(data.items)) data = data.items;
  if (!Array.isArray(data)) throw new Error("Unexpected Trakt response for " + slug);

  var expected = mediaType === "movie" ? "movie" : "show";
  var ranked = data.filter(function(entry) {
    return entry && (entry[expected] || entry.type === expected);
  }).map(function(entry, index) {
    return { entry: entry, rank: rankFrom(entry, index), originalIndex: index };
  });

  ranked.sort(function(a, b) {
    return a.rank - b.rank || a.originalIndex - b.originalIndex;
  });
  ranked = ranked.slice(0, MAX_TITLES);
  console.log("Trakt", slug, "returned", ranked.length, "titles");
  if (!ranked.length) throw new Error("No " + mediaType + " titles returned by Trakt list " + slug);
  return ranked;
}

function tmdbImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return "https://image.tmdb.org/t/p/original" +
    (path.charAt(0) === "/" ? path : "/" + path);
}

function validImagePath(value) {
  return typeof value === "string" && value.length > 1 &&
    (value.charAt(0) === "/" || /^https?:\/\//i.test(value));
}

function selectImage(posters, textlessOnly) {
  if (!Array.isArray(posters)) return null;

  var candidates = posters.filter(function(p) {
    if (!p || !validImagePath(p.file_path)) return false;
    if (textlessOnly && p.iso_639_1 != null) return false;
    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;
    var ratio = height ? width / height : 0;
    return width >= 500 && height >= 700 && ratio >= 0.60 && ratio <= 0.75;
  });

  candidates.sort(function(a, b) {
    var areaA = (Number(a.width) || 0) * (Number(a.height) || 0);
    var areaB = (Number(b.width) || 0) * (Number(b.height) || 0);
    if (areaB !== areaA) return areaB - areaA;
    return (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0);
  });
  return candidates[0] || null;
}

async function resolveTmdbId(mediaType, ids, title) {
  if (ids.tmdb) return ids.tmdb;
  if (!ids.imdb) return null;
  try {
    var response = await Widget.tmdb.get("find/" + ids.imdb, {
      params: { external_source: "imdb_id" }
    });
    var lookup = unwrapResponse(response);
    var items = mediaType === "movie" ? lookup.movie_results : lookup.tv_results;
    if (Array.isArray(items) && items.length) {
      var tmdbId = positiveId(items[0].id);
      if (tmdbId) {
        console.log("TMDB ID resolved from IMDb:", title, tmdbId);
        return tmdbId;
      }
    }
  } catch (error) {
    console.warn("IMDb-to-TMDB lookup failed:", title, failureMessage(error));
  }
  return null;
}

async function findPoster(mediaType, tmdbId, title) {
  if (!tmdbId) return "";

  // First: prefer a large language-neutral poster, without titles/logos.
  // Second: accept any sufficiently high-resolution poster.
  var images;
  try {
    var response = await Widget.tmdb.get(mediaType + "/" + tmdbId + "/images", {
      params: { include_image_language: "null,en" }
    });
    images = unwrapResponse(response);
    var posters = images && images.posters;
    var textless = selectImage(posters, true);
    if (textless) {
      console.log("TEXTLESS poster:", title, textless.width, textless.height);
      return textless.file_path;
    }

    // No textless image for this show: do not return an empty poster.
    var conventional = selectImage(posters, false);
    if (conventional) {
      console.log("STANDARD poster fallback:", title);
      return conventional.file_path;
    }
  } catch (error) {
    console.warn("TMDB poster gallery failed:", title, failureMessage(error));
  }

  // Third: TMDB's official default poster_path.
  // This also covers missing/undersized or failed /images responses.
  try {
    var detailResponse = await Widget.tmdb.get(mediaType + "/" + tmdbId, {
      params: { language: "en-US" }
    });
    var details = unwrapResponse(detailResponse);
    if (details && validImagePath(details.poster_path)) {
      console.log("DETAIL poster fallback:", title);
      return details.poster_path;
    }

    // Last resort: even a landscape image is better than a blank card.
    if (details && validImagePath(details.backdrop_path)) {
      console.warn("BACKDROP fallback (cropped):", title);
      return details.backdrop_path;
    }
  } catch (error) {
    console.warn("TMDB details fallback failed:", title, failureMessage(error));
  }

  console.warn("No TMDB artwork available for:", title, tmdbId);
  return "";
}

async function buildItem(item, mediaType) {
  var entry = item.entry;
  var title = titleFrom(entry);
  var ids = identifiersFrom(entry);

  // Keep original Trakt ID information when available.
  var resolvedTmdbId = await resolveTmdbId(mediaType, ids, title);
  if (!resolvedTmdbId && !ids.imdb) {
    console.warn("No usable identifier for", title, "rank", item.rank);
    return null;
  }

  var result = {
    id: resolvedTmdbId ? mediaType + "." + resolvedTmdbId : ids.imdb,
    type: resolvedTmdbId ? "tmdb" : "imdb",
    mediaType: mediaType,
    title: title,
    rank: item.rank,
    position: item.rank
  };
  if (resolvedTmdbId) {
    result.tmdbId = resolvedTmdbId;
    var posterPath = await findPoster(mediaType, resolvedTmdbId, title);
    if (posterPath) {
      // ForwardWidgets requires a RAW TMDB path for TMDB posterPath.
      result.posterPath = posterPath;
      result.detailPoster = posterPath;
      // coverUrl accepts the complete URL as a display fallback.
      result.coverUrl = tmdbImageUrl(posterPath);
    }
  }
  return result;
}

async function runList(mediaType, slug, params) {
  var options = params || {};
  var ranked = await fetchTraktList(slug, mediaType, options.traktClientId);
  var all = [];

  for (var start = 0; start < ranked.length; start += TMDB_BATCH_SIZE) {
    var batch = ranked.slice(start, start + TMDB_BATCH_SIZE);
    var results = await Promise.all(batch.map(async function(item) {
      try {
        return await buildItem(item, mediaType);
      } catch (error) {
        console.warn("Item failed at rank", item.rank, failureMessage(error));
        return null;
      }
    }));
    all = all.concat(results.filter(Boolean));
  }

  console.log("REX FINAL RESULT:", mediaType, all.length, "of", ranked.length);
  if (!all.length) throw new Error("No usable titles in Trakt list " + slug);
  return all;
}

async function loadTop20Movies(params) {
  return runList("movie", TRAKT_MOVIES, params);
}

async function loadTop20Shows(params) {
  return runList("tv", TRAKT_SHOWS, params);
}
