"""Run with Playwright and Chromium. Renders the shipping HTML against a simulated Rex host."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import urllib.request
import base64
import os

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = (
    ("rex_top20_regular_logo_renderer.html", 256, 384),
    ("rex_top20_logo_renderer.html", 400, 480),
    ("rex_oversized_apple_style_unnumbered.html", 560, 700),
)
PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=")
HOST = """
window.RexWidget = {
  content: {items: []}, layout: {width: innerWidth,height: innerHeight,index:0},
  onContentChanged: f => window.notifyContent = f,
  onLayoutChanged: f => window.notifyLayout = f,
  open: (type,id) => window.opened = [type,id],
  canOpen: () => true
};
window.updateItem = item => {
  RexWidget.content = {items:item ? [item] : []};
  notifyContent();
};
"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def check(page, name, width, height, base):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_viewport_size({"width": width, "height": height})
    page.add_init_script(HOST)
    page.route("**/fixture/**", lambda route: route.fulfill(body=PIXEL, content_type="image/png"))
    page.goto(f"{base}/{name}")
    art = f"{base}/fixture/approved.jpg"
    other = f"{base}/fixture/other.jpg"
    logo = f"{base}/fixture/logo.png"
    item = dict(id=123, mediaType="movie", title="Test title", rank=2,
                posterPath=art, lockedPosterPath=art, titleLogoPath=logo,
                backdropPaths=[art, logo], genreTitle="Drama")

    def update(value):
        page.evaluate("item => updateItem(item)", value)

    def visible(src):
        page.wait_for_function("""src => {
          const img = document.querySelector('#poster');
          return !img.hidden && img.tagName === "CANVAS" && img.dataset.poster === new URL(src,document.baseURI).pathname.split("/").slice(-1).map(x=>"/"+x)[0];
        }""", arg=src, timeout=4000)

    update(item)
    visible(art)
    page.wait_for_function("() => !document.querySelector('#logo').hidden && document.querySelector('#logo').naturalWidth > 0")
    update(None)
    update({**item, "rank": 12, "title":"Localized name", "lockedPosterPath": other, "posterPath": other})
    visible(art)
    if name != "rex_oversized_apple_style_unnumbered.html":
        assert page.locator("#rank").get_attribute("data-digit") == "12"
    box = page.locator("#card").bounding_box()
    assert round(box["height"]) == height and round(box["width"]) == width, box
    # A different record can reuse the card, including the same numeric ID in TV.
    update({**item, "mediaType":"tv", "lockedPosterPath":other, "posterPath":other})
    visible(other)
    update(item)
    visible(art)
    page.locator("#open").focus()
    page.keyboard.press("Enter")
    assert page.evaluate("window.opened") == ["item",123]
    page.reload()
    # Replay the reported Popular Series sequence. An opaque native token can
    # resolve to a different image when a card is recycled under the same ID.
    records = [(225171,"Pluribus","/g6y5N9aTnvgrI092oflyoK82IGj.jpg"),
               (250307,"The Pitt","/flgp5KE4Ed0lmhYodj65EGmCfZe.jpg")]
    frames = {}
    for ident,title,path in records:
        with urllib.request.urlopen("https://image.tmdb.org/t/p/w185"+path, timeout=20) as response:
            frames[ident] = response.read()
    replacements = {225171:"/2qpliomuQnzmY1fqUQAoLzXOhrQ.jpg", 250307:"/jLxZPL8OGvkiZW5J7uXN8RK8HCi.jpg"}
    wrong = {}
    for ident,path in replacements.items():
        with urllib.request.urlopen("https://image.tmdb.org/t/p/w185"+path,timeout=20) as response:
            wrong[ident]=response.read()
    active = [records[0][0]]
    opaque = f"{base}/native/item"
    page.route("**/native/item", lambda route: route.fulfill(body=wrong[active[0]],content_type="image/jpeg",
                                                              headers={"Cache-Control":"no-store"}))
    def show(record):
        ident,title,path = record
        update(dict(id=ident,mediaType="tv",title=title,rank=3,
                    backdropPaths=[opaque,logo],posterPath=other))
    shown = {}
    for record in records:
        active[0]=record[0]
        # Native framework also supplies the selected source-specific token.
        uri = f"{base}/native/verified-{record[0]}"
        page.route(uri, lambda route: route.fulfill(body=frames[int(route.request.url.rsplit("-",1)[1])],content_type="image/jpeg"))
        update(dict(id=record[0],mediaType="tv",title=record[1],rank=3,
                    backdropPaths=[opaque,logo],backdropPath=uri,posterPath=other))
        visible(record[2])
        shown[record[0]]=page.locator("#poster").evaluate("c=>c.toDataURL('image/png')")
    # The token still contains Pitt when the Pluribus cell returns.
    active[0]=records[0][0]
    show(records[0])
    visible(records[0][2])
    assert page.locator("#poster").evaluate("c=>c.toDataURL('image/png')")==shown[225171]
    page.wait_for_function("""async () => {
      const db=await new Promise(r=>{const q=indexedDB.open('rex-approved-poster-frames-v1');q.onsuccess=()=>r(q.result);});
      return await new Promise(r=>{const q=db.transaction('frames').objectStore('frames').get('/g6y5N9aTnvgrI092oflyoK82IGj.jpg');q.onsuccess=()=>r(!!q.result);});
    }""")
    page.reload()
    active[0]=records[0][0]
    show(records[0])
    visible(records[0][2])
    assert page.locator("#poster").evaluate("c=>c.toDataURL('image/png')")==shown[225171]
    # With prior storage erased, the wrong opaque pixels must never paint.
    page.evaluate("() => indexedDB.deleteDatabase('rex-approved-poster-frames-v1') && undefined")
    page.reload()
    show(records[0])
    page.wait_for_function("() => document.querySelector('#poster').hidden")
    active[0]=records[0][0]
    page.route("**/native/fresh", lambda route: route.fulfill(body=frames[active[0]],content_type="image/jpeg"))
    update(dict(id=225171,mediaType="tv",title="Pluribus",backdropPaths=[f"{base}/native/fresh",logo]))
    visible(records[0][2])
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1",0), partial(QuietHandler,directory=ROOT))
    Thread(target=server.serve_forever,daemon=True).start()
    with sync_playwright() as playwright:
        engine = os.getenv("REX_BROWSER", "chromium")
        binary = os.getenv("CHROMIUM_PATH") if engine == "chromium" else None
        browser = getattr(playwright, engine).launch(executable_path=binary)
        for name,width,height in TEMPLATES:
            check(browser.new_page(), name, width,height,f"http://127.0.0.1:{server.server_port}")
            print(name, "passed image load, logo, rank refresh, card reuse, activation, reload and native bundle")
        browser.close()
    server.shutdown()
