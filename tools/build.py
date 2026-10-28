"""Build eichenlaubphysics.com from content/sections.html.

    python tools/build.py            # rebuild index.html and draft/index.html
    python tools/build.py --pull     # pull Mark's saved draft from the editor first
    python tools/build.py --seed     # overwrite the saved draft with content/sections.html
    python tools/build.py --draft-only

content/sections.html is the source of truth: one <section> per block, in page
order. A section with data-nav="Label" gets a header link; data-hidden="true"
keeps it off the live page (the editor still shows it). The editor at /draft/
saves its HTML through the save_site_draft RPC; --pull fetches it, strips the
editor's handles and attributes, and writes it back here.
"""
import difflib, json, pathlib, re, sys, time, urllib.request
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
SB_URL = 'https://nxvtaxbntqhcfqtazbnt.supabase.co'
SB_KEY = 'sb_publishable_51M6zUC11pz8fIPkCvi4WQ_owCE99pB'


def draft_key():
    for line in (ROOT / '.env').read_text().splitlines():
        if line.startswith('DRAFT_KEY='):
            return line.split('=', 1)[1].strip()
    sys.exit('No DRAFT_KEY in .env')


def rpc(name, body):
    req = urllib.request.Request(f'{SB_URL}/rest/v1/rpc/{name}', data=json.dumps(body).encode(),
                                 headers={'apikey': SB_KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def clean(html):
    """Strip everything the editor adds, leaving plain page sections."""
    soup = BeautifulSoup(html, 'html.parser')
    for el in soup.select('.ed-chrome'):
        el.decompose()
    for el in soup.select('span.ed-text'):
        el.unwrap()
    for el in soup.find_all(True):
        for a in ('contenteditable', 'draggable', 'spellcheck'):
            el.attrs.pop(a, None)
        cls = [c for c in el.get('class', []) if not c.startswith(('ed-', 'sortable-'))]
        if cls:
            el['class'] = cls
        else:
            el.attrs.pop('class', None)
        if el.get('style', None) is not None and not el['style'].strip():
            del el['style']
    for el in soup.find_all(['h1', 'h2', 'h3', 'p', 'li']):
        if not el.get_text(strip=True).replace(' ', '') and not el.find(['img', 'a']):
            el.decompose()
    sections = soup.find_all('section', recursive=False)
    return '\n\n'.join(s.decode(formatter='html5') for s in sections) + '\n'


def render(sections_html, draft):
    soup = BeautifulSoup(sections_html, 'html.parser')
    sections = soup.find_all('section', recursive=False)
    nav, parts = [], []
    for s in sections:
        hidden = s.get('data-hidden') == 'true'
        if s.get('data-nav') and not hidden:
            nav.append(f'          <a href="#{s["id"]}">{s["data-nav"]}</a>')
        if draft:
            parts.append(s.decode(formatter='html5'))
            continue
        if hidden:
            continue
        s = BeautifulSoup(s.decode(formatter='html5'), 'html.parser').section
        del s['data-hidden']
        if parts:
            parts.append('<hr class="rule" />')
        parts.append(s.decode(formatter='html5'))
    page = (ROOT / 'tools' / 'page.html').read_text(encoding='utf8')
    page = page.replace('{{NAV}}', '\n'.join(nav))
    page = page.replace('{{SECTIONS}}', '\n\n'.join(parts))
    if draft:
        page = page.replace('{{HEAD_EXTRA}}', '  <meta name="robots" content="noindex, nofollow" />\n'
                            f'  <link rel="stylesheet" href="/draft/editor.css?v={int(time.time())}" />')
        page = page.replace('{{SCRIPT}}', '  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js"></script>\n'
                            f'  <script src="/draft/editor.js?v={int(time.time())}"></script>')
        page = page.replace('<title>Mark Eichenlaub Physics Mentorship</title>', '<title>Draft · Eichenlaub Physics</title>')
    else:
        page = page.replace('{{HEAD_EXTRA}}\n', '')
        page = page.replace('{{SCRIPT}}', (ROOT / 'tools' / 'booking.js.html').read_text(encoding='utf8'))
    return page


def text_lines(html):
    soup = BeautifulSoup(html, 'html.parser')
    out = []
    for s in soup.find_all('section', recursive=False):
        out.append(f'## [{s.get("id")}]' + (' (hidden)' if s.get('data-hidden') == 'true' else ''))
        for el in s.find_all(['h1', 'h2', 'h3', 'p', 'li', 'summary', 'cite']):
            if el.find(['p', 'h3', 'li']):
                continue
            t = re.sub(r'\s+', ' ', el.get_text(' ')).strip()
            if t:
                out.append(f'  {el.name}: {t}')
    return out


def main():
    args = set(sys.argv[1:])
    src = ROOT / 'content' / 'sections.html'
    if '--pull' in args:
        rows = rpc('get_site_draft', {'p_key': draft_key()})
        if not rows or not rows[0]['html'].strip():
            sys.exit('No saved draft yet.')
        new = clean(rows[0]['html'])
        old = src.read_text(encoding='utf8')
        print(f'Draft saved {rows[0]["updated_at"]} ({rows[0]["saves"]} saves). Changes:')
        for line in difflib.unified_diff(text_lines(old), text_lines(new), 'before', 'after', n=0, lineterm=''):
            print(line)
        src.write_text(new, encoding='utf8', newline='\n')
    if '--seed' in args:
        cur = rpc('get_site_draft', {'p_key': draft_key()})
        print('seeded', rpc('save_site_draft', {'p_key': draft_key(), 'p_html': src.read_text(encoding='utf8'), 'p_base': cur[0]['updated_at']}))
    html = src.read_text(encoding='utf8')
    (ROOT / 'draft' / 'index.html').write_text(render(html, True), encoding='utf8', newline='\n')
    if '--draft-only' not in args:
        (ROOT / 'index.html').write_text(render(html, False), encoding='utf8', newline='\n')
    print('built')


if __name__ == '__main__':
    main()
