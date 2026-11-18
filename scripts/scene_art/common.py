"""Shared helpers for world art: masks, polygon rasters, inpainting, pixel-art rotation, hand
pixel maps, and the indexed PNG writer. Pillow only (no numpy).

Conventions: a grid is a flat list (or bytearray) of w*h values, row-major. Index grids hold
palette indices 0..27 and KEY (28) for transparent. Masks are bytearrays of 0/1."""
import math, random, struct, zlib
from dataclasses import dataclass, field
from PIL import Image

KEY = 28


@dataclass
class Layer:
    name: str
    depth: float
    rate: float
    px: list                      # w*h indices, KEY = transparent (never in layers[0])
    travel: tuple = None          # (left, right, up, down) a shift hook may move it, world px


@dataclass
class Sprite:
    name: str
    w: int
    h: int
    frames: list                  # each a w*h index list, KEY = transparent
    at: tuple                     # top-left in world px
    layer: str                    # drawn right after this layer
    rest: int = 0


@dataclass
class Art:
    layers: list
    sprites: list = field(default_factory=list)
    notes: dict = field(default_factory=dict)   # free-form, shown on the contact sheet only


# ---------------------------------------------------------------- masks
def raster(poly, w, h, ss=4, cut=0.5):
    """Coverage mask of a polygon given in grid coordinates (pixel (x, y) spans x..x+1)."""
    from PIL import ImageDraw
    m = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(m).polygon([(x * ss, y * ss) for x, y in poly], fill=255)
    m = m.resize((w, h), Image.BOX)
    return bytearray(1 if v >= 255 * cut else 0 for v in m.getdata())


def dilate(m, w, h, r=1):
    out = bytearray(m)
    for y in range(h):
        for x in range(w):
            if m[y * w + x]:
                for yy in range(max(0, y - r), min(h, y + r + 1)):
                    for xx in range(max(0, x - r), min(w, x + r + 1)):
                        out[yy * w + xx] = 1
    return out


def erode(m, w, h, r=1):
    inv = bytearray(1 - v for v in m)
    return bytearray(1 - v for v in dilate(inv, w, h, r))


def majority(m, w, h, passes=1):
    """3x3 majority vote: rounds off single-pixel noise in a mask."""
    for _ in range(passes):
        out = bytearray(m)
        for y in range(h):
            for x in range(w):
                n = t = 0
                for yy in range(max(0, y - 1), min(h, y + 2)):
                    for xx in range(max(0, x - 1), min(w, x + 2)):
                        n += 1; t += m[yy * w + xx]
                out[y * w + x] = 1 if 2 * t > n else 0 if 2 * t < n else m[y * w + x]
        m = out
    return m


# ---------------------------------------------------------------- inpainting (RGB, before quantising)
def inpaint(img, hole, ok, rng, patch=(4, 3), reach=(6, 40), dy=3, order=None):
    """Fills the `hole` pixels of RGB image `img` (in place) with small patches copied from
    nearby pixels for which ok(sx, sy, tx, ty) holds (tx, ty = the target). Each patch picks its
    own random source offset (x within `reach` either side, y within +-dy), so a fill never
    repeats one offset along a row or column: no streaks. Filled pixels become sources too, so
    large holes fill from their edges inwards; later sweeps look further and fall back to single
    pixels. Returns the pixels it could not fill."""
    w, h = img.size
    px = img.load()
    hole = bytearray(hole)
    pw, ph = patch
    todo = [(x, y, pw, ph) for y in range(0, h, ph) for x in range(0, w, pw)
            if any(hole[yy * w + xx] for yy in range(y, min(h, y + ph)) for xx in range(x, min(w, x + pw)))]
    if order: todo.sort(key=lambda t: order(t[0], t[1]))
    else: rng.shuffle(todo)
    for sweep in range(8):
        left = []
        rx, ry = reach[1] * (1 + sweep), dy * (1 + sweep // 2)
        for x, y, qw, qh in todo:
            cells = [(xx, yy) for yy in range(y, min(h, y + qh)) for xx in range(x, min(w, x + qw)) if hole[yy * w + xx]]
            if not cells: continue
            done = False
            for _try in range(80):
                ox = rng.randint(reach[0], rx) * rng.choice((-1, 1))
                oy = rng.randint(-ry, ry)
                good = True
                for xx, yy in cells:
                    sx, sy = xx + ox, yy + oy
                    if not (0 <= sx < w and 0 <= sy < h) or hole[sy * w + sx] or not ok(sx, sy, xx, yy):
                        good = False; break
                if good:
                    for xx, yy in cells:
                        px[xx, yy] = px[xx + ox, yy + oy]
                        hole[yy * w + xx] = 0
                    done = True
                    break
            if not done:
                left += [(xx, yy, 1, 1) for xx, yy in cells] if sweep >= 3 else [(x, y, qw, qh)]
        todo = left
        if not todo: break
    for xx, yy, _, _ in todo:                # last resort: the nearest allowed pixel
        best = None
        for r in range(1, max(w, h)):
            for sy in range(max(0, yy - r), min(h, yy + r + 1)):
                for sx in (xx - r, xx + r) if abs(sy - yy) < r else range(max(0, xx - r), min(w, xx + r + 1)):
                    if 0 <= sx < w and not hole[sy * w + sx] and ok(sx, sy, xx, yy):
                        best = (sx, sy); break
                if best: break
            if best: break
        if best:
            px[xx, yy] = px[best]
            hole[yy * w + xx] = 0
    return [(x, y) for y in range(h) for x in range(w) if hole[y * w + x]]


# ---------------------------------------------------------------- pixel-art rotation (RotSprite)
def scale2x(g, w, h):
    """EPX/Scale2x on an index grid: doubles the size and keeps edges crisp."""
    out = [KEY] * (4 * w * h)
    W2 = 2 * w
    for y in range(h):
        for x in range(w):
            p = g[y * w + x]
            a = g[(y - 1) * w + x] if y > 0 else p
            b = g[y * w + x + 1] if x < w - 1 else p
            c = g[y * w + x - 1] if x > 0 else p
            d = g[(y + 1) * w + x] if y < h - 1 else p
            e0 = a if (c == a and c != d and a != b) else p
            e1 = b if (a == b and a != c and b != d) else p
            e2 = c if (d == c and d != b and c != a) else p
            e3 = d if (b == d and b != a and d != c) else p
            o = (2 * y) * W2 + 2 * x
            out[o], out[o + 1], out[o + W2], out[o + W2 + 1] = e0, e1, e2, e3
    return out, 2 * w, 2 * h


def rotate(g, w, h, angle, pivot, dest, dest_w, dest_h, to=(0.0, 0.0), only=None):
    """RotSprite: upscales grid g (w*h, origin at world (0,0) of its own frame) 8x with Scale2x,
    rotates by `angle` radians (clockwise on screen) about `pivot` (grid coords), moves the pivot
    to `to` (dest coords) and samples each dest pixel centre. Opaque samples overwrite dest
    (or only where only(x, y) holds). Returns the set of dest pixels written."""
    big, bw, bh = g, w, h
    for _ in range(3): big, bw, bh = scale2x(big, bw, bh)
    s = bw / w
    ca, sa = math.cos(angle), math.sin(angle)
    wrote = set()
    for y in range(dest_h):
        for x in range(dest_w):
            dx, dy = x + 0.5 - to[0], y + 0.5 - to[1]
            # inverse rotation back into source coords
            sx = pivot[0] + dx * ca + dy * sa
            sy = pivot[1] - dx * sa + dy * ca
            i, j = int(math.floor(sx * s)), int(math.floor(sy * s))
            if 0 <= i < bw and 0 <= j < bh:
                v = big[j * bw + i]
                if v != KEY and (only is None or only(x, y)):
                    dest[y * dest_w + x] = v
                    wrote.add((x, y))
    return wrote


# ---------------------------------------------------------------- hand pixel maps
def paint(g, w, x0, y0, rows, legend):
    """Draws an ASCII pixel map onto grid g at (x0, y0). legend maps a character to an index
    (KEY erases); characters not in the legend (e.g. '.') are left as they are."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in legend:
                x, y = x0 + i, y0 + j
                if 0 <= x < w and 0 <= y * w + x < len(g): g[y * w + x] = legend[ch]


def despeckle(g, w, h, keep=()):
    """Replaces an opaque pixel whose 4 neighbours all agree on another opaque colour by that
    colour: dither left alone where the pixel moved breaks up into lone dots; this rounds them off."""
    out = list(g)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            v = g[y * w + x]
            if v == KEY or v in keep: continue
            n = [g[(y - 1) * w + x], g[(y + 1) * w + x], g[y * w + x - 1], g[y * w + x + 1]]
            if n[0] == n[1] == n[2] == n[3] and n[0] != v and n[0] != KEY: out[y * w + x] = n[0]
    return out


# ---------------------------------------------------------------- composite and PNG
def composite(art, w, h):
    """The rest frame: every layer back to front, each followed by its sprites' rest frames."""
    out = [KEY] * (w * h)
    for L in art.layers:
        for i, v in enumerate(L.px):
            if v != KEY: out[i] = v
        for s in art.sprites:
            if s.layer != L.name: continue
            blit(out, w, h, s.frames[s.rest], s.w, s.h, *s.at)
    return out


def blit(out, w, h, src, sw, sh, x0, y0):
    for y in range(sh):
        wy = y0 + y
        if not 0 <= wy < h: continue
        for x in range(sw):
            v = src[y * sw + x]
            wx = x0 + x
            if v != KEY and 0 <= wx < w: out[wy * w + wx] = v


def _chunk(t, data):
    return struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def _filtered(px, w, h, mode):
    out = bytearray()
    prev = bytes(w)
    for y in range(h):
        row = bytes(px[y * w:(y + 1) * w])
        best = None
        for f in ((0, 1, 2, 3, 4) if mode == 'adaptive' else (mode,)):
            r = bytearray([f])
            for x in range(w):
                a = row[x - 1] if x else 0
                b = prev[x]
                c = prev[x - 1] if x else 0
                pred = (0, a, b, (a + b) >> 1, _paeth(a, b, c))[f]
                r.append((row[x] - pred) & 0xff)
            score = sum(v if v < 128 else 256 - v for v in r[1:])
            if best is None or score < best[0]: best = (score, r)
        out += best[1]
        prev = row
    return bytes(out)


def write_png(path, w, h, px, palette, transparent_last=True):
    """8-bit indexed PNG with exactly the given palette (+ a tRNS making the last entry
    transparent), no metadata chunks. Keeps the smaller of unfiltered and adaptive IDAT."""
    assert len(px) == w * h and max(px) < len(palette)
    head = b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0))
    head += _chunk(b'PLTE', bytes(v for c in palette for v in c))
    if transparent_last:
        head += _chunk(b'tRNS', bytes([255] * (len(palette) - 1) + [0]))
    idat = min((zlib.compress(_filtered(px, w, h, m), 9) for m in (0, 'adaptive')), key=len)
    with open(path, 'wb') as f:
        f.write(head + _chunk(b'IDAT', idat) + _chunk(b'IEND', b''))


def flat_image(px, w, h, palette):
    """A Pillow P image of an index grid without KEY pixels, on the given palette."""
    assert KEY not in px
    im = Image.new('P', (w, h))
    im.putpalette([v for c in palette for v in c])
    im.putdata(px)
    return im


def rgb_preview(px, w, h, palette, bg=(255, 0, 255)):
    im = Image.new('RGB', (w, h))
    im.putdata([palette[v] if v != KEY else bg for v in px])
    return im


# ---------------------------------------------------------------- previews and contact sheet
CAM_X, CAM_Y = 12, 4          # as src/lib/world-math.ts


def view(art, ww, wh, at, size, p=0.0, frames=None, skip=()):
    """One view as the renderer draws it inside a stop: progress p moves each layer by
    round(CAM·p·rate); sprites use `frames` (name -> frame) or their rest frame."""
    vw, vh = size
    out = [KEY] * (vw * vh)
    for L in art.layers:
        ox = at[0] + round(CAM_X * p * L.rate)
        oy = at[1] + round(-CAM_Y * p * L.rate)
        for y in range(vh):
            for x in range(vw):
                wx, wy = x + ox, y + oy
                if 0 <= wx < ww and 0 <= wy < wh:
                    v = L.px[wy * ww + wx]
                    if v != KEY: out[y * vw + x] = v
        for s in art.sprites:
            if s.layer != L.name or s.name in skip: continue
            f = (frames or {}).get(s.name, s.rest)
            blit(out, vw, vh, s.frames[f], s.w, s.h, s.at[0] - ox, s.at[1] - oy)
    return out


def _big(px, w, h, pal, s, checker=True):
    im = Image.new('RGB', (w, h))
    im.putdata([pal[v] if v != KEY else ((236, 120, 236) if checker and ((i % w) // 4 + (i // w) // 4) % 2 else (190, 90, 190))
                for i, v in enumerate(px)])
    return im.resize((w * s, h * s), Image.NEAREST)


def world_sheet(k, art, meta, rest, pal):
    from PIL import ImageDraw
    ww, wh = meta['world']
    land, port = meta['view']['land'], meta['view']['port']
    rows = []
    ink, paper = (29, 27, 24), (245, 242, 236)

    def row(items, label):
        pad, lab = 10, 14
        W = pad + sum(im.width + pad for im, _ in items)
        H = lab + pad + max(im.height for im, _ in items) + lab + pad
        r = Image.new('RGB', (W, H), paper)
        d = ImageDraw.Draw(r)
        d.text((pad, 2), label, fill=ink)
        x = pad
        for im, t in items:
            r.paste(im, (x, lab + pad))
            d.text((x, lab + pad + im.height + 2), t, fill=ink)
            x += im.width + pad
        rows.append(r)

    row([(_big(L.px, ww, wh, pal, 2), f'{L.name} d{L.depth} r{L.rate}') for L in art.layers], f'{k}: layers (x2, magenta = transparent)')
    comp = _big(rest, ww, wh, pal, 3)
    d = ImageDraw.Draw(comp)
    d.rectangle([land[0] * 3, land[1] * 3, (land[0] + 240) * 3 - 1, (land[1] + 135) * 3 - 1], outline=(220, 30, 30), width=2)
    d.rectangle([port[0] * 3, port[1] * 3, (port[0] + 120) * 3 - 1, (port[1] + 214) * 3 - 1], outline=(30, 60, 220), width=2)
    row([(comp, 'rest composite x3: red = land view, blue = port view')], f'{k}: world')
    alt = art.notes.get('alt', {})
    views = []
    for set_, at, size, s in (('land', land, (240, 135), 3), ('port', port, (120, 214), 4)):
        for p, fr, t in ((0, None, 'p=0 rest'), (1, alt, 'p=1 + alt frames')):
            im = _big(view(art, ww, wh, at, size, p, fr), *size, pal, s)
            if set_ == 'port':
                d = ImageDraw.Draw(im)
                for gx, col in ((15, (30, 160, 30)), (105, (30, 160, 30)), (11.25, (220, 30, 30)), (108.75, (220, 30, 30))):
                    d.line([(gx * s, 0), (gx * s, im.height)], fill=col, width=1)
            views.append((im, f'{set_} {t}'))
    row(views, f'{k}: views (port guides: green = middle 90 px, red = ~97 px a 390 px phone shows)')
    for sp in art.sprites:
        pad = 6
        x0, y0 = max(0, sp.at[0] - pad), max(0, sp.at[1] - pad)
        x1, y1 = min(ww, sp.at[0] + sp.w + pad), min(wh, sp.at[1] + sp.h + pad)
        items = []
        for i in range(len(sp.frames)):
            fr = {s.name: s.rest for s in art.sprites}
            fr[sp.name] = i
            v = view(art, ww, wh, (x0, y0), (x1 - x0, y1 - y0), 0, fr)
            items.append((_big(v, x1 - x0, y1 - y0, pal, 5), f'{sp.name} {i}' + (' rest' if i == sp.rest else '')))
        bare = view(art, ww, wh, (x0, y0), (x1 - x0, y1 - y0), 0, None, skip=(sp.name,))
        items.append((_big(bare, x1 - x0, y1 - y0, pal, 5), 'without it'))
        for j in range(0, len(items), 6):
            row(items[j:j + 6], f'{k}: sprite {sp.name} on its background (x5)')
    W = max(r.width for r in rows)
    out = Image.new('RGB', (W, sum(r.height for r in rows)), paper)
    y = 0
    for r in rows:
        out.paste(r, (0, y)); y += r.height
    return out
