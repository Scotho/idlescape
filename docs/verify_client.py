import sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8888/rs2.cgi'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
ws_events, console, errors = [], [], []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 800, 'height': 560})
    pg.on('console', lambda m: console.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: errors.append(str(e) + ' | ' + str(getattr(e,'stack',''))[:600]))
    def on_ws(ws):
        ws_events.append(f'WS OPEN {ws.url}')
        ws.on('framesent', lambda f: ws_events.append(f'-> {len(f)}B'))
        ws.on('framereceived', lambda f: ws_events.append(f'<- {len(f)}B'))
        ws.on('close', lambda w: ws_events.append('WS CLOSE'))
    pg.on('websocket', on_ws)

    r = pg.goto(URL, wait_until='domcontentloaded', timeout=60000)
    print('HTTP', r.status, r.url)
    pg.wait_for_selector('canvas', timeout=30000)
    time.sleep(15)  # let the client download the cache and render the title screen
    pg.screenshot(path=f'{OUT}/01_title.png')

    # Hit-boxes from Client.ts titleScreenLoop: centre-relative, sWid/sHei = canvas size
    box = pg.query_selector('canvas').bounding_box()
    W, H = int(box['width']), int(box['height'])
    print('canvas', W, H)
    def click(x, y):
        pg.mouse.click(box['x'] + x, box['y'] + y); time.sleep(1.5)
    click(W//2 + 80, H//2 + 40)        # "Existing User"
    pg.screenshot(path=f'{OUT}/02_login.png')
    click(W//2, H//2 - 40 + 30 + 25 - 5) # username field
    pg.keyboard.type('fabletest', delay=40)
    click(W//2, H//2 - 40 + 30 + 40 - 5) # password field
    pg.keyboard.type('fabletest', delay=40)
    click(W//2 - 80, H//2 + 70)        # "Login" button
    time.sleep(12)
    pg.screenshot(path=f'{OUT}/03_after_login.png')
    b.close()

print('--- websocket events (first 25) ---'); print('\n'.join(ws_events[:25])); print('total ws events:', len(ws_events))
print('--- page errors ---'); print('\n'.join(errors) or '(none)')
print('--- console (first 20) ---'); print('\n'.join(console[:20]))
