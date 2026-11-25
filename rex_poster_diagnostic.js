
/*
 * REX — POSTER RESOLUTION DIAGNOSTIC
 * Version 1.2.0
 *
 * Tests whether Rex renders different
 * source resolutions at different quality.
 *
 * Does NOT modify the Trakt Top 20 module.
 */

var WidgetMetadata = {
  id: "junior.rex.poster.diagnostic",
  title: "REX — Poster Resolution Diagnostic",
  description: "185px versus original TMDB poster",
  author: "Junior",
  version: "1.2.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      id: "poster-override-test",
      title: "TEST — Poster Resolution",
      functionName: "loadPosterDiagnostic",
      cacheDuration: 0,
      params: []
    }
  ]
};

async function loadPosterDiagnostic() {

  var poster =
    "/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg";

  var low =
    "https://image.tmdb.org/t/p/w185" + poster;

  var original =
    "https://image.tmdb.org/t/p/original" + poster;

  return [
    {
      id: "https://www.themoviedb.org/movie/603",
      type: "url",
      mediaType: "movie",
      title: "TEST A — LOW 185px",
      posterPath: low,
      detailPoster: low,
      coverUrl: low
    },
    {
      id: "https://www.themoviedb.org/movie/346698",
      type: "url",
      mediaType: "movie",
      title: "TEST B — ORIGINAL",
      posterPath: original,
      detailPoster: original,
      coverUrl: original
    }
  ];
}
