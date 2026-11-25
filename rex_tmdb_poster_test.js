
/*
 * REX — TMDB POSTER QUALITY TEST v2.0
 *
 * JavaScript DATA MODULE — not HTML.
 *
 * TEST 1: Original working standard poster
 * TEST 2: Original working textless poster
 * TEST 3: Highest-resolution textless candidate, TMDB path
 * TEST 4: Same image, explicit ORIGINAL-resolution URL
 *
 * No modifications to existing Top 20 lists.
 */

var WidgetMetadata = {
  id: "junior.tmdb.poster.quality.test",
  title: "TMDB Poster Quality Test",
  description:
    "Compare standard, textless and original-resolution posters",
  author: "Custom Rex Home",
  version: "2.0.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      id: "matrix-standard-poster",
      title: "TEST 1 — Standard Poster",
      functionName: "loadStandardPoster",
      cacheDuration: 21600,
      params: []
    },
    {
      id: "matrix-textless-poster",
      title: "TEST 2 — Textless Poster",
      functionName: "loadTextlessPoster",
      cacheDuration: 21600,
      params: []
    },
    {
      id: "matrix-hq-tmdb-path-v2",
      title: "TEST 3 — HQ Textless (Rex Path)",
      functionName: "loadHighResPath",
      cacheDuration: 3600,
      params: []
    },
    {
      id: "matrix-hq-original-url-v2",
      title: "TEST 4 — HQ Textless (Original URL)",
      functionName: "loadHighResOriginalUrl",
      cacheDuration: 3600,
      params: []
    }
  ]
};

var MOVIE_ID = 603;
var LANGUAGE = "en-US";

var TMDB_IMAGE_ORIGINAL =
  "https://image.tmdb.org/t/p/original";

/* TMDB CONNECTION */

function unwrap(response) {
  return response &&
    response.data &&
    typeof response.data === "object"
    ? response.data
    : response;
}

async function getMovie() {
  var movie = unwrap(
    await Widget.tmdb.get(
      "movie/" + MOVIE_ID,
      {
        params: {
          language: LANGUAGE
        }
      }
    )
  );

  if (!movie || Number(movie.id) !== MOVIE_ID) {
    throw new Error("TMDB movie details missing");
  }

  return movie;
}

async function getPosters() {
  var images = unwrap(
    await Widget.tmdb.get(
      "movie/" + MOVIE_ID + "/images",
      {
        params: {
          include_image_language: "null,en"
        }
      }
    )
  );

  if (!images || !Array.isArray(images.posters)) {
    throw new Error("TMDB poster list missing");
  }

  return images.posters;
}

/* TEXTLESS POSTER CANDIDATES */

function cleanCandidates(posters, defaultPath) {
  return posters.filter(function(p) {
    if (!p || !p.file_path) return false;

    if (p.iso_639_1 != null) return false;

    if (p.file_path === defaultPath) return false;

    var width = Number(p.width) || 0;
    var height = Number(p.height) || 0;

    var ratio = Number(p.aspect_ratio) ||
      (height ? width / height : 0);

    return (
      width >= 780 &&
      height >= 1100 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });
}

/*
 * HIGH-RESOLUTION TIERS
 *
 * Tier 4: 2000 × 3000 or better
 * Tier 3: 1600 × 2400 or better
 * Tier 2: 1200 × 1800 or better
 * Tier 1: 1000 × 1500 or better
 *
 * Resolution is prioritized before
 * TMDB popularity and ratings.
 */

function qualityTier(p) {
  var width = Number(p.width) || 0;
  var height = Number(p.height) || 0;

  if (width >= 2000 && height >= 3000) {
    return 4;
  }

  if (width >= 1600 && height >= 2400) {
    return 3;
  }

  if (width >= 1200 && height >= 1800) {
    return 2;
  }

  if (width >= 1000 && height >= 1500) {
    return 1;
  }

  return 0;
}

/* QUALITY SCORING */

function rankCandidate(p) {
  var width = Number(p.width) || 0;
  var height = Number(p.height) || 0;

  var votes = Number(p.vote_count) || 0;
  var rating = Number(p.vote_average) || 0;

  return (
    qualityTier(p) * 100000 +
    Math.min(width * height / 1000, 20000) +
    Math.min(votes, 80) * 4 +
    Math.min(rating, 10) * 40
  );
}

/* SELECT BEST HIGH-RES IMAGE */

function pickBestHighResolution(posters, defaultPath) {
  var candidates = cleanCandidates(
    posters,
    defaultPath
  );

  candidates.sort(function(a, b) {
    return rankCandidate(b) - rankCandidate(a);
  });

  if (!candidates.length) {
    throw new Error(
      "No eligible language-neutral poster for The Matrix"
    );
  }

  return candidates[0];
}

/*
 * ORIGINAL SELECTOR FOR TEST 2
 *
 * Preserves the selection rules of
 * the earlier successful test.
 */

function pickOriginalTextless(posters, defaultPath) {
  var candidates = cleanCandidates(
    posters,
    defaultPath
  );

  candidates.sort(function(a, b) {
    function score(p) {
      return (
        (Number(p.vote_average) || 0) * 10 +
        Math.min(
          Number(p.vote_count) || 0,
          100
        ) * 0.3 +
        Math.min(
          Number(p.width) || 0,
          3000
        ) / 1000
      );
    }

    return score(b) - score(a);
  });

  if (!candidates.length) {
    throw new Error(
      "No language-neutral poster found"
    );
  }

  return candidates[0];
}

/* BUILD REX MEDIA ITEM */

function makeItem(movie, posterPath) {
  var genres = Array.isArray(movie.genres)
    ? movie.genres.map(function(g) {
        return {
          id: String(g.id),
          title: String(g.name || "")
        };
      })
    : [];

  return {
    id: "movie." + MOVIE_ID,
    type: "tmdb",
    mediaType: "movie",

    title:
      movie.title ||
      movie.original_title ||
      "The Matrix",

    posterPath: posterPath,

    backdropPath: movie.backdrop_path || "",

    releaseDate: movie.release_date || "",

    description: movie.overview || "",

    rating: movie.vote_average || 0,

    genreTitle: genres
      .map(function(g) {
        return g.title;
      })
      .filter(Boolean)
      .join(" · "),

    genreItems: genres
  };
}

/* TEST 1 — ORIGINAL STANDARD POSTER */

async function loadStandardPoster(params) {
  var movie = await getMovie();

  if (!movie.poster_path) {
    throw new Error("No standard TMDB poster");
  }

  return [
    makeItem(
      movie,
      movie.poster_path
    )
  ];
}

/* TEST 2 — ORIGINAL TEXTLESS TEST */

async function loadTextlessPoster(params) {
  var movie = await getMovie();

  var poster = pickOriginalTextless(
    await getPosters(),
    movie.poster_path || ""
  );

  return [
    makeItem(
      movie,
      poster.file_path
    )
  ];
}

/*
 * TEST 3 — HIGH-RESOLUTION TEXTLESS
 *
 * The best high-resolution candidate
 * passed through Rex's normal TMDB path.
 */

async function loadHighResPath(params) {
  var movie = await getMovie();

  var poster = pickBestHighResolution(
    await getPosters(),
    movie.poster_path || ""
  );

  return [
    makeItem(
      movie,
      poster.file_path
    )
  ];
}

/*
 * TEST 4 — ORIGINAL URL
 *
 * Uses the exact same poster as Test 3.
 *
 * Only the delivery path changes.
 *
 * Full URLs inside TMDB-type items
 * are not yet verified in Rex.
 */

async function loadHighResOriginalUrl(params) {
  var movie = await getMovie();

  var poster = pickBestHighResolution(
    await getPosters(),
    movie.poster_path || ""
  );

  var originalUrl =
    TMDB_IMAGE_ORIGINAL + poster.file_path;

  return [
    makeItem(
      movie,
      originalUrl
    )
  ];
}
