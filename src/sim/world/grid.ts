/**
 * Tile grid of the city. Uses typed arrays at runtime for cache friendly
 * iteration and O(1) spatial lookup; serializes to plain arrays.
 */

export const TileKind = {
  Road: 0,
  Lot: 1, // empty, buildable plot
  Building: 2, // occupied by a building (player or city)
  Park: 3,
  Water: 4,
  Blocked: 5, // not buildable (infrastructure, rail, etc.)
} as const;
export type TileKind = (typeof TileKind)[keyof typeof TileKind];

/** Bit flags for road connectivity: which neighbours are also roads. */
export const RoadDir = { N: 1, E: 2, S: 4, W: 8 } as const;

export interface GridJSON {
  width: number;
  height: number;
  kind: number[];
  district: number[];
  variant: number[];
  occupant: number[];
}

export class CityGrid {
  readonly width: number;
  readonly height: number;
  readonly kind: Uint8Array;
  readonly district: Uint8Array;
  /** Visual variant / sub-type per tile (e.g. road mask, park flavour). */
  readonly variant: Uint8Array;
  /** Building id occupying the tile, 0 when empty. */
  readonly occupant: Int32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.kind = new Uint8Array(n).fill(TileKind.Lot);
    this.district = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.occupant = new Int32Array(n);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  kindAt(x: number, y: number): TileKind {
    return this.kind[this.index(x, y)] as TileKind;
  }

  districtAt(x: number, y: number): number {
    return this.district[this.index(x, y)]!;
  }

  occupantAt(x: number, y: number): number {
    return this.occupant[this.index(x, y)]!;
  }

  isRoad(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.kind[this.index(x, y)] === TileKind.Road;
  }

  /** True when the footprint edge given by `facing` (0 = +x, 1 = +y, 2 = -x, 3 = -y) borders at least one road tile. */
  edgeTouchesRoad(x: number, y: number, w: number, h: number, facing: 0 | 1 | 2 | 3): boolean {
    if (facing === 0 || facing === 2) {
      const tx = facing === 0 ? x + w : x - 1;
      for (let dy = 0; dy < h; dy++) if (this.isRoad(tx, y + dy)) return true;
      return false;
    }
    const ty = facing === 1 ? y + h : y - 1;
    for (let dx = 0; dx < w; dx++) if (this.isRoad(x + dx, ty)) return true;
    return false;
  }

  /** First facing whose edge borders a road, preferring the two edges visible on screen; null without road access. */
  pickFacing(x: number, y: number, w: number, h: number): 0 | 1 | 2 | 3 | null {
    for (const f of [0, 1, 2, 3] as const) if (this.edgeTouchesRoad(x, y, w, h, f)) return f;
    return null;
  }

  /** Recomputes road connection masks into `variant` for all road tiles. */
  recomputeRoadMasks(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        if (this.kind[i] !== TileKind.Road) continue;
        let mask = 0;
        if (this.isRoad(x, y - 1)) mask |= RoadDir.N;
        if (this.isRoad(x + 1, y)) mask |= RoadDir.E;
        if (this.isRoad(x, y + 1)) mask |= RoadDir.S;
        if (this.isRoad(x - 1, y)) mask |= RoadDir.W;
        this.variant[i] = mask;
      }
    }
  }

  /** True when any tile of the footprint touches a road tile (4-neighbourhood). */
  footprintTouchesRoad(x: number, y: number, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (this.isRoad(tx, ty - 1) || this.isRoad(tx + 1, ty) || this.isRoad(tx, ty + 1) || this.isRoad(tx - 1, ty)) {
          return true;
        }
      }
    }
    return false;
  }

  toJSON(): GridJSON {
    return {
      width: this.width,
      height: this.height,
      kind: Array.from(this.kind),
      district: Array.from(this.district),
      variant: Array.from(this.variant),
      occupant: Array.from(this.occupant),
    };
  }

  static fromJSON(json: GridJSON): CityGrid {
    const g = new CityGrid(json.width, json.height);
    g.kind.set(json.kind);
    g.district.set(json.district);
    g.variant.set(json.variant);
    g.occupant.set(json.occupant);
    return g;
  }
}
