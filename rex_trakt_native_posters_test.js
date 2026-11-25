
/*
 * TODAY'S TOP 20 — FAST REX SOURCE
 * Version 2.1.0
 *
 * FIX:
 * - Retrieve missing title logos directly from TMDB
 * - Accept English, neutral and fallback-language logos
 * - Supply full image URLs for the HTML renderer
 *
 * PRESERVED:
 * - Original Trakt Top 20 lists
 * - 30-minute Rex module cache
 * - Four concurrent metadata jobs
 * - Textless poster preference
 * - Genre metadata
 * - Native poster fields
 * - The 90s Club artwork fallback
 * - Existing module IDs
 */

var TRAKT_USER = "junior2237";
var MOVIES_LIST = "today-s-top-20-movies";
var TV_LIST = "today-s-top-20-tv-shows";

var MAX_ITEMS = 20;
var BATCH_SIZE = 4;
var CACHE_SECONDS = 1800;

var TMDB_IMAGE_BASE =
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
    "Cached Trakt Top 20 with textless posters and TMDB title logos",
  author: "Junior",
  version: "2.1.0",
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
    }
  ]
};

function unwrap(response) {
  var data = response;

  for (var i = 0; i < 3; i++) {
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      data.data !== undefined
    ) {
      data = data.data;
    } else {
      break;
    }
  }

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  return data;
}

function positiveId(value) {
  var n = Number(value);

  return Number.isSafeInteger(n) && n > 0
    ? n
    : null;
}

function tmdbPath(value) {
  return (
    typeof value === "string" &&
    /^\/[^/]/.test(value)
  ) ? value : "";
}

function tmdbUrl(path) {
  return path
    ? TMDB_IMAGE_BASE + path
    : "";
}

function errorText(error) {
  return error && error.message
    ? error.message
    : String(error);
}

/*
 * TRAKT — EXISTING LISTS
 */

async function fetchTraktList(
  slug,
  mediaType,
  clientId
) {
  var key = String(clientId || "").trim();

  if (!key) {
    throw new Error(
      "Missing Trakt Client ID."
    );
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
      limit: 100
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
    throw new Error(
      "Invalid Trakt response: " + slug
    );
  }

  var keyName =
    mediaType === "movie"
      ? "movie"
      : "show";

  var ranked = data
    .filter(function(row) {
      return row && (
        row[keyName] ||
        row.type === keyName
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

  return ranked.slice(0, MAX_ITEMS);
}

/*
 * POSTER SELECTION
 */

function chooseCleanPoster(posters) {
  if (!Array.isArray(posters)) {
    return "";
  }

  var candidates = posters.filter(function(p) {
    var width = Number(p && p.width) || 0;
    var height = Number(p && p.height) || 0;
    var ratio = height ? width / height : 0;

    return (
      p &&
      p.iso_639_1 == null &&
      tmdbPath(p.file_path) &&
      width >= 600 &&
      height >= 900 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });

  candidates.sort(function(a, b) {
    var voteA = Number(a.vote_average) || 0;
    var voteB = Number(b.vote_average) || 0;

    if (voteA !== voteB) {
      return voteB - voteA;
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

function chooseStandardPoster(posters) {
  if (!Array.isArray(posters)) {
    return "";
  }

  var candidates = posters.filter(function(p) {
    return p && tmdbPath(p.file_path);
  });

  candidates.sort(function(a, b) {
    var enA = a.iso_639_1 === "en" ? 1 : 0;
    var enB = b.iso_639_1 === "en" ? 1 : 0;

    if (enB !== enA) {
      return enB - enA;
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

/*
 * FIXED TITLE LOGO SELECTION
 *
 * Priorities:
 * 1. English raster logo
 * 2. English SVG logo
 * 3. Neutral raster logo
 * 4. Neutral SVG logo
 * 5. Other available logo
 */

function chooseTitleLogo(logos) {
  if (!Array.isArray(logos)) {
    return "";
  }

  var candidates = logos.filter(function(logo) {
    return logo && tmdbPath(logo.file_path);
  });

  function score(logo) {
    var lang = logo.iso_639_1;

    var languageScore =
      lang === "en" ? 3 :
      lang == null ? 2 :
      1;

    var path = String(logo.file_path || "");

    var formatScore =
      /\.(png|webp|jpg|jpeg)$/i.test(path)
        ? 2
        : 1;

    return languageScore * 10 + formatScore;
  }

  candidates.sort(function(a, b) {
    var scoreDiff = score(b) - score(a);

    if (scoreDiff !== 0) {
      return scoreDiff;
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

/*
 * TMDB IMAGE GALLERY
 */

async function fetchImageGallery(
  mediaType,
  tmdbId,
  includeLanguages
) {
  var params = {};

  if (includeLanguages) {
    params.include_image_language =
      includeLanguages;
  }

  var response = await Widget.tmdb.get(
    mediaType + "/" + tmdbId + "/images",
    { params: params }
  );

  var data = unwrap(response);

  return data && typeof data === "object"
    ? data
    : null;
}

/*
 * TMDB DETAILS + ARTWORK
 */

async function getArtwork(
  mediaType,
  tmdbId,
  title
) {
  var result = {
    standardPoster: "",
    cleanPoster: "",
    logo: "",
    backdrop: "",
    genres: [],
    network: "",
    networkLogo: ""
  };

  var details = null;
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

    details = unwrap(response);

    if (details) {
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
          .map(function(g) {
            return g && g.name
              ? String(g.name)
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
      "TMDB details:",
      title,
      errorText(error)
    );
  }

  if (images) {
    result.cleanPoster = chooseCleanPoster(
      images.posters
    );

    result.logo = chooseTitleLogo(
      images.logos
    );

    if (!result.standardPoster) {
      result.standardPoster =
        chooseStandardPoster(images.posters);
    }
  }

  /*
   * IMPORTANT FIX:
   * Retry via the dedicated TMDB images
   * endpoint when logos are missing.
   */

  if (!result.logo || !result.cleanPoster) {
    try {
      var gallery = await fetchImageGallery(
        mediaType,
        tmdbId,
        "en,null"
      );

      if (gallery) {
        if (!result.logo) {
          result.logo = chooseTitleLogo(
            gallery.logos
          );
        }

        if (!result.cleanPoster) {
          result.cleanPoster =
            chooseCleanPoster(gallery.posters);
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
        "TMDB gallery:",
        title,
        errorText(error)
      );
    }
  }

  /*
   * Last logo fallback: allow TMDB to return
   * any language rather than no logo.
   */

  if (!result.logo) {
    try {
      var allImages = await fetchImageGallery(
        mediaType,
        tmdbId,
        null
      );

      if (allImages) {
        result.logo = chooseTitleLogo(
          allImages.logos
        );
      }
    } catch (error) {
      console.warn(
        "TMDB logo fallback:",
        title,
        errorText(error)
      );
    }
  }

  return result;
}

/*
 * IMDb -> TMDB FALLBACK
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
    console.warn(
      "IMDb lookup:",
      imdbId,
      errorText(error)
    );

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

/*
 * BUILD VIDEO ITEM
 */

async function buildItem(
  entry,
  mediaType
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
    console.warn(
      "No usable IDs:",
      title
    );

    return null;
  }

  var item = {
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
    item.tmdbId = tmdbId;

    var artwork = await getArtwork(
      mediaType,
      tmdbId,
      title
    );

    var poster =
      artwork.cleanPoster ||
      artwork.standardPoster;

    if (poster) {
      item.posterPath = poster;
      item.detailPoster = poster;
      item.coverUrl = tmdbUrl(poster);
    }

    if (artwork.cleanPoster) {
      item.cleanPosterPath =
        artwork.cleanPoster;
    }

    if (artwork.backdrop) {
      item.backdropPath =
        artwork.backdrop;
    }

    /*
     * TITLE LOGO FIX
     *
     * Give the HTML widget a complete URL.
     * Keep raw and alternative paths too.
     */

    if (artwork.logo) {
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

  if (
    isNinetiesClub(
      title,
      tmdbId,
      imdbId,
      mediaType
    )
  ) {
    if (!item.posterPath) {
      item.coverUrl =
        NINETIES_CLUB_POSTER;

      item.detailPoster =
        NINETIES_CLUB_POSTER;
    }

    if (!item.genreTitle) {
      item.genreTitle = "Documentary";
    }
  }

  return item;
}

/*
 * FAST LOADING — UNCHANGED
 */

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

  var posterCount = results.filter(function(item) {
    return !!(
      item.posterPath ||
      item.coverUrl
    );
  }).length;

  var cleanCount = results.filter(function(item) {
    return !!item.cleanPosterPath;
  }).length;

  var logoCount = results.filter(function(item) {
    return !!item.titleLogoPath;
  }).length;

  console.log(
    "TOP 20 COMPLETE:",
    mediaType,
    "titles:", results.length,
    "posters:", posterCount,
    "textless:", cleanCount,
    "logos:", logoCount
  );

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
    TV_LIST,
    params
  );
}
