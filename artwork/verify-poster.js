// Generated into each standalone template. The release index survives storage eviction.
var releasePosters = /* REGISTRY */ {};
var savedFrames = new Map();
var posterDatabase;
function releaseRule(item) {
 var id = item.tmdbId || item.id;
 var entry = releasePosters[item.mediaType + ':' + id];
 if (!entry) {
  var name = String(item.title || '').trim().toLowerCase();
  var matches = Object.keys(releasePosters).filter(function(key) {
   return releasePosters[key][0].toLowerCase() === name;
  });
  if (matches.length === 1) entry = releasePosters[matches[0]];
 }
 var claim = approvedFile(item.lockedPosterPath) || approvedFile(item.faceSafePosterPath) || approvedFile(item.cleanPosterPath);
 if (!entry) return claim ? [claim, item.artworkSignature || ''] : null;
 var layouts = entry[1];
 if(layouts.trending===0) layouts.trending=layouts.top20;
 if (layouts[item.artworkLayout]) return layouts[item.artworkLayout];
 var choices = Object.values(layouts);
 return choices.find(function(rule){return rule[0] === claim;}) || layouts.top20 || choices[0];
}
function frameDatabase() {
 if (!posterDatabase) posterDatabase = new Promise(function(resolve) {
  try {
   var request = indexedDB.open('rex-approved-poster-frames-v1', 1);
   request.onupgradeneeded = function(){request.result.createObjectStore('frames');};
   request.onsuccess = function(){resolve(request.result);};
   request.onblocked = request.onerror = function(){resolve(null);};
  } catch (_) { resolve(null); }
 });
 return posterDatabase;
}
async function storedFrame(path) {
 var db = await frameDatabase();
 if (!db) return null;
 return new Promise(function(resolve) {
  try {
   var req = db.transaction('frames').objectStore('frames').get(path);
   req.onsuccess = function(){resolve(req.result || null);};
   req.onerror = function(){resolve(null);};
  } catch (_) {resolve(null);}
 });
}
function retainFrame(path, canvas) {
 savedFrames.delete(path);
 savedFrames.set(path,canvas);
 if (savedFrames.size > 4) savedFrames.delete(savedFrames.keys().next().value);
 try {
  canvas.toBlob(async function(blob) {
   if (!blob) return;
   try {
    var bytes=await blob.arrayBuffer(),db=await frameDatabase();
    if(db) db.transaction('frames','readwrite').objectStore('frames').put(bytes,path);
   } catch (_) {}
  },'image/png');
 } catch (_) {}
}
function matchesPosterPixels(image, signature) {
 var small = document.createElement('canvas');
 small.width=64; small.height=96;
 var ctx=small.getContext('2d',{willReadFrequently:true});
 ctx.imageSmoothingQuality='high';
 ctx.drawImage(image,0,0,64,96);
 var pixels=ctx.getImageData(0,0,64,96).data, packed=atob(signature);
 if (packed.length !== 36) return false;
 var error=0, index=0;
 for (var y=0;y<6;y++) for (var x=0;x<4;x++) {
  var sums=[0,0,0];
  for(var yy=0;yy<16;yy++) for(var xx=0;xx<16;xx++) {
   var off=4*((y*16+yy)*64+x*16+xx);
   for(var c=0;c<3;c++) sums[c]+=pixels[off+c];
  }
  for(var ch=0;ch<3;ch++,index++) {
   var pair=packed.charCodeAt(index>>1);
   var ref=16*((index%2)?(pair&15):(pair>>4))+7.5;
   error+=Math.pow(ref-sums[ch]/256,2);
  }
 }
 return Math.sqrt(error/72) <= 10;
}
function freezeDecoded(image) {
 var canvas=document.createElement('canvas');
 canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
 canvas.getContext('2d').drawImage(image,0,0);
 return canvas;
}
function installFrame(frame, path) {
 var prior=el('poster'), node=document.createElement('canvas');
 node.id=prior.id; node.className=prior.className;
 node.width=frame.width; node.height=frame.height;
 node.setAttribute('aria-hidden','true');
 node.dataset.poster=path;
 node.getContext('2d').drawImage(frame,0,0);
 prior.replaceWith(node);
}
function readImage(src) {
 return new Promise(function(resolve) {
  var image=new Image();
  image.onload=function(){resolve(image);};
  image.onerror=function(){resolve(null);};
  image.src=src;
 });
}
async function obtainApprovedFrame(art) {
 var path=art.identity, signature=art.signature;
 if(savedFrames.has(path)) return savedFrames.get(path);
 // Disk can recover a recycled native reference after the app restarts.
 var disk=storedFrame(path).then(async function(blob){
  if (!blob) return null;
  var url=URL.createObjectURL(new Blob([blob],{type:'image/png'}));
  try {var image=await readImage(url);return image ? freezeDecoded(image) : null;}
  finally {URL.revokeObjectURL(url);}
 }).catch(function(){return null;});
 var incoming=(async function(){
  for (var i=0;i<art.refs.length;i++) {
   var src=art.refs[i], named=approvedFile(src);
   if(named && named!==path) continue;
   var image=await readImage(src);
   if(!image) continue;
   if(signature) {
    try {if(!matchesPosterPixels(image,signature)) continue;}
    catch (_) {if(named!==path) continue;}
   } else if(named!==path) continue;
   var frame=freezeDecoded(image);
   retainFrame(path,frame);
   return frame;
  }
  return null;
 })().catch(function(){return null;});
 // A failed route never wins against one that can still return verified pixels.
 return new Promise(function(resolve){
  var remaining=2;
  [disk,incoming].forEach(function(task){task.then(function(result){
   if(result)resolve(result);
   else if(--remaining===0)resolve(null);
  });});
 });
}
