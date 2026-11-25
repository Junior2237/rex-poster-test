
/*
 * REX Poster Override Diagnostic
 * Version 1.0.0
 *
 * No Trakt API key needed.
 * Does not modify existing modules.
 */

var WidgetMetadata = {
  id: "junior.rex.poster.diagnostic",
  title: "REX — Poster Override Diagnostic",
  description: "Test TMDB poster overrides versus direct image URLs",
  author: "Junior",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      id: "poster-override-diagnostic",
      title: "TEST — Poster Override",
      functionName: "loadPosterDiagnostic",
      cacheDuration: 0,
      params: []
    }
  ]
};

async function loadPosterDiagnostic() {
  var path = "/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg";
  var original =
    "https://image.tmdb.org/t/p/original" + path;

  return [
    {
      id: "movie.603",
      type: "tmdb",
      mediaType: "movie",
      title: "TEST A — TMDB Override",
      posterPath: path,
      detailPoster: path,
      coverUrl: original
    },
    {
      id: "https://www.themoviedb.org/movie/346698",
      type: "url",
      mediaType: "movie",
      title: "TEST B — Direct Original",
      posterPath: original,
      detailPoster: original,
      coverUrl: original
    }
  ];
}
