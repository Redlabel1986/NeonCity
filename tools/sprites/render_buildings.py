"""
Neon Dynasty building sprite renderer.

Renders every building of tools/sprites/buildings.json for the four
facings in the game's own isometric projection (64x32 tiles, 11 px per
floor, buildings inset 0.14 tiles) at 2x resolution, as a day sprite and a
night overlay that holds only what glows (lit windows, signs, lamps) with
everything else erased, so occluded lights never show through.

Facing follows the game: 0 = front towards +x (right wall), 1 = +y (left
wall), 2 = -x and 3 = -y (back sides, the sign then sits on the roof).
Only the two walls that face the viewer (+x, +y) are drawn.

Output: public/sprites/<region>/<slug>/<facing>.png and <facing>_night.png
plus public/sprites/catalog.json with footprint, kind and per-facing
offsets (game units, like the in-game generated textures).

Run: python -I tools/sprites/render_buildings.py   (needs Pillow)
"""

import hashlib
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public', 'sprites')

OUT_SCALE = 2          # output pixels per game pixel
SS = 2                 # supersampling factor
K = OUT_SCALE * SS     # drawing pixels per game pixel
HALF_W, HALF_H, FLOOR_H = 32, 16, 11
INSET = 0.14
CANVAS_W, CANVAS_H = 300 * K, 420 * K
ORIGIN = (CANVAS_W // 2, 300 * K)
ERASE = (0, 0, 0, 0)


def font(size):
    for path in ('C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


FONT = font(9 * K)


def clamp(c):
    return tuple(max(0, min(255, int(round(v)))) for v in c[:3])


def shade(c, f):
    return clamp([v * f for v in c])


def mix(a, b, t):
    return clamp([a[i] * (1 - t) + b[i] * t for i in range(3)])


# ------------------------------------------------------------------ classification

DECOR = ('briefkasten', 'sitzbank', 'zaun', 'fässer', 'palette', 'materialstapel', 'schrott', 'lagerkiste', 'werbetafel', 'straßenbaum', 'skulptur', 'grünfläche', 'gartenhaus', 'hafenmauer', 'gleisstrecke')


def kind_of(name):
    n = name.lower()
    rules = [
        ('wind', ['windrad', 'windkraft']),
        ('solar', ['solaranlage', 'solarturm', 'solarmast']),
        ('crane', ['kran']),
        ('container', ['container']),
        ('ship', ['schiff', 'werft', 'dock', 'hafenstand']),
        ('rocket', ['raumhafen', 'skyport']),
        ('fountain', ['brunnen', 'skulptur']),
        ('park', ['baumgruppe', 'spielplatz', 'kurpark', 'grünfläche', 'straßenbaum']),
        ('parking', ['parkplatz', 'parkhaus']),
        ('greenhouse', ['gewächshaus', 'vertikale farm']),
        ('farm', ['bauernhof', 'industriehof', 'agrar']),
        ('energy', ['energiezentrale', 'kraftwerk', 'ladestation', 'treibstoff', 'tankstelle']),
        ('industrial', ['raffinerie', 'öl', 'chemie', 'industrie', 'produktionshalle', 'müllverbrennung', 'recycling', 'fischverarbeitung', 'schiffbau']),
        ('water', ['wasserturm', 'wasserwerk', 'kläranlage', 'wasserpumpe', 'wasseraufbereitung']),
        ('transit', ['bahnhof', 'u-bahn', 'bushalte', 'busbahnhof', 'flughafen']),
        ('tower', ['hochhaus', 'büroturm', 'fernsehturm', 'finanzdistrikt', 'finanzzentrum', 'hafenverwaltung']),
        ('arena', ['stadion', 'arena', 'sportkomplex']),
        ('civic', ['messe', 'kongress', 'opernhaus', 'polizei', 'feuerwehr', 'feuerwache', 'klinik', 'krankenhaus', 'schule', 'universität', 'hochschule', 'forschung', 'rathaus', 'regierung', 'tierarzt', 'zoll', 'wachhäuschen', 'kultur', 'theater', 'kino', 'medien', 'daten']),
        ('hospitality', ['restaurant', 'imbiss', 'café', 'bäckerei', 'bar', 'hotel', 'gasthof', 'pension', 'food']),
        ('retail', ['laden', 'markt', 'kiosk', 'stand', 'shop', 'einkaufszentrum', 'boutique', 'passage', 'apotheke', 'galerie', 'blumen', 'tourismus', 'fitness', 'coworking']),
        ('warehouse', ['lager', 'logistik', 'werkstatt', 'depot', 'kühl', 'spedition', 'fracht', 'bauhof', 'fahrrad']),
        ('office', ['büro', 'bank', 'konferenz']),
        ('residential', ['haus', 'wohn', 'apartment', 'reihen']),
    ]
    for kind, words in rules:
        if any(w in n for w in words):
            return kind
    if any(w in n for w in DECOR):
        return 'decor'
    return 'mixed'


REGION = {
    'greenhaven': dict(walls=[(232, 214, 178), (214, 176, 128), (238, 230, 214), (196, 142, 98)], roofs=[(156, 72, 52), (128, 62, 46), (110, 92, 70)], trim=(92, 62, 42), glass=(70, 110, 130), lit=(255, 206, 120), neon=(255, 190, 80), ground=(96, 150, 78), floors=(1, 2), gable=True, timber=True),
    'silverbrook': dict(walls=[(222, 222, 214), (206, 186, 160), (182, 196, 206), (230, 212, 190)], roofs=[(84, 92, 106), (150, 84, 66), (70, 76, 86)], trim=(90, 100, 116), glass=(64, 96, 126), lit=(255, 222, 150), neon=(80, 200, 255), ground=(112, 158, 96), floors=(2, 3), gable=True, timber=False),
    'neon_central': dict(walls=[(74, 84, 128), (98, 76, 126), (62, 96, 128), (86, 90, 110)], roofs=[(52, 58, 84), (60, 52, 80)], trim=(140, 160, 210), glass=(30, 44, 80), lit=(120, 230, 255), neon=(255, 60, 200), ground=(62, 66, 80), floors=(3, 7), gable=False, timber=False),
    'nova_eclipse': dict(walls=[(96, 106, 122), (116, 124, 138), (78, 88, 104), (104, 98, 110)], roofs=[(62, 68, 80), (54, 60, 72)], trim=(230, 170, 70), glass=(28, 40, 62), lit=(255, 190, 90), neon=(40, 220, 255), ground=(72, 76, 88), floors=(4, 9), gable=False, timber=False),
}


# ------------------------------------------------------------------ scene

class Scene:
    """Primitives in local model coordinates (u along the front, v depth, z game px)."""

    def __init__(self, W, D, facing):
        self.W, self.D, self.f = W, D, facing
        self.items = []  # (order_key, fn)
        self.seq = 0

    # local -> world tile coordinates
    def world(self, u, v):
        W, D, f = self.W, self.D, self.f
        if f == 1:
            return u, D - v
        if f == 3:
            return W - u, v
        if f == 0:
            return D - v, W - u
        return v, u

    def normal(self, du, dv):
        """World normal of a local horizontal direction."""
        ax, ay = self.world(0, 0)
        bx, by = self.world(du, dv)
        return bx - ax, by - ay

    def visible(self, du, dv):
        nx, ny = self.normal(du, dv)
        return nx > 0.5 or ny > 0.5

    def screen(self, u, v, z):
        x, y = self.world(u, v)
        return (ORIGIN[0] + (x - y) * HALF_W * K, ORIGIN[1] + (x + y) * HALF_H * K - z * K)

    def add(self, key, fn):
        self.seq += 1
        self.items.append(((key, self.seq), fn))

    def depth(self, u, v, z=0):
        x, y = self.world(u, v)
        return x + y + z * 0.001


class Painter:
    def __init__(self):
        self.day = Image.new('RGBA', (CANVAS_W, CANVAS_H), ERASE)
        self.night = Image.new('RGBA', (CANVAS_W, CANVAS_H), ERASE)
        self.dd = ImageDraw.Draw(self.day)
        self.nd = ImageDraw.Draw(self.night)

    def poly(self, pts, day, night=None, outline=None, width=1):
        pts = [(round(x), round(y)) for x, y in pts]
        self.dd.polygon(pts, fill=(*day, 255))
        if outline:
            self.dd.line(pts + [pts[0]], fill=(*outline, 255), width=max(1, width * SS))
        self.nd.polygon(pts, fill=(*night, 255) if night else ERASE)

    def line(self, pts, day, width, night=None):
        pts = [(round(x), round(y)) for x, y in pts]
        self.dd.line(pts, fill=(*day, 255), width=max(1, int(width * K)), joint='curve')
        self.nd.line(pts, fill=(*night, 255) if night else ERASE, width=max(1, int(width * K)), joint='curve')

    def ellipse(self, box, day, night=None):
        box = [round(v) for v in box]
        self.dd.ellipse(box, fill=(*day, 255))
        self.nd.ellipse(box, fill=(*night, 255) if night else ERASE)

    def text(self, xy, txt, day, night=None, fnt=None):
        fnt = fnt or FONT
        self.dd.text(xy, txt, font=fnt, fill=(*day, 255), anchor='mm')
        if night:
            self.nd.text(xy, txt, font=fnt, fill=(*night, 255), anchor='mm')


# ------------------------------------------------------------------ primitives

def box(sc, u0, u1, v0, v1, z0, z1, wall, roof=None, outline=True, light_front=None):
    """Axis-aligned box; draws the two viewer-facing walls and the top."""
    roof = roof or shade(wall, 1.12)

    def draw(p):
        faces = [
            ((u1, v0, u1, v1), (1, 0)),   # right side (local +u)
            ((u0, v0, u0, v1), (-1, 0)),  # left side
            ((u0, v1, u1, v1), (0, 1)),   # back
            ((u0, v0, u1, v0), (0, -1)),  # front
        ]
        for (a_u, a_v, b_u, b_v), n in faces:
            if not sc.visible(*n):
                continue
            nx, ny = sc.normal(*n)
            f = 0.92 if nx > 0.5 else 0.72  # +x walls lit, +y walls in shade
            pts = [sc.screen(a_u, a_v, z0), sc.screen(b_u, b_v, z0), sc.screen(b_u, b_v, z1), sc.screen(a_u, a_v, z1)]
            p.poly(pts, shade(wall, f), outline=shade(wall, 0.5) if outline else None)
        top = [sc.screen(u0, v0, z1), sc.screen(u1, v0, z1), sc.screen(u1, v1, z1), sc.screen(u0, v1, z1)]
        p.poly(top, roof, outline=shade(roof, 0.62) if outline else None)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    sc.add(sc.depth(cu, cv, z0), draw)


def face_quad(sc, face, a0, a1, z0, z1, day, night=None, box_uv=None, inset=0.01):
    """Rectangle on one local face of a box; skipped when that face looks away."""
    u0, u1, v0, v1 = box_uv
    n = {'front': (0, -1), 'back': (0, 1), 'left': (-1, 0), 'right': (1, 0)}[face]
    if not sc.visible(*n):
        return None
    if face == 'front':
        pts = [(u0 + a0, v0 - inset), (u0 + a1, v0 - inset)]
    elif face == 'back':
        pts = [(u0 + a0, v1 + inset), (u0 + a1, v1 + inset)]
    elif face == 'left':
        pts = [(u0 - inset, v0 + a0), (u0 - inset, v0 + a1)]
    else:
        pts = [(u1 + inset, v0 + a0), (u1 + inset, v0 + a1)]
    (pa, pb) = pts
    return [sc.screen(pa[0], pa[1], z0), sc.screen(pb[0], pb[1], z0), sc.screen(pb[0], pb[1], z1), sc.screen(pa[0], pa[1], z1)]


def windows(sc, rng, uv, z0, z1, floor_h, pal, lit_ratio=0.55, cols_per_tile=2.2, style='grid'):
    u0, u1, v0, v1 = uv
    floors = max(1, int((z1 - z0) // floor_h))

    def draw(p):
        for face, length in (('front', u1 - u0), ('back', u1 - u0), ('left', v1 - v0), ('right', v1 - v0)):
            n = max(1, int(round(length * cols_per_tile)))
            for fl in range(floors):
                for c in range(n):
                    a0 = (c + 0.28) * length / n
                    a1 = (c + 0.72) * length / n
                    zz0 = z0 + fl * floor_h + floor_h * 0.28
                    zz1 = z0 + fl * floor_h + floor_h * (0.82 if style == 'tall' else 0.74)
                    q = face_quad(sc, face, a0, a1, zz0, zz1, None, box_uv=uv)
                    if not q:
                        continue
                    lit = rng.random() < lit_ratio
                    glass = pal['glass']
                    day = mix(glass, (200, 225, 240), 0.18 if rng.random() < 0.3 else 0.0)
                    p.poly(q, day, night=shade(pal['lit'], 0.82 + rng.random() * 0.25) if lit else None)
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, z0) + 0.0005, draw)


def gable(sc, uv, z, rise, roof, wall, ridge_along_u=True):
    u0, u1, v0, v1 = uv

    def draw(p):
        if ridge_along_u:
            vm = (v0 + v1) / 2
            slopes = [((u0, v0), (u1, v0), (0, -1)), ((u0, v1), (u1, v1), (0, 1))]
            # draw the slope facing away first
            slopes.sort(key=lambda s: sc.visible(*s[2]))
            for (a, b, n) in slopes:
                f = 1.0 if sc.visible(*n) else 0.78
                pts = [sc.screen(a[0], a[1], z), sc.screen(b[0], b[1], z), sc.screen(b[0], vm, z + rise), sc.screen(a[0], vm, z + rise)]
                p.poly(pts, shade(roof, f), outline=shade(roof, 0.55))
            for uu, n in ((u0, (-1, 0)), (u1, (1, 0))):
                if sc.visible(*n):
                    pts = [sc.screen(uu, v0, z), sc.screen(uu, v1, z), sc.screen(uu, vm, z + rise)]
                    p.poly(pts, shade(wall, 0.86), outline=shade(wall, 0.5))
            p.line([sc.screen(u0, vm, z + rise), sc.screen(u1, vm, z + rise)], shade(roof, 1.35), 0.8)
        else:
            um = (u0 + u1) / 2
            slopes = [((u0, v0), (u0, v1), (-1, 0)), ((u1, v0), (u1, v1), (1, 0))]
            slopes.sort(key=lambda s: sc.visible(*s[2]))
            for (a, b, n) in slopes:
                f = 1.0 if sc.visible(*n) else 0.78
                pts = [sc.screen(a[0], a[1], z), sc.screen(b[0], b[1], z), sc.screen(um, b[1], z + rise), sc.screen(um, a[1], z + rise)]
                p.poly(pts, shade(roof, f), outline=shade(roof, 0.55))
            for vv, n in ((v0, (0, -1)), (v1, (0, 1))):
                if sc.visible(*n):
                    pts = [sc.screen(u0, vv, z), sc.screen(u1, vv, z), sc.screen(um, vv, z + rise)]
                    p.poly(pts, shade(wall, 0.86), outline=shade(wall, 0.5))
            p.line([sc.screen(um, v0, z + rise), sc.screen(um, v1, z + rise)], shade(roof, 1.35), 0.8)
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, z) + 0.002, draw)


def cylinder(sc, u, v, z0, z1, r_tiles, color, top=None, emissive_top=None):
    def draw(p):
        cx, cy0 = sc.screen(u, v, z0)
        _, cy1 = sc.screen(u, v, z1)
        rx = r_tiles * HALF_W * K * 1.4
        ry = rx * 0.5
        p.poly([(cx - rx, cy1), (cx + rx, cy1), (cx + rx, cy0), (cx - rx, cy0)], shade(color, 0.8))
        p.ellipse((cx - rx, cy0 - ry, cx + rx, cy0 + ry), shade(color, 0.8))
        p.poly([(cx, cy1), (cx + rx, cy1), (cx + rx, cy0), (cx, cy0)], shade(color, 0.95))
        p.ellipse((cx - rx, cy1 - ry, cx + rx, cy1 + ry), top or shade(color, 1.15), night=emissive_top)
    sc.add(sc.depth(u, v, z0) + 0.001, draw)


def tree(sc, rng, u, v, size=1.0, tone=(58, 128, 66)):
    def draw(p):
        bx, by = sc.screen(u, v, 0)
        p.line([(bx, by), (bx, by - 6 * K * size)], (96, 66, 44), 1.4 * size)
        for dx, dy, r in ((-2.5, -9, 5.2), (2.8, -10.5, 4.6), (0, -13.5, 4.4)):
            rr = r * K * size
            cx, cy = bx + dx * K * size, by + dy * K * size
            p.ellipse((cx - rr, cy - rr * 0.9, cx + rr, cy + rr * 0.9), shade(tone, rng.uniform(0.85, 1.2)))
    sc.add(sc.depth(u, v, 1) + 0.003, draw)


def sign(sc, uv, z, text, color, prefer='front'):
    """Board with text on the front if the front is visible, else on the roof."""
    u0, u1, v0, v1 = uv
    front_visible = sc.visible(0, -1)

    def draw(p):
        if front_visible:
            cx, cy = sc.screen((u0 + u1) / 2, v0 - 0.02, z)
        else:
            cx, cy = sc.screen((u0 + u1) / 2, (v0 + v1) / 2, z + 8)
            p.line([(cx - 6 * K, cy), (cx - 6 * K, cy + 8 * K)], (90, 90, 100), 1)
            p.line([(cx + 6 * K, cy), (cx + 6 * K, cy + 8 * K)], (90, 90, 100), 1)
        txt = text[:11].upper()
        # Fit the board to the facade: at most 85 % of the front's screen length.
        a = sc.screen(u0, v0, z)
        b2 = sc.screen(u1, v0, z)
        avail = abs(b2[0] - a[0]) * 0.85 + 6 * K
        fnt = FONT
        size = 9 * K
        while size > 4 * K and fnt.getlength(txt) > avail:
            size -= K // 2 or 1
            fnt = font(size)
        tw = fnt.getlength(txt)
        w2, h2 = tw / 2 + 3 * K, max(3.5 * K, size * 0.68)
        p.poly([(cx - w2, cy - h2), (cx + w2, cy - h2), (cx + w2, cy + h2), (cx - w2, cy + h2)], (24, 26, 36), night=(24, 26, 36), outline=color, width=1)
        p.text((cx, cy), txt, mix(color, (255, 255, 255), 0.25), night=mix(color, (255, 255, 255), 0.55), fnt=fnt)
    sc.add(sc.depth((u0 + u1) / 2, v0, z) + 0.01 if front_visible else 1000, draw)


def door(sc, uv, z_floor, color=(70, 52, 40), lit=None):
    u0, u1, v0, v1 = uv
    mid = (u1 - u0) / 2

    def draw(p):
        q = face_quad(sc, 'front', mid - 0.09, mid + 0.09, z_floor, z_floor + 8, None, box_uv=uv)
        if q:
            p.poly(q, color, night=lit)
    sc.add(sc.depth((u0 + u1) / 2, v0, 0) + 0.0006, draw)


def shopfront(sc, uv, color, awning=None):
    u0, u1, v0, v1 = uv

    def draw(p):
        q = face_quad(sc, 'front', 0.08, (u1 - u0) - 0.08, 1.5, FLOOR_H - 1.5, None, box_uv=uv)
        if q:
            p.poly(q, (120, 170, 190), night=mix(color, (255, 240, 200), 0.5))
        if awning:
            for i in range(6):
                a0 = (u1 - u0) * i / 6
                a1 = (u1 - u0) * (i + 1) / 6
                pts = [sc.screen(u0 + a0, v0, FLOOR_H + 1), sc.screen(u0 + a1, v0, FLOOR_H + 1), sc.screen(u0 + a1, v0 - 0.16, FLOOR_H - 3), sc.screen(u0 + a0, v0 - 0.16, FLOOR_H - 3)]
                if sc.visible(0, -1):
                    p.poly(pts, awning if i % 2 == 0 else (236, 232, 222))
    sc.add(sc.depth((u0 + u1) / 2, v0, 0) + 0.0007, draw)


def timber(sc, uv, z0, z1, color):
    u0, u1, v0, v1 = uv

    def draw(p):
        for face, length in (('front', u1 - u0), ('back', u1 - u0), ('left', v1 - v0), ('right', v1 - v0)):
            for k in range(int(length * 3) + 1):
                a = length * k / max(1, int(length * 3))
                q = face_quad(sc, face, max(0, a - 0.012), min(length, a + 0.012), z0, z1, None, box_uv=uv)
                if q:
                    p.poly(q, color)
            q = face_quad(sc, face, 0, length, z0 + (z1 - z0) * 0.5 - 0.6, z0 + (z1 - z0) * 0.5 + 0.6, None, box_uv=uv)
            if q:
                p.poly(q, color)
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, z0) + 0.0004, draw)


def plate(sc, W, D, color, inset=0.04):
    def draw(p):
        pts = [sc.screen(inset, inset, 0), sc.screen(W - inset, inset, 0), sc.screen(W - inset, D - inset, 0), sc.screen(inset, D - inset, 0)]
        p.poly(pts, color, outline=shade(color, 0.7))
    sc.add(-1, draw)


def lamp(sc, u, v, color):
    def draw(p):
        x, y = sc.screen(u, v, 0)
        p.line([(x, y), (x, y - 15 * K)], (110, 110, 124), 1.1)
        p.ellipse((x - 2.2 * K, y - 17 * K, x + 2.2 * K, y - 13 * K), shade(color, 0.7), night=color)
    sc.add(sc.depth(u, v, 0) + 0.004, draw)


# ------------------------------------------------------------------ building models

def build(sc, b, rng):
    region = b['region']
    pal = REGION[region]
    W, D = sc.W, sc.D
    kind = b['kind']
    name = b['name']
    wall = rng.choice(pal['walls'])
    roofc = rng.choice(pal['roofs'])
    big = max(W, D)
    lo, hi = pal['floors']
    floors = rng.randint(lo, hi) + (1 if big >= 3 else 0)
    uv = (INSET, W - INSET, INSET, D - INSET)
    skip = {'kleine', 'kleiner', 'kleines', 'große', 'großer', 'großes', 'regionaler', 'regionale', 'zentraler'}
    words = [w for w in name.replace('(', ' ').replace(')', ' ').replace('/', ' ').split() if w.lower() not in skip]
    word = (words[0] if words else name).rstrip('-')

    def body(fl, wall_c=wall, gable_ok=True, sign_text=word, glow=True, awning=None):
        h = fl * FLOOR_H + 3
        box(sc, *uv, 0, h, wall_c, roofc if not pal['gable'] else shade(wall_c, 1.05))
        if pal['timber'] and gable_ok:
            timber(sc, uv, 0, h, pal['trim'])
        windows(sc, rng, uv, 0, h, FLOOR_H, pal, lit_ratio=0.6 if glow else 0.3)
        door(sc, uv, 0, lit=shade(pal['lit'], 0.8))
        if pal['gable'] and gable_ok:
            gable(sc, uv, h, 7 + 3 * min(W, D), roofc, wall_c, ridge_along_u=(W >= D))
            cylinder(sc, uv[0] + (uv[1] - uv[0]) * 0.75, (uv[2] + uv[3]) / 2, h, h + 9 + 3 * min(W, D), 0.05, (120, 80, 64))
        else:
            # parapet and rooftop units
            box(sc, uv[0] + 0.15, uv[0] + 0.45, uv[2] + 0.15, uv[2] + 0.4, h, h + 4, (96, 104, 116))
        if sign_text:
            sign(sc, uv, FLOOR_H + 4, sign_text, pal['neon'])
        if awning:
            shopfront(sc, uv, pal['lit'], awning)
        return h

    # ground plate for open, green or industrial lots
    if kind in ('park', 'fountain', 'farm', 'greenhouse', 'parking', 'solar', 'wind', 'water', 'energy') or (region in ('greenhaven', 'silverbrook') and kind in ('residential', 'hospitality', 'retail')):
        plate(sc, W, D, pal['ground'] if region in ('greenhaven', 'silverbrook') or kind in ('park', 'fountain') else (82, 86, 96))

    if kind == 'residential':
        h = body(max(1, floors), sign_text=None)
        if region in ('greenhaven', 'silverbrook'):
            tree(sc, rng, W - 0.12, D - 0.12, 0.8)
            if W >= 2:
                tree(sc, rng, 0.12, D - 0.15, 0.7)
        else:
            lamp(sc, 0.08, 0.08, pal['lit'])
    elif kind in ('hospitality', 'retail', 'mixed'):
        awning = rng.choice([(192, 52, 52), (40, 120, 150), (210, 140, 40), (120, 70, 150)])
        body(max(1, floors - (1 if region in ('greenhaven', 'silverbrook') else 0)), awning=awning)
        lamp(sc, 0.08, 0.06, pal['lit'])
        if region in ('neon_central', 'nova_eclipse'):
            vertical_neon(sc, uv, floors, pal['neon'])
    elif kind == 'office':
        h = body(floors + 1, gable_ok=False, sign_text=word)
        light_strips(sc, uv, h, pal)
    elif kind == 'tower':
        fl = (floors + 4) * (2 if region == 'nova_eclipse' else 1.5)
        h = int(fl) * FLOOR_H
        box(sc, *uv, 0, h, wall, roofc)
        windows(sc, rng, uv, 0, h, FLOOR_H, pal, lit_ratio=0.5, cols_per_tile=2.6, style='tall')
        light_strips(sc, uv, h, pal)
        crown = (uv[0] + 0.18, uv[1] - 0.18, uv[2] + 0.18, uv[3] - 0.18)
        box(sc, *crown, h, h + 12, shade(wall, 1.1), roofc)
        cylinder(sc, (uv[0] + uv[1]) / 2, (uv[2] + uv[3]) / 2, h + 12, h + 40, 0.02, (170, 176, 186), top=(255, 60, 80), emissive_top=(255, 70, 90))
        sign(sc, uv, h - 8, word, pal['neon'])
    elif kind == 'civic':
        n = name.lower()
        accent = (60, 110, 220) if 'polizei' in n else (200, 50, 46) if 'feuer' in n else (230, 70, 70) if ('klinik' in n or 'kranken' in n) else pal['neon']
        h = body(max(2, floors), gable_ok=region == 'greenhaven' and big <= 2, sign_text=word)
        band(sc, uv, FLOOR_H + 0.5, accent)
        flag(sc, uv[0] + 0.05, uv[2] + 0.05, h, accent)
    elif kind == 'warehouse':
        h = 2 * FLOOR_H + 4
        box(sc, *uv, 0, h, shade(wall, 0.9), (110, 116, 126))
        roller_doors(sc, uv, pal)
        skylights(sc, uv, h)
        sign(sc, uv, h - 6, word, pal['neon'])
        lamp(sc, 0.06, 0.06, pal['lit'])
    elif kind in ('industrial', 'energy'):
        h = 2 * FLOOR_H + 6
        hall = (INSET, W * 0.68, INSET, D - INSET)
        box(sc, *hall, 0, h, (118, 126, 138), (96, 102, 112))
        windows(sc, rng, hall, 0, h, FLOOR_H + 3, pal, lit_ratio=0.4, cols_per_tile=1.5)
        roller_doors(sc, hall, pal)
        for i in range(max(1, int(D * 1.2))):
            cylinder(sc, W * 0.84, INSET + 0.3 + i * 0.7, 0, 24 + 6 * i, 0.16, (190, 170, 120) if kind == 'industrial' else (150, 160, 176))
        for i in range(max(1, int(W))):
            cylinder(sc, INSET + 0.25 + i * 0.5, (hall[2] + hall[3]) / 2, h, h + 22 + 6 * (i % 2), 0.05, (150, 90, 70), top=(80, 80, 86))
        if kind == 'energy':
            for i in range(int(W * D)):
                lamp(sc, rng.uniform(0.2, W - 0.2), D - 0.12, (120, 230, 255))
    elif kind in ('farm', 'greenhouse'):
        barn = (INSET, max(INSET + 0.7, W * 0.6), INSET, max(INSET + 0.7, D * 0.6))
        if kind == 'greenhouse':
            box(sc, INSET, W - INSET, INSET, D - INSET, 0, FLOOR_H * 1.4, (150, 210, 200), (186, 230, 222))
            ribs(sc, (INSET, W - INSET, INSET, D - INSET), FLOOR_H * 1.4)
        else:
            box(sc, *barn, 0, FLOOR_H * 1.5, (170, 66, 50), (150, 60, 46))
            gable(sc, barn, FLOOR_H * 1.5, 10, (110, 60, 44), (170, 66, 50))
            cylinder(sc, min(W - 0.3, barn[1] + 0.3), INSET + 0.3, 0, 34, 0.2, (196, 196, 200), top=(150, 90, 70))
            crops(sc, (barn[1] + 0.05, W - 0.05, 0.08, D - 0.08))
            crops(sc, (0.08, barn[1], barn[3] + 0.08, D - 0.08))
    elif kind == 'wind':
        for (u, v) in ([(W / 2, D / 2)] if W * D < 4 else [(W * 0.3, D * 0.3), (W * 0.7, D * 0.7)]):
            wind_turbine(sc, u, v)
    elif kind == 'solar':
        solar(sc, W, D)
    elif kind == 'crane':
        crane(sc, W, D, rng)
    elif kind == 'container':
        container_stack(sc, W, D, rng)
    elif kind == 'ship':
        ship(sc, W, D)
    elif kind == 'rocket':
        rocket(sc, W, D)
    elif kind == 'fountain':
        fountain(sc, W, D)
    elif kind == 'park':
        for _ in range(max(3, int(W * D * 2.5))):
            tree(sc, rng, rng.uniform(0.2, W - 0.2), rng.uniform(0.2, D - 0.2), rng.uniform(0.7, 1.1))
        lamp(sc, W / 2, 0.1, pal['lit'])
    elif kind == 'parking':
        parking(sc, W, D, rng, pal)
    elif kind == 'water':
        if W * D <= 2:
            cylinder(sc, W / 2, D / 2, 0, 30, 0.08, (150, 160, 170))
            cylinder(sc, W / 2, D / 2, 30, 44, 0.3, (90, 160, 190))
        else:
            for i in range(int(min(W, D))):
                basin(sc, INSET + 0.5 + i * 0.95, D / 2)
            box(sc, INSET, INSET + 0.6, INSET, INSET + 0.6, 0, FLOOR_H * 2, (190, 196, 200))
    elif kind == 'transit':
        h = FLOOR_H * 1.6
        hall = (INSET, W - INSET, INSET, D * 0.55)
        box(sc, *hall, 0, h, (170, 176, 186), (120, 130, 146))
        windows(sc, rng, hall, 0, h, FLOOR_H, pal, lit_ratio=0.7)
        sign(sc, hall, h - 4, word, pal['neon'])
        rails(sc, W, D)
    elif kind == 'arena':
        arena(sc, W, D, pal)
    elif kind == 'decor':
        for i in range(max(2, int(W * D * 3))):
            u = rng.uniform(0.2, W - 0.3)
            v = rng.uniform(0.2, D - 0.3)
            box(sc, u, u + 0.2, v, v + 0.16, 0, 5, rng.choice([(150, 110, 70), (90, 110, 140), (180, 70, 60), (120, 124, 130)]))
    else:
        body(floors)


# ---- detail helpers used by the models

def vertical_neon(sc, uv, floors, color):
    u0, u1, v0, v1 = uv

    def draw(p):
        if not sc.visible(0, -1):
            return
        x, y0 = sc.screen(u0 + 0.06, v0 - 0.05, FLOOR_H * 1.2)
        _, y1 = sc.screen(u0 + 0.06, v0 - 0.05, FLOOR_H * min(floors, 4))
        p.poly([(x - 3 * K, y1), (x + 3 * K, y1), (x + 3 * K, y0), (x - 3 * K, y0)], (24, 26, 36), night=(24, 26, 36), outline=color)
        for i in range(int((y0 - y1) / (7 * K))):
            yy = y1 + 3 * K + i * 7 * K
            p.poly([(x - 1.6 * K, yy), (x + 1.6 * K, yy), (x + 1.6 * K, yy + 3.5 * K), (x - 1.6 * K, yy + 3.5 * K)], shade(color, 0.85), night=mix(color, (255, 255, 255), 0.4))
    sc.add(sc.depth(u0, v0, 0) + 0.02, draw)


def light_strips(sc, uv, h, pal):
    u0, u1, v0, v1 = uv

    def draw(p):
        for face, length in (('front', u1 - u0), ('right', v1 - v0), ('left', v1 - v0), ('back', u1 - u0)):
            q = face_quad(sc, face, 0.02, 0.06, 4, h - 2, None, box_uv=uv)
            if q:
                p.poly(q, shade(pal['neon'], 0.6), night=pal['neon'])
            q = face_quad(sc, face, 0, length, h - 3, h - 1.6, None, box_uv=uv)
            if q:
                p.poly(q, shade(pal['trim'], 0.9), night=pal['neon'])
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, 0) + 0.0008, draw)


def band(sc, uv, z, color):
    u0, u1, v0, v1 = uv

    def draw(p):
        for face, length in (('front', u1 - u0), ('right', v1 - v0), ('left', v1 - v0), ('back', u1 - u0)):
            q = face_quad(sc, face, 0, length, z, z + 2.2, None, box_uv=uv)
            if q:
                p.poly(q, color, night=shade(color, 1.1))
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, 0) + 0.0009, draw)


def flag(sc, u, v, h, color):
    def draw(p):
        x, y = sc.screen(u, v, h)
        p.line([(x, y), (x, y - 16 * K)], (200, 200, 210), 0.8)
        p.poly([(x, y - 16 * K), (x + 8 * K, y - 14 * K), (x, y - 11 * K)], color)
    sc.add(sc.depth(u, v, h) + 0.02, draw)


def roller_doors(sc, uv, pal):
    u0, u1, v0, v1 = uv

    def draw(p):
        length = u1 - u0
        n = max(1, int(length * 1.5))
        for i in range(n):
            a0 = (i + 0.2) * length / n
            a1 = (i + 0.8) * length / n
            q = face_quad(sc, 'front', a0, a1, 0, FLOOR_H * 1.1, None, box_uv=uv)
            if q:
                p.poly(q, (70, 78, 88), outline=(50, 56, 64))
            q = face_quad(sc, 'front', a0, a1, FLOOR_H * 1.15, FLOOR_H * 1.3, None, box_uv=uv)
            if q:
                p.poly(q, (230, 170, 60), night=(255, 200, 90))
    sc.add(sc.depth((u0 + u1) / 2, v0, 0) + 0.0008, draw)


def skylights(sc, uv, h):
    u0, u1, v0, v1 = uv

    def draw(p):
        for i in range(max(1, int((u1 - u0) * 2))):
            a = u0 + 0.15 + i * 0.5
            if a + 0.25 > u1:
                break
            pts = [sc.screen(a, v0 + 0.15, h), sc.screen(a + 0.25, v0 + 0.15, h), sc.screen(a + 0.25, v1 - 0.15, h), sc.screen(a, v1 - 0.15, h)]
            p.poly(pts, (150, 190, 210), night=(200, 220, 160))
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, h) + 0.002, draw)


def ribs(sc, uv, h):
    u0, u1, v0, v1 = uv

    def draw(p):
        for i in range(int((u1 - u0) * 4) + 1):
            a = u0 + i * 0.25
            p.line([sc.screen(a, v0, h), sc.screen(a, v1, h)], (230, 245, 240), 0.6)
    sc.add(sc.depth((u0 + u1) / 2, (v0 + v1) / 2, h) + 0.002, draw)


def crops(sc, area):
    u0, u1, v0, v1 = area
    if u1 - u0 < 0.2 or v1 - v0 < 0.2:
        return

    def draw(p):
        pts = [sc.screen(u0, v0, 0.2), sc.screen(u1, v0, 0.2), sc.screen(u1, v1, 0.2), sc.screen(u0, v1, 0.2)]
        p.poly(pts, (120, 96, 56))
        n = int((u1 - u0) * 6)
        for i in range(n):
            a = u0 + (i + 0.5) * (u1 - u0) / n
            p.line([sc.screen(a, v0 + 0.04, 0.4), sc.screen(a, v1 - 0.04, 0.4)], (120, 180, 70), 1.4)
    sc.add(-0.5, draw)


def wind_turbine(sc, u, v):
    def draw(p):
        x, y = sc.screen(u, v, 0)
        top = y - 70 * K
        p.poly([(x - 1.6 * K, y), (x + 1.6 * K, y), (x + 0.8 * K, top), (x - 0.8 * K, top)], (232, 236, 240))
        for a in (0.3, 2.394, 4.488):
            p.line([(x, top), (x + math.cos(a) * 28 * K, top + math.sin(a) * 28 * K)], (240, 242, 246), 1.6)
        p.ellipse((x - 2.2 * K, top - 2.2 * K, x + 2.2 * K, top + 2.2 * K), (220, 120, 60), night=(255, 60, 70))
    sc.add(sc.depth(u, v, 0) + 0.01, draw)


def solar(sc, W, D):
    def draw(p):
        for i in range(max(1, int(W * 2))):
            for j in range(max(1, int(D * 2))):
                u = 0.1 + i * 0.5
                v = 0.1 + j * 0.5
                if u + 0.4 > W or v + 0.36 > D:
                    continue
                pts = [sc.screen(u, v, 6), sc.screen(u + 0.4, v, 6), sc.screen(u + 0.4, v + 0.36, 2), sc.screen(u, v + 0.36, 2)]
                p.poly(pts, (36, 64, 112), outline=(120, 170, 220))
    sc.add(0, draw)


def crane(sc, W, D, rng):
    container_stack(sc, W, D, rng, area=(0.1, W - 0.1, D * 0.5, D - 0.1))
    u, v = W * 0.3, D * 0.3
    box(sc, u - 0.08, u + 0.08, v - 0.08, v + 0.08, 0, 70, (226, 150, 50))

    def draw(p):
        p.line([sc.screen(u, v, 70), sc.screen(min(W - 0.1, u + W * 0.7), min(D - 0.1, v + D * 0.5), 70)], (240, 172, 56), 2.2)
        p.line([sc.screen(u, v, 76), sc.screen(min(W - 0.1, u + W * 0.7), min(D - 0.1, v + D * 0.5), 70)], (240, 172, 56), 0.8)
        x, y = sc.screen(u, v, 78)
        p.ellipse((x - 2 * K, y - 2 * K, x + 2 * K, y + 2 * K), (200, 60, 60), night=(255, 60, 70))
    sc.add(100, draw)


def container_stack(sc, W, D, rng, area=None):
    u0, u1, v0, v1 = area or (0.1, W - 0.1, 0.1, D - 0.1)
    colors = [(190, 70, 50), (50, 110, 170), (220, 160, 60), (70, 140, 90), (150, 150, 160)]
    u = u0
    while u + 0.55 <= u1 + 0.001:
        v = v0
        while v + 0.25 <= v1 + 0.001:
            levels = rng.randint(1, 3)
            for l in range(levels):
                box(sc, u, u + 0.55, v, v + 0.25, l * 7, l * 7 + 7, rng.choice(colors))
            v += 0.3
        u += 0.6


def ship(sc, W, D):
    def draw(p):
        pts = [sc.screen(0.15, D * 0.3, 2), sc.screen(W * 0.8, D * 0.3, 2), sc.screen(W - 0.1, D * 0.5, 2), sc.screen(W * 0.8, D * 0.7, 2), sc.screen(0.15, D * 0.7, 2)]
        p.poly(pts, (50, 86, 120), outline=(30, 50, 70))
    sc.add(0, draw)
    box(sc, W * 0.15, W * 0.4, D * 0.36, D * 0.64, 2, 24, (210, 214, 220))
    box(sc, W * 0.45, W * 0.75, D * 0.36, D * 0.64, 2, 9, (190, 70, 50))


def rocket(sc, W, D):
    u, v = W / 2, D / 2
    box(sc, u - 0.6, u + 0.6, v - 0.6, v + 0.6, 0, 6, (120, 126, 140))
    cylinder(sc, u, v, 6, 90, 0.12, (226, 230, 236), top=(230, 120, 70))
    box(sc, u + 0.25, u + 0.4, v - 0.1, v + 0.1, 6, 80, (150, 156, 170))


def fountain(sc, W, D):
    cylinder(sc, W / 2, D / 2, 0, 3, 0.32, (160, 176, 186), top=(80, 170, 220), emissive_top=(90, 200, 255))
    cylinder(sc, W / 2, D / 2, 3, 11, 0.04, (200, 206, 212))


def parking(sc, W, D, rng, pal):
    def draw(p):
        for i in range(int(W * 3)):
            a = 0.1 + i * 0.33
            p.line([sc.screen(a, 0.1, 0.3), sc.screen(a, D * 0.42, 0.3)], (230, 230, 210), 0.5)
    sc.add(-0.5, draw)
    for i in range(int(W * 3) - 1):
        if rng.random() < 0.7:
            u = 0.15 + i * 0.33
            box(sc, u, u + 0.22, 0.12, 0.36, 0.5, 4.5, rng.choice([(180, 60, 70), (60, 100, 150), (190, 194, 200), (40, 40, 48)]))
    lamp(sc, W - 0.1, D - 0.1, pal['lit'])


def basin(sc, u, v):
    cylinder(sc, u, v, 0, 4, 0.38, (150, 156, 164), top=(70, 140, 170))


def rails(sc, W, D):
    def draw(p):
        for off in (0.72, 0.86):
            p.line([sc.screen(0.05, D * off, 0.3), sc.screen(W - 0.05, D * off, 0.3)], (80, 84, 92), 1.2)
    sc.add(-0.4, draw)


def arena(sc, W, D, pal):
    u0, u1, v0, v1 = INSET, W - INSET, INSET, D - INSET
    box(sc, u0, u1, v0, v1, 0, FLOOR_H * 2.4, (150, 156, 170), (80, 150, 90))

    def draw(p):
        pts = [sc.screen(u0 + 0.4, v0 + 0.4, FLOOR_H * 2.4 + 0.2), sc.screen(u1 - 0.4, v0 + 0.4, FLOOR_H * 2.4 + 0.2), sc.screen(u1 - 0.4, v1 - 0.4, FLOOR_H * 2.4 + 0.2), sc.screen(u0 + 0.4, v1 - 0.4, FLOOR_H * 2.4 + 0.2)]
        p.poly(pts, (90, 170, 100), outline=(240, 240, 240))
    sc.add(sc.depth(W / 2, D / 2, FLOOR_H * 2.4) + 0.01, draw)
    light_strips(sc, (u0, u1, v0, v1), FLOOR_H * 2.4, pal)
    for (u, v) in ((u0, v0), (u1, v0), (u0, v1), (u1, v1)):
        lamp(sc, u, v, (240, 240, 255))


# ------------------------------------------------------------------ render

def footprint_for(b, facing):
    """World extents for a facing: the front runs along the catalog width."""
    if facing in (1, 3):
        return b['w'], b['h']
    return b['h'], b['w']


def render(b, facing):
    seed = int(hashlib.md5(b['id'].encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    sc = Scene(b['w'], b['h'], facing)
    build(sc, b, rng)
    painter = Painter()
    for _, fn in sorted(sc.items, key=lambda it: it[0]):
        fn(painter)
    bbox = painter.day.getbbox()
    nb = painter.night.getbbox()
    if nb:
        bbox = (min(bbox[0], nb[0]), min(bbox[1], nb[1]), max(bbox[2], nb[2]), max(bbox[3], nb[3]))
    # align the crop to the supersampling grid so the offset stays exact
    l, t, r, btm = bbox
    l -= l % SS
    t -= t % SS
    r += (SS - r % SS) % SS
    btm += (SS - btm % SS) % SS
    day = painter.day.crop((l, t, r, btm))
    night = painter.night.crop((l, t, r, btm))
    size = ((r - l) // SS, (btm - t) // SS)
    day = day.resize(size, Image.LANCZOS)
    night = night.resize(size, Image.LANCZOS)
    has_night = night.getbbox() is not None
    ox = (l - ORIGIN[0]) / K
    oy = (t - ORIGIN[1]) / K
    return day, (night if has_night else None), ox, oy, size


def slug_of(bid):
    return bid.split('.', 1)[1]


def main():
    src = json.load(open(os.path.join(HERE, 'buildings.json'), encoding='utf-8'))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    catalog = []
    for i, b in enumerate(src['buildings']):
        if only and not b['id'].startswith(only):
            continue
        b = dict(b)
        b['kind'] = kind_of(b['name'])
        folder = os.path.join(OUT, b['region'], slug_of(b['id']))
        os.makedirs(folder, exist_ok=True)
        entry = {'id': b['id'], 'region': b['region'], 'name': b['name'], 'kind': b['kind'], 'w': b['w'], 'h': b['h'], 'decor': b['kind'] == 'decor' or any(w in b['name'].lower() for w in DECOR), 'facings': {}}
        for facing in range(4):
            day, night, ox, oy, size = render(b, facing)
            day.save(os.path.join(folder, f'{facing}.png'), optimize=True)
            if night is not None:
                night.save(os.path.join(folder, f'{facing}_night.png'), optimize=True)
            fw, fh = footprint_for(b, facing)
            entry['facings'][str(facing)] = {'day': f'{b["region"]}/{slug_of(b["id"])}/{facing}.png', 'night': f'{b["region"]}/{slug_of(b["id"])}/{facing}_night.png' if night is not None else None, 'ox': ox, 'oy': oy, 'width': size[0] / OUT_SCALE, 'height': size[1] / OUT_SCALE, 'w': fw, 'h': fh}
        catalog.append(entry)
        if (i + 1) % 20 == 0:
            print(i + 1, flush=True)
    if not only:
        with open(os.path.join(OUT, 'catalog.json'), 'w', encoding='utf-8') as f:
            json.dump({'version': 1, 'scale': OUT_SCALE, 'buildings': catalog}, f, ensure_ascii=False, separators=(',', ':'))
    print('done', len(catalog))


if __name__ == '__main__':
    main()
