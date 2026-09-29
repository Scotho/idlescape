"""Headless check of the live site: open it, wait for the guest identity, click Login, and
report whether the game client actually loads (canvas present, game WebSocket opened, engine
frames received). Prints console errors and failed requests; writes screenshots before/after."""
import sys, json, time
from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[1] if len(sys.argv) > 1 else 'https://osrs.scotho.com'
WAIT_S = int(sys.argv[2]) if len(sys.argv) > 2 else 25

console, failed, sockets = [], [], []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1100, 'height': 800})
    page = ctx.new_page()
    page.on('console', lambda m: console.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(f'pageerror: {e}'))
    page.on('response', lambda r: failed.append(f'{r.status} {r.request.method} {r.url}') if r.status >= 400 else None)

    def on_ws(ws):
        rec = {'url': ws.url, 'frames_in': 0, 'bytes_in': 0, 'closed': False}
        sockets.append(rec)
        ws.on('framereceived', lambda f: (rec.__setitem__('frames_in', rec['frames_in'] + 1),
                                          rec.__setitem__('bytes_in', rec['bytes_in'] + len(f))))
        ws.on('close', lambda _: rec.__setitem__('closed', True))
    page.on('websocket', on_ws)

    page.goto(ORIGIN, wait_until='domcontentloaded', timeout=60000)

    # Wait for the entry card's Login button to be enabled (guest sign-in done).
    login = page.get_by_role('button', name='Login', exact=True)
    try:
        login.wait_for(state='visible', timeout=30000)
        page.wait_for_function("() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Login'); return b && !b.disabled; }", timeout=30000)
        identity = page.evaluate("() => (document.getElementById('entry-identity')||{}).textContent")
        print('identity strip:', repr(identity))
    except Exception as e:
        print('Login button not ready:', e)
    page.screenshot(path='guest-1-entry.png')

    t0 = time.time()
    login.click()
    print('clicked Login')
    # Give the client time to boot: look for a canvas and a game websocket.
    deadline = time.time() + WAIT_S
    canvas = False
    while time.time() < deadline:
        canvas = page.evaluate("() => !!document.querySelector('canvas')")
        page.wait_for_timeout(1000)
    page.screenshot(path='guest-2-after-login.png')
    visible_text = page.evaluate("() => document.body.innerText.slice(0, 600)")
    b.close()

print(f'--- after {time.time()-t0:.0f}s ---')
print('canvas present:', canvas)
print('websockets:', json.dumps(sockets, indent=1))
print('visible text:', json.dumps(visible_text))
print('console:', json.dumps(console, indent=1))
print('failed requests:', json.dumps([f for f in failed if 'cdn-cgi' not in f], indent=1))
ok = canvas and any(s['frames_in'] > 0 and not s['closed'] for s in sockets)
print('RESULT:', 'CLIENT LOADED' if ok else 'CLIENT DID NOT LOAD')
sys.exit(0 if ok else 1)
