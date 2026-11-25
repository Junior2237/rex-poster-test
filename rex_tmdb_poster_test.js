
/*
 * REX — TMDB POSTER QUALITY TEST
 *
 * Two independent data modules:
 *
 * 1. The Matrix — Standard TMDB Poster
 * 2. The Matrix — Textless Candidate
 *
 * Uses Rex's built-in Widget.tmdb connection.
 * No personal TMDB API key required in this script.
 *
 * Does not modify existing Trakt lists.
 */

var WidgetMetadata = {
  id: "junior.tmdb.poster.quality.test",
  title: "TMDB Poster Quality Test",
  description:
    "Compare standard and language-neutral TMDB posters in Rex",
  author: "Custom Rex Home",
  version: "1.0.0",
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
    }
  ]
};

/* TEST CONFIGURATION */

var MOVIE_ID = 603;
var LANGUAGE = "en-US";

/* TMDB RESPONSE HANDLING */

function unwrapResponse(response) {
  if (
    response &&
    response.data &&
    typeof response.data === "object"
  ) {
    return response.data;
  }

  return response;
}

/* GET MOVIE DETAILS */

async function getMovie() {
  var response = await Widget.tmdb.get(
    "movie/" + MOVIE_ID,
    {
      params: {
        language: LANGUAGE
      }
    }
  );

  var movie = unwrapResponse(response);

  if (!movie || Number(movie.id) !== MOVIE_ID) {
    throw new Error(
      "TMDB did not return the requested movie."
    );
  }

  return movie;
}

/* GET ALL ALTERNATE POSTERS */

async function getMovieImages() {
  var response = await Widget.tmdb.get(
    "movie/" + MOVIE_ID + "/images",
    {
      params: {
        include_image_language: "null,en"
      }
    }
  );

  var images = unwrapResponse(response);

  if (!images || !Array.isArray(images.posters)) {
    throw new Error(
      "TMDB did not return a poster collection."
    );
  }

  return images.posters;
}

/*
 * SELECT A LANGUAGE-NEUTRAL POSTER
 *
 * Requirements:
 * - No assigned image language
 * - Portrait poster orientation
 * - Useful native image dimensions
 * - Different from the default poster
 *
 * Quality preference:
 * - TMDB community evaluation
 * - Number of evaluations
 * - Image resolution
 *
 * Rex ultimately controls the encoded
 * resolution used inside its HTML cards.
 */

function selectTextlessPoster(posters, defaultPath) {
  var candidates = posters.filter(function(poster) {
    if (!poster || !poster.file_path) {
      return false;
    }

    if (poster.iso_639_1 != null) {
      return false;
    }

    if (poster.file_path === defaultPath) {
      return false;
    }

    var width = Number(poster.width) || 0;
    var height = Number(poster.height) || 0;
    var ratio =
      Number(poster.aspect_ratio) ||
      (height > 0 ? width / height : 0);

    return (
      width >= 780 &&
      height >= 1100 &&
      ratio >= 0.60 &&
      ratio <= 0.75
    );
  });

  candidates.sort(function(a, b) {
    var votesA = Number(a.vote_count) || 0;
    var votesB = Number(b.vote_count) || 0;

    var ratingA = Number(a.vote_average) || 0;
    var ratingB = Number(b.vote_average) || 0;

    var widthA = Number(a.width) || 0;
    var widthB = Number(b.width) || 0;

    var scoreA =
      ratingA * 10 +
      Math.min(votesA, 100) * 0.3 +
      Math.min(widthA, 3000) / 1000;

    var scoreB =
      ratingB * 10 +
      Math.min(votesB, 100) * 0.3 +
      Math.min(widthB, 3000) / 1000;

    return scoreB - scoreA;
  });

  if (!candidates.length) {
    throw new Error(
      "No distinct high-resolution language-neutral poster " +
      "was found for this test movie."
    );
  }

  return candidates[0].file_path;
}

/* BUILD THE REX MEDIA ITEM */

function makeRexItem(movie, posterPath) {
  var genreItems = Array.isArray(movie.genres)
    ? movie.genres.map(function(genre) {
        return {
          id: String(genre.id),
          title: String(genre.name || "")
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

    genreTitle: genreItems
      .map(function(genre) {
        return genre.title;
      })
      .filter(function(title) {
        return !!title;
      })
      .join(" · "),

    genreItems: genreItems
  };
}

/* TEST 1 — STANDARD TMDB POSTER */

async function loadStandardPoster(params) {
  var movie = await getMovie();

  if (!movie.poster_path) {
    throw new Error(
      "TMDB has no standard poster for this movie."
    );
  }

  return [
    makeRexItem(
      movie,
      movie.poster_path
    )
  ];
}

/* TEST 2 — TEXTLESS POSTER */

async function loadTextlessPoster(params) {
  var movie = await getMovie();

  var posters = await getMovieImages();

  var selectedPath = selectTextlessPoster(
    posters,
    movie.poster_path || ""
  );

  return [
    makeRexItem(
      movie,
      selectedPath
    )
  ];
}
