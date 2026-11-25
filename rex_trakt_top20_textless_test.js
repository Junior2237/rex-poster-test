
/*
 * REX — Trakt Top 20 Textless Test
 * Version 1.4.0
 * Only edits this test module; production widgets are unaffected.
 */

var TRAKT_USER = "junior2237";
var TRAKT_MOVIES = "today-s-top-20-movies";
var TRAKT_SHOWS = "today-s-top-20-tv-shows";
var MAX_TITLES = 20;
var IMAGE_BATCH_SIZE = 4;

var traktKeyParameter = {
  name: "traktClientId",
  title: "Trakt Client ID (required)",
  type: "input",
  description: "Paste the Trakt API Client ID, not the Client Secret.",
  value: ""
};

var WidgetMetadata = {
  id: "junior.trakt.top20.textless.test",
  title: "Trakt Top 20 — Textless Test",
  description: "Ranked Trakt Top 20 movies and TV shows with textless TMDB posters",
  author: "Junior",
  version: "1.4.0",
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
    } catch (error) {
      throw new Error("Server returned non-JSON data: " + value.slice(0, 100));
    }
  }
  return value;
}

function failureMessage(error) {
  return error && error.message ? error.message : String(error);
}

function positiveId(value) {
  var n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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
  var n = Number(entry.rank);
  return Number.isInteger(n) && n > 0 ? n : index + 1;
}

async function fetchTraktList(slug, mediaType, clientId) {
  var key = String(clientId || "").trim();
  if (!key) {
    throw new Error(
      "Trakt Client ID is missing. Open this specific Rex list's parameters and enter the Trakt API Client ID."
    );
  }

  var url = "https://api.trakt.tv/users/" +
    encodeURIComponent(TRAKT_USER) + "/lists/" +
    encodeURIComponent(slug) + "/items";

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
    console.error("Trakt request error for", slug, failureMessage(error));
    throw new Error("Trakt request failed: " + failureMessage(error));
  }

  var data = unwrapResponse(response);
  if (data && !Array.isArray(data) && Array.isArray(data.items)) {
    data = data.items;
  }
  if (!Array.isArray(data)) {
    throw new Error("Trakt returned an unexpected response for " + slug);
  }

  var expected = mediaType === "movie" ? "movie" : "show";
  var ranked = data.filter(function(item) {
    return item && (item[expected] || item.type === expected);
  }).map(function(item, index) {
    return { entry: item, rank: rankFrom(item, index), originalIndex: index };
  });

  ranked.sort(function(a, b) {
    return a.rank - b.rank || a.originalIndex - b.originalIndex;
  });
  ranked = ranked.slice(0, MAX_TITLES);
  console.log("Trakt", slug, "returned", ranked.length, "titles");

  if (!ranked.length) {
    throw new Error("Trakt returned zero " + mediaType + " titles for list " + slug);
  }
  if (ranked.length < MAX_TITLES) {
    console.warn("Trakt list contains fewer than 20 titles:", ranked.length);
  }
  return ranked;
}

function selectPoster(posters) {
  if (!Array.isArray(posters)) return null;
  var valid = posters.filter(function(p) {
    if (!p || !p.file_path || p.iso_639_1 != null) return false;
    var w = Number(p.width) || 0;
    var h = Number(p.height) || 0;
    var ratio = h ? w / h : 0;
    return w >= 500 && h >= 700 && ratio >= 0.60 && ratio <= 0.75;
  });
  valid.sort(function(a, b) {
    var aSize = (Number(a.width) || 0) * (Number(a.height) || 0);
    var bSize = (Number(b.width) || 0) * (Number(b.height) || 0);
    if (bSize !== aSize) return bSize - aSize;
    return (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0);
  });
  return valid[0] || null;
}

function imageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return "https://image.tmdb.org/t/p/original" +
    (path.charAt(0) === "/" ? path : "/" + path);
}

async function textlessPoster(mediaType, tmdbId, title) {
  if (!tmdbId) return "";
  try {
    var response = await Widget.tmdb.get(
      mediaType + "/" + tmdbId + "/images",
      { params: { include_image_language: "null,en" } }
    );
    var images = unwrapResponse(response);
    var poster = selectPoster(images && images.posters);
    if (poster) {
      console.log("Textless poster selected:", title, poster.width, poster.height);
      return imageUrl(poster.file_path);
    }
    console.warn("No textless poster available:", title);
  } catch (error) {
    console.warn("TMDB images failed for", title, failureMessage(error));
  }
  return "";
}

async function buildItem(item, mediaType) {
  var entry = item.entry;
  var ids = identifiersFrom(entry);
  var title = titleFrom(entry);

  if (!ids.tmdb && !ids.imdb) {
    console.warn("Missing TMDB/IMDb ID at rank", item.rank, title);
    return null;
  }

  var result = {
    id: ids.tmdb ? mediaType + "." + ids.tmdb : ids.imdb,
    type: ids.tmdb ? "tmdb" : "imdb",
    mediaType: mediaType,
    title: title,
    rank: item.rank,
    position: item.rank
  };

  if (ids.tmdb) {
    result.tmdbId = ids.tmdb;
    var poster = await textlessPoster(mediaType, ids.tmdb, title);
    if (poster) {
      result.posterPath = poster;
      result.coverUrl = poster;
      result.detailPoster = poster;
    }
  }
  return result;
}

async function runList(mediaType, slug, params) {
  var cfg = params || {};
  var ranked = await fetchTraktList(slug, mediaType, cfg.traktClientId);
  var all = [];

  for (var start = 0; start < ranked.length; start += IMAGE_BATCH_SIZE) {
    var batch = ranked.slice(start, start + IMAGE_BATCH_SIZE);
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

  console.log("REX FINAL RESULT:", mediaType, all.length, "titles");
  if (!all.length) {
    throw new Error("No valid video IDs found in Trakt list " + slug);
  }
  return all;
}

async function loadTop20Movies(params) {
  return runList("movie", TRAKT_MOVIES, params);
}

async function loadTop20Shows(params) {
  return runList("tv", TRAKT_SHOWS, params);
}
