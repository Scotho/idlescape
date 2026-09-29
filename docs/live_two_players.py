import sys, time
from playwright.sync_api import sync_playwright

URL = 'https://osrs.scotho.com/rs2.cgi'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
NAMES = ['livetest1', 'livetest2']

def login(pg, name):
    pg.wait_for_selector('canvas', timeout=60000)
    time.sleep(15)
    box = pg.query_selector('canvas').bounding_box()
    W, H = int(box['width']), int(box['height'])
    def click(x, y):
        pg.mouse.click(box['x'] + x, box['y'] + y); time.sleep(1.5)
    click(W//2 + 80, H//2 + 40)
    click(W//2, H//2 - 40 + 30 + 25 - 5)
    pg.keyboard.type(name, delay=40)
    click(W//2, H//2 - 40 + 30 + 40 - 5)
    pg.keyboard.type(name, delay=40)
    click(W//2 - 80, H//2 + 70)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pages, stats = [], {}
    for name in NAMES:
        ctx = b.new_context(viewport={'width': 800, 'height': 560})
        pg = ctx.new_page()
        stats[name] = {'ws': [], 'rx': 0, 'errors': []}
        pg.on('pageerror', lambda e, n=name: stats[n]['errors'].append(str(e)))
        def on_ws(ws, n=name):
            stats[n]['ws'].append(ws.url)
            ws.on('framereceived', lambda f, n=n: stats[n].__setitem__('rx', stats[n]['rx'] + 1))
        pg.on('websocket', on_ws)
        r = pg.goto(URL, wait_until='domcontentloaded', timeout=60000)
        print(name, 'HTTP', r.status)
        pages.append((name, pg))
    for name, pg in pages:
        login(pg, name)
    time.sleep(12)
    before = {n: stats[n]['rx'] for n in NAMES}
    time.sleep(10)
    for name, pg in pages:
        pg.screenshot(path=f'{OUT}/live_{name}.png')
        s = stats[name]
        print(f"{name}: ws={s['ws']} frames={s['rx']} (+{s['rx'] - before[name]} in last 10s) errors={s['errors'] or 'none'}")
    b.close()
