
/*
 * REX — POSTER OVERRIDE DIAGNOSTIC
 * Version 1.1.0
 *
 * Tests whether Rex uses custom poster images
 * or replaces them with built-in TMDB artwork.
 *
 * No API credentials required.
 * Does not affect Trakt Top 20 modules.
 */

var WidgetMetadata = {
  id: "junior.rex.poster.diagnostic",
  title: "REX — Poster Override Diagnostic",
  description:
    "Compare TMDB poster overrides with direct original-resolution images",
  author: "Junior",
  version: "1.1.0",
  requiredVersion: "0.0.1",

  modules: [
    {
      id: "poster-override-test",
      title: "TEST — Poster Override",
      functionName: "loadPosterDiagnostic",
      cacheDuration: 0,
      params: []
    }
  ]
};

async function loadPosterDiagnostic() {

  /*
   * Known reference:
   *
   * The Matrix:
   * TMDB Movie ID 603
   *
   * Barbie:
   * TMDB Movie ID 346698
   *
   * We deliberately assign Barbie artwork
   * to a Matrix item.
   */

  var barbiePoster =
    "/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg";

  var originalBarbiePoster =
    "https://image.tmdb.org/t/p/original" +
    barbiePoster;

  return [

    /*
     * TEST A
     *
     * TMDB-backed movie with a deliberately
     * incorrect poster override.
     *
     * Expected if override works:
     * The Matrix title with Barbie artwork.
     */

    {
      id: "movie.603",
      type: "tmdb",
      mediaType: "movie",

      title: "TEST A — TMDB Override",

      posterPath: barbiePoster,
      detailPoster: barbiePoster,
      coverUrl: originalBarbiePoster
    },

    /*
     * TEST B
     *
     * URL-backed item using the direct
     * original-resolution Barbie image.
     *
     * Expected:
     * Barbie artwork.
     */

    {
      id: "https://www.themoviedb.org/movie/603",
      type: "url",
      mediaType: "movie",

      title: "TEST B — Direct Original",

      posterPath: originalBarbiePoster,
      detailPoster: originalBarbiePoster,
      coverUrl: originalBarbiePoster
    }

  ];
}
