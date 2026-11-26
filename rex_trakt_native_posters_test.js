
/*
 * TODAY'S TOP 20 — REX
 * Version 3.3.6 — Daily Top 20 rating-source fallback and diagnostics
 *
 * Carries title logos through the documented backdropPaths array.
 * Preserves the real primary backdrop and original title.
 *
 * Retains the existing:
 * - Two Trakt lists and original title eligibility
 * - 30-minute module cache
 * - Four-item concurrent metadata batches
 * - Textless-poster preference
 * - TMDB logo retrieval
 * - Genres and network metadata
 * - Poster fallbacks
 *
 * Daily Top 20 only: 85% IMDb / 15% community quality when available.
 * Source popularity determines membership and breaks exact score ties.
 * Optional Cinemeta IMDb fallback and per-title diagnostic logging.
 * All five other chart modules retain their existing ranking.
 */

var TRAKT_USER = "junior2237";
var MOVIES_LIST = "today-s-top-20-movies";
var TV_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;
var CHART_TARGET = 30;
var CHART_PAGE_SIZE = 40;
var CHART_MAX_PAGES = 2;
var BATCH_SIZE = 4;
var CACHE_SECONDS = 1800;

var TMDB_BASE =
  "https://image.tmdb.org/t/p/original";

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
  title: "Today's Top 20 — Fast Posters + Title Logos",
  description:
    "Fast Top 20 with native posters and compatible title logos",
  author: "Junior",
  version: "3.3.6",
  requiredVersion: "0.0.1",

  modules: [
    {
      id: "native-top20-movies-with-posters",
      title: "Today's Top 20 Movies — Fast",
      functionName: "loadNativeMovies",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "native-top20-shows-with-posters",
      title: "Today's Top 20 TV Shows — Fast",
      functionName: "loadNativeShows",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "combined-trending-with-posters",
      title: "Trending Movies & TV Shows — Apple Style",
      functionName: "loadCombinedTrending",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "trending-movies-with-posters",
      title: "Trending Movies — Apple Style",
      functionName: "loadTrendingMovies",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "trending-shows-with-posters",
      title: "Trending TV Shows — Apple Style",
      functionName: "loadTrendingShows",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "popular-movies-with-posters",
      title: "Popular Movies — Apple Style",
      functionName: "loadPopularMovies",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    },
    {
      id: "popular-shows-with-posters",
      title: "Popular TV Shows — Apple Style",
      functionName: "loadPopularShows",
      cacheDuration: CACHE_SECONDS,
      params: [TRAKT_PARAM]
    }
  ]
};

function unwrap(response) {
  var value = response;

  for (var i = 0; i < 3; i++) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.data !== undefined
    ) {
      value = value.data;
    } else {
      break;
    }
  }

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  return value;
}

function positiveId(value) {
  var number = Number(value);

  return (
    Number.isSafeInteger(number) &&
    number > 0
  ) ? number : null;
}

function tmdbPath(value) {
  return (
    typeof value === "string" &&
    /^\/[^/]/.test(value)
  ) ? value : "";
}

function tmdbUrl(path) {
  return path ? TMDB_BASE + path : "";
}

function errorText(error) {
  return error && error.message
    ? error.message
    : String(error);
}

async function fetchTraktList(
  slug,
  mediaType,
  clientId
) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error("Missing Trakt Client ID.");
  }

  var url =
    "https://api.trakt.tv/users/" +
    encodeURIComponent(TRAKT_USER) +
    "/lists/" +
    encodeURIComponent(slug) +
    "/items";

  var response = await Widget.http.get(url, {
    headers: {
      Accept: "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": key
    },
    params: {
      page: 1,
      limit: 100,
      extended: "full"
    }
  });

  var data = unwrap(response);

  if (
    data &&
    !Array.isArray(data) &&
    Array.isArray(data.items)
  ) {
    data = data.items;
  }

  if (!Array.isArray(data)) {
    throw new Error("Invalid Trakt response.");
  }

  var subjectKey =
    mediaType === "movie" ? "movie" : "show";

  return data
    .filter(function(row) {
      return row && (
        row[subjectKey] ||
        row.type === subjectKey
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
    })
    .sort(function(a, b) {
      return a.rank - b.rank || a.index - b.index;
    })
    .slice(0, MAX_ITEMS);
}

function chooseCleanPoster(posters) {
  if (!Array.isArray(posters)) return "";

  // Daily Top 20: prefer the same premium artwork as the editorial charts,
  // but retain the original fallback tiers so ranking membership is unchanged.
  var premium = choosePremiumCleanPoster(posters);
  if (premium) return premium;

  function quality(p) {
    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;
    var ratio = height ? width / height : 0;
    if (width >= 600 && height >= 900 &&
        ratio >= 0.60 && ratio <= 0.75) return 3;
    if (ratio >= 0.60 && ratio <= 0.75) return 2;
    if (width > 0 && height > width) return 1;
    return 0;
  }

  // Every language-neutral portrait outranks a standard poster.
  // Keep high-resolution, native poster proportions as the first choice.
  var candidates = posters.filter(function(p) {
    return p && p.iso_639_1 === null &&
      tmdbPath(p.file_path) && quality(p) > 0;
  });

  candidates.sort(function(a, b) {
    return quality(b) - quality(a) ||
      (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0) ||
      ((Number(b.width) || 0) * (Number(b.height) || 0)) -
      ((Number(a.width) || 0) * (Number(a.height) || 0));
  });

  return candidates.length ? candidates[0].file_path : "";
}

// Editorial charts: native portrait artwork only, with a resolution floor.
// Also used as the first-choice selector by the Daily Top 20.
function choosePremiumCleanPoster(posters) {
  if (!Array.isArray(posters)) return "";

  function tier(p) {
    if (!p || p.iso_639_1 !== null || !tmdbPath(p.file_path)) return 0;
    var w = Number(p.width) || 0;
    var h = Number(p.height) || 0;
    var ratio = h ? w / h : 0;
    if (ratio < 0.63 || ratio > 0.71) return 0;
    if (w >= 2000 && h >= 3000) return 4;
    if (w >= 1600 && h >= 2400) return 3;
    if (w >= 1200 && h >= 1800) return 2;
    if (w >= 1000 && h >= 1500) return 1;
    return 0;
  }

  var candidates = posters.filter(function(p) {
    return tier(p) > 0;
  });

  candidates.sort(function(a, b) {
    return tier(b) - tier(a) ||
      ((Number(b.width) || 0) * (Number(b.height) || 0)) -
      ((Number(a.width) || 0) * (Number(a.height) || 0)) ||
      (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0) ||
      (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0);
  });

  return candidates.length ? candidates[0].file_path : "";
}

function chooseCleanBackdrop(backdrops) {
  if (!Array.isArray(backdrops)) return "";
  var candidates = backdrops.filter(function(p) {
    return p && p.iso_639_1 === null && tmdbPath(p.file_path) &&
      Number(p.width) > 0 && Number(p.height) > 0;
  });
  candidates.sort(function(a,b) {
    return (Number(b.height)||0) - (Number(a.height)||0) ||
      (Number(b.vote_average)||0) - (Number(a.vote_average)||0) ||
      (Number(b.width)||0) - (Number(a.width)||0);
  });
  return candidates.length ? candidates[0].file_path : "";
}

function chooseStandardPoster(posters) {
  if (!Array.isArray(posters)) {
    return "";
  }

  var candidates = posters.filter(function(p) {
    return p && tmdbPath(p.file_path);
  });

  candidates.sort(function(a, b) {
    var aEn = a.iso_639_1 === "en" ? 1 : 0;
    var bEn = b.iso_639_1 === "en" ? 1 : 0;

    if (aEn !== bEn) {
      return bEn - aEn;
    }

    var areaA =
      (Number(a.width) || 0) *
      (Number(a.height) || 0);

    var areaB =
      (Number(b.width) || 0) *
      (Number(b.height) || 0);

    return areaB - areaA;
  });

  return candidates.length
    ? candidates[0].file_path
    : "";
}

function chooseLogo(logos) {
  if (!Array.isArray(logos)) {
    return "";
  }

  var candidates = logos.filter(function(logo) {
    return (
      logo &&
      tmdbPath(logo.file_path) &&
      /\.png$/i.test(logo.file_path)
    );
  });

  function score(logo) {
    var languageScore =
      logo.iso_639_1 === "en" ? 3 :
      logo.iso_639_1 == null ? 2 : 1;

    var raster =
      /\.(png|webp|jpg|jpeg)$/i.test(
        String(logo.file_path || "")
      ) ? 1 : 0;

    return languageScore * 10 + raster;
  }

  candidates.sort(function(a, b) {
    var difference = score(b) - score(a);

    if (difference) {
      return difference;
    }

    var areaA =
      (Number(a.width) || 0) *
      (Number(a.height) || 0);

    var areaB =
      (Number(b.width) || 0) *
      (Number(b.height) || 0);

    return areaB - areaA;
  });

  return candidates.length
    ? candidates[0].file_path
    : "";
}

async function fetchGallery(
  mediaType,
  tmdbId,
  languageFilter
) {
  var params = {};

  if (languageFilter) {
    params.include_image_language =
      languageFilter;
  }

  var response = await Widget.tmdb.get(
    mediaType + "/" + tmdbId + "/images",
    { params: params }
  );

  return unwrap(response);
}

async function getArtwork(
  mediaType,
  tmdbId,
  title,
  premiumPortrait
) {
  var selectCleanPoster = premiumPortrait ? choosePremiumCleanPoster : chooseCleanPoster;
  var result = {
    standardPoster: "",
    cleanPoster: "",
    cleanBackdrop: "",
    logo: "",
    backdrop: "",
    genres: [],
    network: "",
    networkLogo: "",
    rating: null,
    votes: null
  };

  var images = null;

  try {
    var response = await Widget.tmdb.get(
      mediaType + "/" + tmdbId,
      {
        params: {
          language: "en-US",
          append_to_response: "images",
          include_image_language: "en,null"
        }
      }
    );

    var details = unwrap(response);

    if (details) {
      result.rating = details.vote_average;
      result.votes = details.vote_count;
      result.standardPoster = tmdbPath(
        details.poster_path ||
        details.posterPath
      );

      result.backdrop = tmdbPath(
        details.backdrop_path ||
        details.backdropPath
      );

      if (Array.isArray(details.genres)) {
        result.genres = details.genres
          .map(function(genre) {
            return genre && genre.name
              ? String(genre.name)
              : "";
          })
          .filter(Boolean);
      }

      if (
        mediaType === "tv" &&
        Array.isArray(details.networks) &&
        details.networks.length
      ) {
        var network = details.networks[0];

        result.network = String(
          network.name || ""
        );

        result.networkLogo = tmdbPath(
          network.logo_path
        );
      }

      images = details.images || null;
    }
  } catch (error) {
    console.warn(
      "TMDB details failed:",
      title,
      errorText(error)
    );
  }

  if (images) {
    result.cleanPoster =
      selectCleanPoster(images.posters);
    result.cleanBackdrop = chooseCleanBackdrop(images.backdrops);

    result.logo =
      chooseLogo(images.logos);

    if (!result.standardPoster) {
      result.standardPoster =
        chooseStandardPoster(images.posters);
    }
  }

  if (!result.logo || !result.cleanPoster) {
    try {
      var gallery = await fetchGallery(
        mediaType,
        tmdbId,
        "en,null"
      );

      if (gallery) {
        if (!result.cleanBackdrop) result.cleanBackdrop = chooseCleanBackdrop(gallery.backdrops);
        if (!result.logo) {
          result.logo = chooseLogo(
            gallery.logos
          );
        }

        if (!result.cleanPoster) {
          result.cleanPoster =
            selectCleanPoster(gallery.posters);
        }

        if (!result.standardPoster) {
          result.standardPoster =
            chooseStandardPoster(
              gallery.posters
            );
        }
      }
    } catch (error) {
      console.warn(
        "TMDB gallery failed:",
        title,
        errorText(error)
      );
    }
  }

  if (!result.logo || !result.cleanPoster) {
    try {
      var allImages = await fetchGallery(
        mediaType,
        tmdbId,
        null
      );

      if (allImages) {
        if (!result.cleanBackdrop) result.cleanBackdrop = chooseCleanBackdrop(allImages.backdrops);
        if (!result.logo) {
          result.logo = chooseLogo(allImages.logos);
        }
        if (!result.cleanPoster) {
          result.cleanPoster = selectCleanPoster(allImages.posters);
        }
        if (!result.standardPoster) {
          result.standardPoster = chooseStandardPoster(allImages.posters);
        }
      }
    } catch (error) {
      console.warn(
        "TMDB logo fallback failed:",
        title,
        errorText(error)
      );
    }
  }

  return result;
}

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

    var data = unwrap(response) || {};

    var matches =
      mediaType === "movie"
        ? data.movie_results
        : data.tv_results;

    return (
      Array.isArray(matches) &&
      matches.length
    ) ? positiveId(matches[0].id) : null;
  } catch (error) {
    return null;
  }
}

function isNinetiesClub(
  title,
  tmdbId,
  imdbId,
  mediaType
) {
  return (
    mediaType === "movie" &&
    (
      tmdbId === 950237 ||
      imdbId === "tt18225078" ||
      String(title || "")
        .trim()
        .toLowerCase() === "the 90s club"
    )
  );
}

async function buildItem(
  entry,
  mediaType,
  premiumPortrait,
  dailyRanking
) {
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
    return null;
  }

  var item = {
    // Rex requires the numeric TMDB ID, with mediaType supplied separately.
    id: tmdbId ? tmdbId : imdbId,

    type: tmdbId ? "tmdb" : "imdb",
    mediaType: mediaType,
    title: title,
    rank: entry.rank,
    position: entry.rank
  };

  if (dailyRanking) {
    item._dailyQuality = dailyQualityScore(subject, null);
    item._dailyImdbId = imdbId;
  }

  if (tmdbId) {
    item.tmdbId = tmdbId;

    var artwork = await getArtwork(
      mediaType,
      tmdbId,
      title,
      premiumPortrait
    );

    if (dailyRanking) item._dailyQuality = dailyQualityScore(subject, artwork);

    // Do not stretch or crop inferior artwork in the oversized Trending row.
    if (premiumPortrait && !artwork.cleanPoster) return null;
    var poster = premiumPortrait
      ? artwork.cleanPoster
      : artwork.cleanPoster || artwork.cleanBackdrop || artwork.standardPoster;

    if (poster) {
      item.posterPath = poster;
      item.detailPoster = poster;
      item.coverUrl = tmdbUrl(poster);
    }

    if (artwork.cleanPoster || artwork.cleanBackdrop) {
      item.cleanPosterPath = artwork.cleanPoster || artwork.cleanBackdrop;
    }

    if (artwork.backdrop) {
      item.backdropPath =
        artwork.backdrop;
      item.backdropPaths = [artwork.backdrop];
    }

    if (artwork.logo) {
      // Keep the genuine backdrop first; the logo is always last.
      item.backdropPaths = (item.backdropPaths || []).concat([artwork.logo]);

      var logoUrl = tmdbUrl(artwork.logo);

      item.titleLogoPath = logoUrl;
      item.titleLogoUrl = logoUrl;
      item.logoUrl = logoUrl;
      item.logoPath = artwork.logo;
      item.titleLogoRawPath =
        artwork.logo;
    }

    if (artwork.genres.length) {
      item.genreTitle =
        artwork.genres.join(" · ");
    }

    if (artwork.network) {
      item.originalNetwork =
        artwork.network;
    }

    if (artwork.networkLogo) {
      item.networkLogoPath =
        artwork.networkLogo;
    }
  }

  if (premiumPortrait && !tmdbId) return null;

  if (
    isNinetiesClub(
      title,
      tmdbId,
      imdbId,
      mediaType
    )
  ) {
    if (!item.posterPath) {
      item.coverUrl = NINETIES_CLUB_POSTER;
      item.detailPoster =
        NINETIES_CLUB_POSTER;
    }

    if (!item.genreTitle) {
      item.genreTitle = "Documentary";
    }
  }

  return item;
}

function dailyAdjustedRating(rating, votes) {
  var r = Number(rating), v = Number(votes);
  if (!Number.isFinite(r) || r <= 0 || r > 10 ||
      !Number.isFinite(v) || v <= 0) return null;
  return (v * r + 100 * 6.5) / (v + 100);
}

function dailyQualityScore(subject, artwork) {
  var trakt = dailyAdjustedRating(subject && subject.rating, subject && subject.votes);
  var tmdb = dailyAdjustedRating(artwork && artwork.rating, artwork && artwork.votes);
  var scores = [trakt, tmdb].filter(function(value) { return value !== null; });
  return scores.length ? scores.reduce(function(a,b) { return a+b; }, 0) / scores.length : null;
}

async function fetchDailyImdbRatings(items) {
  var ids = [], mediaById = Object.create(null), ratings = Object.create(null);
  items.forEach(function(item) {
    var id = item._dailyImdbId;
    if (!/^tt\d+$/.test(id || "") || mediaById[id]) return;
    ids.push(id);
    mediaById[id] = item.mediaType === "movie" ? "movie" : "series";
  });
  var groups = [];
  for (var i = 0; i < ids.length; i += 5) groups.push(ids.slice(i, i + 5));
  await Promise.all(groups.map(async function(group) {
    try {
      var query = group.map(function(id) { return "titleIds=" + encodeURIComponent(id); }).join("&");
      var data = unwrap(await Widget.http.get(
        "https://api.imdbapi.dev/titles:batchGet?" + query,
        { headers: { Accept: "application/json" } }
      ));
      var rows = Array.isArray(data) ? data : data && data.titles;
      if (!Array.isArray(rows)) return;
      rows.forEach(function(row) {
        if (!row || group.indexOf(row.id) < 0 || !row.rating) return;
        var score = dailyAdjustedRating(row.rating.aggregateRating, row.rating.voteCount);
        if (score !== null) ratings[row.id] = { score: score, source: "IMDbAPI" };
      });
    } catch (error) {
      console.warn("IMDb batch unavailable:", errorText(error));
    }
  }));
  var missing = ids.filter(function(id) { return !ratings[id]; });
  // Cinemeta provides IMDb's weighted rating, but does not guarantee vote counts.
  for (var start = 0; start < missing.length; start += BATCH_SIZE) {
    await Promise.all(missing.slice(start, start + BATCH_SIZE).map(async function(id) {
      try {
        var data = unwrap(await Widget.http.get(
          "https://cinemeta-live.strem.io/meta/" + mediaById[id] + "/" + id + ".json",
          { headers: { Accept: "application/json" } }
        ));
        var meta = data && data.meta;
        if (!meta || (meta.imdb_id !== id && meta.id !== id)) return;
        var score = Number(meta.imdbRating);
        if (Number.isFinite(score) && score > 0 && score <= 10) {
          ratings[id] = { score: score, source: "Cinemeta IMDb" };
        }
      } catch (error) {
        console.warn("Cinemeta IMDb unavailable:", id, errorText(error));
      }
    }));
  }
  return ratings;
}

function rankDailyItems(items, imdbRatings) {
  imdbRatings = imdbRatings || {};
  var count = 0;
  var scored = items.map(function(item) {
    var community = item._dailyQuality;
    var record = imdbRatings[item._dailyImdbId];
    var imdb = record && record.score;
    var hasCommunity = Number.isFinite(community);
    var hasImdb = Number.isFinite(imdb);
    if (hasImdb) count++;
    var quality = hasImdb && hasCommunity ? 0.85 * imdb + 0.15 * community :
      hasImdb ? imdb : hasCommunity ? community : 6.5;
    return { item: item, score: quality, imdb: hasImdb ? imdb : null,
      community: hasCommunity ? community : null,
      source: hasImdb ? record.source : "TMDB/Trakt fallback",
      originalRank: item.rank };
  });
  scored.sort(function(a,b) { return b.score - a.score || a.originalRank - b.originalRank; });
  var canLog = typeof console !== "undefined" && typeof console.log === "function";
  if (canLog) console.log("Daily Top 20 IMDb coverage: " + count + "/" + items.length);
  return scored.map(function(row, index) {
    var item = row.item;
    item.rank = index + 1;
    item.position = index + 1;
    if (canLog) console.log("Daily rank " + item.rank + " | " + item.title +
      " | source=" + row.source + " | IMDb=" +
      (row.imdb === null ? "N/A" : row.imdb.toFixed(3)) +
      " | community=" + (row.community === null ? "N/A" : row.community.toFixed(3)) +
      " | score=" + row.score.toFixed(3) + " | original rank=" + row.originalRank);
    delete item._dailyQuality;
    delete item._dailyImdbId;
    return item;
  });
}

async function loadNativeList(
  mediaType,
  slug,
  params
) {
  var entries = await fetchTraktList(
    slug,
    mediaType,
    (params || {}).traktClientId
  );

  if (!entries.length) {
    throw new Error(
      "Trakt returned no titles: " + slug
    );
  }

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
      batch.map(async function(entry) {
        try {
          return await buildItem(
            entry,
            mediaType,
            false,
            true
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

  var imdbRatings = await fetchDailyImdbRatings(results);
  return rankDailyItems(results, imdbRatings);
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
    TV_LIST,
    params
  );
}

/*
 * Independent Trakt charts. Unlike the personal daily lists,
 * these are not limited to 20 titles. Preserve API ordering.
 */
async function fetchTraktChart(mediaType, chart, params, page) {
  var key = String((params || {}).traktClientId || "").trim();
  if (!key) throw new Error("Missing Trakt Client ID.");
  var plural = mediaType === "movie" ? "movies" : "shows";
  var response = await Widget.http.get(
    "https://api.trakt.tv/" + plural + "/" + chart,
    {
      headers: {
        Accept: "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": key
      },
      params: { page: page, limit: CHART_PAGE_SIZE }
    }
  );
  var data = unwrap(response);
  if (data && !Array.isArray(data)) data = data.items || data.results;
  if (!Array.isArray(data)) throw new Error("Invalid Trakt chart response.");
  return data;
}

async function loadArtworkChart(mediaType, chart, params) {
  var results = [];
  var seen = Object.create(null);
  var sourceRank = 0;
  var subjectKey = mediaType === "movie" ? "movie" : "show";
  for (var page = 1; page <= CHART_MAX_PAGES && results.length < CHART_TARGET; page++) {
    var rows = await fetchTraktChart(mediaType, chart, params, page);
    if (!rows.length) break;
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      sourceRank++;
      var row = rows[i];
      if (!row || typeof row !== "object") continue;
      var subject = row[subjectKey] || row;
      var ids = subject.ids || row.ids || {};
      var identity = positiveId(ids.tmdb || subject.tmdb_id || subject.tmdbId) ||
        String(ids.imdb || subject.imdb_id || subject.imdbId || "") ||
        ("trakt:" + String(ids.trakt || subject.trakt_id || ""));
      if (!identity || identity === "trakt:") continue;
      if (seen[identity]) continue;
      seen[identity] = true;
      entries.push({ row: row, rank: sourceRank, index: sourceRank - 1 });
    }
    if (!entries.length) break;
    for (var start = 0; start < entries.length && results.length < CHART_TARGET; start += BATCH_SIZE) {
      var completed = await Promise.all(
        entries.slice(start, start + BATCH_SIZE).map(async function(entry) {
          try {
            var item = await buildItem(entry, mediaType, true);
            // Require a confirmed PNG title logo and usable artwork on these editorial rows.
            if (!item || !item.titleLogoRawPath ||
                !/\.png$/i.test(item.titleLogoRawPath) ||
                !(item.posterPath || item.coverUrl)) return null;
            return item;
          } catch (error) {
            console.warn("Chart item failed:", entry.rank, errorText(error));
            return null;
          }
        })
      );
      results = results.concat(completed.filter(Boolean));
    }
  }
  return results.slice(0, CHART_TARGET);
}

async function loadTrendingMovies(params) {
  return loadArtworkChart("movie", "trending", params);
}
async function loadTrendingShows(params) {
  return loadArtworkChart("tv", "trending", params);
}
async function loadPopularMovies(params) {
  return loadArtworkChart("movie", "popular", params);
}
async function loadPopularShows(params) {
  return loadArtworkChart("tv", "popular", params);
}

/*
 * Native mixed-media TMDB trending chart. Keeps the original chart order
 * for accepted titles and prevents TV shows from dominating the rail.
 * Unlike active Trakt watcher counts, upcoming titles can qualify.
 */
async function loadCombinedTrending(params) {
  var results = [];
  var seen = Object.create(null);
  var tvCount = 0;
  var tvCap = Math.floor(CHART_TARGET / 2);
  var sourceRank = 0;
  var maxPages = 5;

  for (var page = 1; page <= maxPages && results.length < CHART_TARGET; page++) {
    var response = await Widget.tmdb.get("trending/all/day", {
      params: { language: "en-US", page: page }
    });
    var data = unwrap(response);
    var rows = Array.isArray(data) ? data : data && data.results;
    if (!Array.isArray(rows)) throw new Error("Invalid TMDB trending response.");
    if (!rows.length) break;

    var candidates = [];
    for (var i = 0; i < rows.length; i++) {
      sourceRank++;
      var row = rows[i];
      if (!row || (row.media_type !== "movie" && row.media_type !== "tv")) continue;
      var id = positiveId(row.id);
      if (!id) continue;
      var key = row.media_type + ":" + id;
      if (seen[key]) continue;
      seen[key] = true;
      candidates.push({
        mediaType: row.media_type,
        rank: sourceRank,
        row: {
          title: row.title || row.name || "Untitled",
          ids: { tmdb: id }
        }
      });
    }

    for (var start = 0; start < candidates.length && results.length < CHART_TARGET;) {
      var batch = [];
      var reservedTV = 0;
      while (start < candidates.length && batch.length < BATCH_SIZE) {
        var candidate = candidates[start];
        if (candidate.mediaType === "tv" && tvCount >= tvCap) {
          start++;
          continue;
        }
        // Do not discard a TV candidate until preceding TV lookups finish.
        if (candidate.mediaType === "tv" && tvCount + reservedTV >= tvCap) break;
        start++;
        batch.push(candidate);
        if (candidate.mediaType === "tv") reservedTV++;
      }
      if (!batch.length) continue;
      var completed = await Promise.all(batch.map(async function(candidate) {
        try {
          var item = await buildItem({
            row: candidate.row,
            rank: candidate.rank,
            index: candidate.rank - 1
          }, candidate.mediaType, true);
          if (!item || !item.titleLogoRawPath ||
              !/\.png$/i.test(item.titleLogoRawPath) ||
              !(item.posterPath || item.coverUrl)) return null;
          return { item: item, mediaType: candidate.mediaType };
        } catch (error) {
          console.warn("TMDB trending item failed:", candidate.rank, errorText(error));
          return null;
        }
      }));
      completed.forEach(function(entry) {
        if (!entry || results.length >= CHART_TARGET) return;
        if (entry.mediaType === "tv") {
          if (tvCount >= tvCap) return;
          tvCount++;
        }
        results.push(entry.item);
      });
    }
    if (data && Number(data.total_pages) > 0 && page >= Number(data.total_pages)) break;
  }

  if (!results.length) throw new Error("No eligible TMDB trending titles.");
  return results;
}
