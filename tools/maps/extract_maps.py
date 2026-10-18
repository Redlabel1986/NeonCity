"""
Turns the four district plans in assets/ into map templates for the game.

Each plan is sampled into a 72x72 grid of classes:
  W water, F forest / mountains / not buildable, Z residential zone,
  S shopping zone, B business / special zone, I industrial zone.
Pixels are classified by colour, each cell takes the majority of 36
samples, then a smoothing pass removes specks so cities keep the organic
outlines of the plans (no square cities). Roads are not taken from the
images (they are too thin to sample reliably); the generator lays them
inside the zones.

Output: src/sim/data/mapTemplates.ts (committed; the PNGs stay local).
Run: python -I tools/maps/extract_maps.py
"""

import colorsys
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ROOT, 'src', 'sim', 'data', 'mapTemplates.ts')
N = 72

PLANS = {
    'greenhaven': 'Greenhaven – Das grüne Umland.png',
    'silverbrook': 'Silverbrook Bezirk 2_ Vorstadtkarte.png',
    'neon_central': 'Neon Central – Stadtplan der Zukunft.png',
    'nova_eclipse': 'Nova Eclipse_ Megacity-Baukarte.png',
}


def cls(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h *= 360
    if 185 <= h <= 235 and s > 0.4 and v > 0.12:
        return 'W'
    if v < 0.33 and (h < 60 or h > 170 or s < 0.25):
        return 'F'
    if 75 <= h <= 170 and v < 0.45:
        return 'F'
    if s < 0.18 and v >= 0.45:
        return 'I'
    if 40 <= h < 75 and s >= 0.3:
        return 'Z'
    if 75 <= h <= 170:
        return 'Z'
    if h < 30 or h >= 320:
        return 'S'
    if 215 < h < 320:
        return 'B'
    return 'Z'


def sample(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    cw, ch = W / N, H / N
    grid = []
    for ty in range(N):
        row = []
        for tx in range(N):
            counts = {}
            for sy in range(6):
                for sx in range(6):
                    c = cls(*px[int((tx + (sx + 0.5) / 6) * cw), int((ty + (sy + 0.5) / 6) * ch)])
                    counts[c] = counts.get(c, 0) + 1
            best = max(counts, key=counts.get)
            if counts.get('W', 0) >= 12:
                best = 'W'
            row.append(best)
        grid.append(row)
    return grid


def neighbours(grid, x, y):
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            xx, yy = x + dx, y + dy
            if 0 <= xx < N and 0 <= yy < N:
                out.append(grid[yy][xx])
    return out


def smooth(grid):
    zone = set('ZSBI')
    for _ in range(2):
        nxt = [row[:] for row in grid]
        for y in range(N):
            for x in range(N):
                nb = neighbours(grid, x, y)
                water = nb.count('W')
                zones = sum(1 for c in nb if c in zone)
                c = grid[y][x]
                if c == 'W' and water < 3:
                    nxt[y][x] = 'Z' if zones >= 4 else 'F'
                elif c != 'W' and water >= 6:
                    nxt[y][x] = 'W'
                elif c in zone and zones < 4:
                    nxt[y][x] = 'F'
                elif c == 'F' and zones >= 6:
                    # majority zone class of the neighbourhood
                    counts = {k: nb.count(k) for k in zone}
                    nxt[y][x] = max(counts, key=counts.get)
        grid = nxt
    # labels and legends on the plans sit at the edges: keep a natural frame of forest
    for y in range(N):
        for x in range(N):
            if x < 2 or y < 2 or x >= N - 2 or y >= N - 2:
                if grid[y][x] != 'W':
                    grid[y][x] = 'F'
    return grid


def main():
    lines = ['/**', ' * Map templates sampled from the four district plans (tools/maps/extract_maps.py).', ' * 72x72 cells: W water, F forest / not buildable, Z residential, S shopping, B business, I industry.', ' * Generated file, do not edit by hand.', ' */', '', "import type { RegionId } from './regions';", '', 'export const MAP_TEMPLATE_SIZE = 72;', '', 'export const MAP_TEMPLATES: Record<RegionId, readonly string[]> = {']
    for region, file in PLANS.items():
        grid = smooth(sample(os.path.join(ASSETS, file)))
        counts = {}
        for row in grid:
            for c in row:
                counts[c] = counts.get(c, 0) + 1
        print(region, counts)
        lines.append(f'  {region}: [')
        for row in grid:
            lines.append(f"    '{''.join(row)}',")
        lines.append('  ],')
    lines.append('};')
    lines.append('')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('written', OUT)


if __name__ == '__main__':
    main()
