
/* Temporary movie rating audit, isolated from production v3.3.7. */

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
  id: "junior.trakt.movie.rating.diagnostic",
  title: "Movie Rating Audit — Temporary",
  description: "Displays actual ranking inputs for the movie Top 20. Does not change the production module.",
  author: "Junior",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  modules: [{
    id: "movie-rating-audit",
    title: "Movie Rating Audit",
    functionName: "loadNativeMovies",
    cacheDuration: 0,
    params: [TRAKT_PARAM]
  }]
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
    item._auditTraktRating = subject.rating;
    item._auditTraktVotes = subject.votes;
  }

  if (tmdbId) {
    item.tmdbId = tmdbId;

    var artwork = await getArtwork(
      mediaType,
      tmdbId,
      title,
      premiumPortrait
    );

    if (dailyRanking) {
      item._dailyQuality = dailyQualityScore(subject, artwork);
      item._auditTmdbRating = artwork.rating;
      item._auditTmdbVotes = artwork.votes;
    }

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
        if (score !== null) ratings[row.id] = { score: score, rawRating: Number(row.rating.aggregateRating), votes: Number(row.rating.voteCount), source: "IMDbAPI" };
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
          ratings[id] = { score: score, rawRating: score, votes: null, source: "Cinemeta IMDb" };
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

function dailyMovieImdbScore(record) {
  if (!record) return null;
  var rating = Number(record.rawRating);
  if (!Number.isFinite(rating) || rating <= 0 || rating > 10) return null;
  var votes = Number(record.votes);
  // IMDb has already weighted its published score. Only shrink very small
  // samples when an actual vote count is known, and avoid inventing counts.
  if (Number.isFinite(votes) && votes > 0 && votes < 100) {
    return (rating * votes + 20 * 6.5) / (votes + 20);
  }
  return rating;
}

async function completeDailyMovieRatings(items, ratings) {
  var missing = [];
  items.forEach(function(item) {
    var id = item._dailyImdbId;
    if (/^tt\d+$/.test(id || "") && !ratings[id] && missing.indexOf(id) < 0) missing.push(id);
  });
  for (var i = 0; i < missing.length; i += BATCH_SIZE) {
    await Promise.all(missing.slice(i, i+BATCH_SIZE).map(async function(id) {
      try {
        var data = unwrap(await Widget.http.get(
          "https://api.imdbapi.dev/titles/" + encodeURIComponent(id),
          { headers: { Accept: "application/json" } }
        ));
        var row = data && (data.title || data);
        if (!row || row.id !== id || !row.rating) return;
        var raw = Number(row.rating.aggregateRating);
        var votes = Number(row.rating.voteCount);
        var score = dailyAdjustedRating(raw, votes);
        if (!Number.isFinite(raw) || raw <= 0 || raw > 10) return;
        ratings[id] = { score: score === null ? raw : score, rawRating: raw,
          votes: Number.isFinite(votes) && votes > 0 ? votes : null, source: "IMDbAPI single title" };
      } catch (error) {
        console.warn("Movie IMDb lookup unavailable:", id, errorText(error));
      }
    }));
  }
  return ratings;
}

function rankDailyMovies(items, imdbRatings) {
  var scored = items.map(function(item) {
    var record = imdbRatings[item._dailyImdbId];
    var imdb = dailyMovieImdbScore(record);
    var community = item._dailyQuality;
    var hasImdb = Number.isFinite(imdb);
    var hasCommunity = Number.isFinite(community);
    // A missing IMDb result is not a high-quality signal. Conservative
    // community fallback avoids rewarding unavailable IMDb information.
    var score = hasImdb && hasCommunity ? 0.9 * imdb + 0.1 * community :
      hasImdb ? imdb : hasCommunity ? community - 0.25 : 6.25;
    return { item: item, score: score, imdb: imdb, community: community,
      source: hasImdb ? record.source : "TMDB/Trakt fallback",
      originalRank: item.rank };
  });
  scored.sort(function(a,b) {
    return b.score - a.score || a.originalRank - b.originalRank;
  });
  var canLog = typeof console !== "undefined" && typeof console.log === "function";
  if (canLog) console.log("Daily movie IMDb coverage: " + scored.filter(function(x) {
    return x.imdb !== null;
  }).length + "/" + scored.length);
  return scored.map(function(row, index) {
    var item = row.item;
    item.rank = index + 1;
    item.position = index + 1;
    if (canLog) console.log("Movie rank " + item.rank + " | " + item.title +
      " | source=" + row.source + " | IMDb=" +
      (row.imdb === null ? "N/A" : row.imdb.toFixed(3)) +
      " | score=" + row.score.toFixed(3) + " | original rank=" + row.originalRank);
    var record = imdbRatings[item._dailyImdbId];
    function show(v) {
      return v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "N/A" : String(v);
    }
    var audit = [
      "AUDIT v1.0 | Rank " + item.rank + " | Source #" + row.originalRank,
      "Title: " + item.title,
      "IMDb ID: " + (item._dailyImdbId || "N/A"),
      "TMDB ID: " + (item.tmdbId || "N/A"),
      "Provider: " + row.source,
      "IMDb raw: " + show(record && record.rawRating),
      "IMDb votes: " + show(record && record.votes),
      "IMDb used: " + (row.imdb === null ? "N/A" : row.imdb.toFixed(3)),
      "TMDB: " + show(item._auditTmdbRating) + " (" + show(item._auditTmdbVotes) + " votes)",
      "Trakt: " + show(item._auditTraktRating) + " (" + show(item._auditTraktVotes) + " votes)",
      "Community adjusted: " + (Number.isFinite(row.community) ? row.community.toFixed(3) : "N/A"),
      "Final score: " + row.score.toFixed(3)
    ].join("\n");
    item.description = audit;
    item.genreTitle = "AUDIT " + row.score.toFixed(3) + " | IMDb " + show(record && record.rawRating) + " | " + row.source;
    item.title = item.title + " | AUDIT " + row.score.toFixed(3);
    delete item._dailyQuality;
    delete item._dailyImdbId;
    delete item._auditTraktRating;
    delete item._auditTraktVotes;
    delete item._auditTmdbRating;
    delete item._auditTmdbVotes;
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
  if (mediaType === "movie") {
    imdbRatings = await completeDailyMovieRatings(results, imdbRatings);
    return rankDailyMovies(results, imdbRatings);
  }
  return rankDailyItems(results, imdbRatings);
}

async function loadNativeMovies(params) {
  return loadNativeList(
    "movie",
    MOVIES_LIST,
    params
  );
}

