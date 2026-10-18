/**
 * Audio with the Web Audio API. Ambience is filtered noise and detuned
 * oscillators, UI sounds are short envelopes. Music: one track per region
 * (public/music, crossfaded when the camera crosses into another region);
 * the generative pad plays underneath while a track loads or when it fails.
 * Audio starts only after a user gesture and every category has its own
 * volume.
 */

/** Music track per region; Neon Central and Nova Eclipse share the city track. */
export const REGION_TRACKS: Record<string, string> = {
  greenhaven: 'music/greenhaven.mp3',
  silverbrook: 'music/silverbrook.mp3',
  neon_central: 'music/city.mp3',
  nova_eclipse: 'music/city.mp3',
};

export interface AudioSettings {
  master: number;
  ambient: number;
  ui: number;
  music: number;
}

type Weather = 'clear' | 'rain' | 'fog' | 'storm';

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private musicOsc: OscillatorNode[] = [];
  private musicFilter: BiquadFilterNode | null = null;
  private settings: AudioSettings = { master: 0.6, ambient: 0.7, ui: 0.6, music: 0.4 };
  private weather: Weather = 'clear';
  private night = 0;
  private traffic = 0.5;
  private started = false;

  /** Call from a user gesture. Safe to call repeatedly. */
  start(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.started = true;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.ambientGain = ctx.createGain();
    this.uiGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.ambientGain.connect(this.master);
    this.uiGain.connect(this.master);
    this.musicGain.connect(this.master);
    this.buildAmbience(ctx);
    this.buildMusic(ctx);
    this.applyVolumes();
    void ctx.resume();
  }

  get isRunning(): boolean {
    return this.started && this.ctx?.state === 'running';
  }

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(this.settings.master, t, 0.05);
    this.ambientGain?.gain.setTargetAtTime(this.settings.ambient, t, 0.05);
    this.uiGain?.gain.setTargetAtTime(this.settings.ui, t, 0.05);
    this.musicGain?.gain.setTargetAtTime(this.settings.music, t, 0.05);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.98 * last + 0.02 * white; // brownish
      data[i] = (white * 0.3 + last * 3) * 0.5;
    }
    return buffer;
  }

  private buildAmbience(ctx: AudioContext): void {
    // Rain: noise through a band-pass, gain follows weather.
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuffer(ctx);
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 2200;
    rainFilter.Q.value = 0.6;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(this.rainGain).connect(this.ambientGain!);
    rain.start();
    // City hum: low noise + two low oscillators.
    const hum = ctx.createBufferSource();
    hum.buffer = this.noiseBuffer(ctx);
    hum.loop = true;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 320;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.12;
    hum.connect(humFilter).connect(this.humGain).connect(this.ambientGain!);
    hum.start();
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 140;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    drone.connect(droneFilter).connect(droneGain).connect(this.ambientGain!);
    drone.start();
  }

  private buildMusic(ctx: AudioContext): void {
    // Slow generative pad: three detuned oscillators through a moving low-pass.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 600;
    this.musicFilter.Q.value = 2;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.08;
    this.padGain = padGain;
    this.musicFilter.connect(padGain).connect(this.musicGain!);
    const base = 110; // A2
    for (const ratio of [1, 1.498, 2.0, 1.189]) {
      const osc = ctx.createOscillator();
      osc.type = ratio === 1 ? 'triangle' : 'sine';
      osc.frequency.value = base * ratio;
      osc.detune.value = (Math.random() - 0.5) * 12;
      osc.connect(this.musicFilter);
      osc.start();
      this.musicOsc.push(osc);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain).connect(this.musicFilter.frequency);
    lfo.start();
    // Chord drift every ~20 s.
    const chords = [
      [1, 1.498, 2.0, 1.189],
      [0.891, 1.335, 1.782, 1.122],
      [1.122, 1.682, 2.245, 1.335],
      [0.841, 1.26, 1.682, 1.0],
    ];
    let i = 0;
    const drift = (): void => {
      if (!this.ctx) return;
      i = (i + 1) % chords.length;
      const t = this.ctx.currentTime;
      chords[i]!.forEach((ratio, k) => this.musicOsc[k]?.frequency.setTargetAtTime(base * ratio, t, 4));
      setTimeout(drift, 18000 + Math.random() * 8000);
    };
    setTimeout(drift, 20000);
  }

  private districtStyle = '';
  private padGain: GainNode | null = null;
  private tracks = new Map<string, { el: HTMLAudioElement; gain: GainNode }>();
  private currentTrack = '';

  /** Crossfades to the region's track. Missing or blocked files leave the generative pad playing. */
  setRegion(region: string): void {
    const ctx = this.ctx;
    const url = REGION_TRACKS[region];
    if (!ctx || !this.musicGain || !url || url === this.currentTrack) return;
    this.currentTrack = url;
    const t = ctx.currentTime;
    let track = this.tracks.get(url);
    if (!track) {
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      try {
        ctx.createMediaElementSource(el).connect(gain).connect(this.musicGain);
      } catch {
        return;
      }
      track = { el, gain };
      this.tracks.set(url, track);
    }
    for (const [key, other] of this.tracks) {
      if (key === url) continue;
      other.gain.gain.setTargetAtTime(0, t, 1.2);
      const el = other.el;
      setTimeout(() => {
        if (this.currentTrack !== key) el.pause();
      }, 6000);
    }
    track.gain.gain.setTargetAtTime(0.55, t, 1.5);
    const playing = track.el.play();
    // The pad steps back while a track plays and comes back if it cannot.
    if (playing) {
      playing.then(() => this.padGain?.gain.setTargetAtTime(0.015, ctx.currentTime, 2)).catch(() => this.padGain?.gain.setTargetAtTime(0.08, ctx.currentTime, 1));
    }
  }

  /** District under the camera shifts the pad's base pitch and brightness. */
  setDistrict(style: string): void {
    if (!this.ctx || !this.musicFilter || style === this.districtStyle) return;
    this.districtStyle = style;
    const t = this.ctx.currentTime;
    const pitch: Record<string, number> = { corporate: 1.0, chrome: 1.122, skyline: 1.26, market: 0.891, old: 0.841, docks: 0.75, ghost: 0.707, undercity: 0.667 };
    const brightness: Record<string, number> = { corporate: 900, chrome: 1100, skyline: 1000, market: 700, old: 600, docks: 400, ghost: 350, undercity: 300 };
    const p = pitch[style] ?? 1;
    this.musicOsc.forEach((osc, k) => osc.frequency.setTargetAtTime(110 * p * [1, 1.498, 2.0, 1.189][k]!, t, 3));
    this.musicFilter.frequency.setTargetAtTime(brightness[style] ?? 600, t, 4);
  }

  /** Environment drives rain and hum levels. */
  setEnvironment(weather: Weather, night: number, traffic: number): void {
    this.weather = weather;
    this.night = night;
    this.traffic = traffic;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rain = weather === 'storm' ? 0.5 : weather === 'rain' ? 0.32 : weather === 'fog' ? 0.05 : 0;
    this.rainGain?.gain.setTargetAtTime(rain, t, 1.5);
    this.humGain?.gain.setTargetAtTime(0.08 + traffic * 0.12 + night * 0.03, t, 1.5);
    this.musicFilter?.frequency.setTargetAtTime(400 + night * 500, t, 3);
  }

  /** Short UI blip. */
  click(kind: 'click' | 'open' | 'error' | 'success' | 'notify' = 'click'): void {
    if (!this.ctx || !this.uiGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = kind === 'error' ? 180 : kind === 'success' ? 880 : kind === 'notify' ? 660 : kind === 'open' ? 520 : 420;
    osc.type = kind === 'error' ? 'square' : 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (kind === 'success' || kind === 'notify') osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.12);
    if (kind === 'error') osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.2);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'click' ? 0.08 : 0.25));
    osc.connect(gain).connect(this.uiGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Thunder for storms. */
  thunder(): void {
    if (!this.ctx || !this.ambientGain) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 120;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.6, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    src.connect(filter).connect(gain).connect(this.ambientGain);
    src.start(t);
    src.stop(t + 2.6);
  }

  describe(): string {
    return `${this.weather} night=${this.night.toFixed(2)} traffic=${this.traffic.toFixed(2)}`;
  }
}

export const audio = new AudioManager();
