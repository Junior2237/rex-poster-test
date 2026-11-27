/*
 * Isolated Rex transport test. No API key, no production changes.
 * Every module uses the identical verified Street Fighter artwork.
 */
var path="/b3ZOREKKziY9yM4yMt5oyYfWqCw.jpg";
var original="https://image.tmdb.org/t/p/original"+path;
var WidgetMetadata={
 id:"junior.rex.original.resolution.transport.test",
 title:"Original Resolution Transport Test",
 description:"Compare raw TMDB path, absolute original URL, and generic URL item",
 author:"Junior",
 version:"1.0.0",
 requiredVersion:"0.0.1",
 modules:[
  {id:"raw",title:"A — Native TMDB path (control)",functionName:"loadRaw",cacheDuration:0,params:[]},
  {id:"absolute",title:"B — Native TMDB original URL",functionName:"loadOriginal",cacheDuration:0,params:[]},
  {id:"generic",title:"C — Generic original URL",functionName:"loadGeneric",cacheDuration:0,params:[]}
 ]
};
function item(title){
 return {id:1153576,type:"tmdb",mediaType:"movie",title:title,tmdbId:1153576};
}
async function loadRaw(){
 var a=item("A — Street Fighter");
 a.posterPath=path;
 a.backdropPath=path;
 a.coverUrl=original;
 a.cleanPosterPath=original;
 a.faceSafePosterPath=original;
 a.detailPoster=path;
 a.backdropPaths=[path];
 return [a];
}
async function loadOriginal(){
 var a=item("B — Street Fighter");
 a.posterPath=original;
 a.backdropPath=original;
 a.coverUrl=original;
 a.cleanPosterPath=original;
 a.faceSafePosterPath=original;
 a.detailPoster=original;
 a.backdropPaths=[original];
 return [a];
}
async function loadGeneric(){
 return [{
 id:"https://www.themoviedb.org/movie/1153576",
 type:"url",
 link:"https://www.themoviedb.org/movie/1153576",
 mediaType:"movie",
 title:"C — Street Fighter",
 posterPath:original,
 backdropPath:original,
 coverUrl:original,
 cleanPosterPath:original,
 faceSafePosterPath:original,
 detailPoster:original,
 backdropPaths:[original]
 }];
}
