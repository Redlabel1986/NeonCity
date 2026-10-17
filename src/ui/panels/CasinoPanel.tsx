import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { credits, signedCredits } from '../format';
import { CASINO_NAME, MAX_BET, MIN_BET, ROULETTE_BET_LABELS, ROULETTE_RED, SLOT_SYMBOLS, cardLabel, handValue, slotReturnToPlayer, type RouletteBet, type RouletteBetKind } from '../../sim/data/casino';
import { casinoNet } from '../../sim/systems/casino';
import { isUnlimitedMoney } from '../../sim/economy/finance';
import { Row } from '../components/Inspector';

type Game = 'slots' | 'roulette' | 'blackjack';

const GAMES: { id: Game; label: string }[] = [
  { id: 'slots', label: 'Slots' },
  { id: 'roulette', label: 'Roulette' },
  { id: 'blackjack', label: 'Blackjack' },
];

const CHIPS = [10, 50, 100, 500, 1000];

export function CasinoPanel() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [game, setGame] = useState<Game>('slots');
  const [bet, setBet] = useState(50);
  if (!state) return null;
  const casino = state.casino;
  const unlimited = isUnlimitedMoney(state);
  const maxBet = unlimited ? MAX_BET : Math.max(0, Math.min(MAX_BET, Math.floor(state.ledger.balance)));
  const clampBet = (v: number): number => Math.max(MIN_BET, Math.min(MAX_BET, Math.round(v)));
  const net = casinoNet(state);

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-sm border border-magenta/50 bg-magenta/10 p-3">
        <p className="title-glow text-lg font-semibold text-white">{CASINO_NAME}</p>
        <p className="mt-1 text-xs text-muted">Neon Market · geöffnet rund um die Uhr. Einsätze {credits(MIN_BET)} bis {credits(MAX_BET)}. Alles gespielte Geld läuft über dein Konto (Kategorie Casino).</p>
        <dl className="num mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted">Kontostand</dt>
            <dd className={state.ledger.balance < 0 ? 'text-blood' : 'text-white'}>{credits(state.ledger.balance)}</dd>
          </div>
          <div>
            <dt className="text-muted">Runden</dt>
            <dd className="text-white">{casino.stats.rounds}</dd>
          </div>
          <div>
            <dt className="text-muted">Bilanz</dt>
            <dd className={net > 0 ? 'text-acid' : net < 0 ? 'text-blood' : 'text-white'}>{signedCredits(net)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex gap-1 border-b border-line pb-2" role="tablist">
        {GAMES.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={game === g.id} className={`btn btn-ghost px-2 py-1 ${game === g.id ? 'border-b-cyan text-white' : ''}`} onClick={() => setGame(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      {game !== 'roulette' && (
        <div>
          <label className="block">
            <span className="text-muted">Einsatz</span>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <input type="number" className="input w-28" min={MIN_BET} max={MAX_BET} value={bet} onChange={(e) => setBet(clampBet(Number(e.target.value) || MIN_BET))} aria-label="Einsatz" />
              {CHIPS.map((c) => (
                <button key={c} type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setBet(clampBet(c))}>
                  {c}
                </button>
              ))}
              <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setBet(clampBet(bet * 2))}>
                ×2
              </button>
            </div>
          </label>
          {!unlimited && bet > maxBet && <p className="mt-1 text-xs text-amber">Dein Konto deckt diesen Einsatz nicht.</p>}
        </div>
      )}

      {game === 'slots' && <Slots bet={bet} onSpin={() => dispatch({ type: 'casinoSlots', bet })} last={casino.lastSlots} tick={state.tick} />}
      {game === 'roulette' && <Roulette onSpin={(bets) => dispatch({ type: 'casinoRoulette', bets })} last={casino.lastRoulette} balance={unlimited ? Infinity : state.ledger.balance} />}
      {game === 'blackjack' && (
        <Blackjack
          bet={bet}
          hand={casino.blackjack}
          onDeal={() => dispatch({ type: 'blackjackDeal', bet })}
          onHit={() => dispatch({ type: 'blackjackHit' })}
          onStand={() => dispatch({ type: 'blackjackStand' })}
          onDouble={() => dispatch({ type: 'blackjackDouble' })}
        />
      )}

      <div>
        <p className="panel-title">Letzte Runden</p>
        {casino.history.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Noch keine Runde gespielt.</p>
        ) : (
          <ul className="num mt-1 space-y-0.5 text-xs" aria-label="Casino-Verlauf">
            {casino.history.slice(0, 8).map((h, i) => (
              <li key={`${h.tick}-${i}`} className="flex justify-between gap-2">
                <span className="text-text/80">{h.text}</span>
                <span className={h.returned > h.wagered ? 'text-acid' : h.returned === h.wagered ? 'text-muted' : 'text-blood'}>{signedCredits(h.returned - h.wagered)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="num mt-2 text-xs">
          <Row label="Gesetzt insgesamt" value={credits(casino.stats.wagered)} />
          <Row label="Zurückerhalten" value={credits(casino.stats.returned)} />
          <Row label="Größter Gewinn" value={credits(casino.stats.biggestWin)} />
          <Row label="Auszahlungsquote Slots" value={`${Math.round(slotReturnToPlayer() * 1000) / 10} %`} />
        </dl>
      </div>
    </div>
  );
}

function Slots({ bet, onSpin, last, tick }: { bet: number; onSpin: () => void; last: NonNullable<ReturnType<typeof useSimState>>['casino']['lastSlots']; tick: number }) {
  const fresh = last && tick - last.tick < 2;
  return (
    <div>
      <div className="flex justify-center gap-2" aria-label="Walzen">
        {[0, 1, 2].map((i) => {
          const symbol = last ? SLOT_SYMBOLS.find((s) => s.id === last.reels[i])! : null;
          return (
            <div key={i} className={`flex h-20 w-20 items-center justify-center rounded-sm border border-line bg-ink text-4xl ${fresh ? 'pulse' : ''}`} data-testid={`reel-${i}`} title={symbol?.label ?? ''}>
              {symbol ? symbol.glyph : '·'}
            </div>
          );
        })}
      </div>
      {last && (
        <p className={`num mt-2 text-center ${last.payout > 0 ? 'text-acid' : 'text-muted'}`} data-testid="slots-result">
          {last.payout > 0 ? `Gewinn ${credits(last.payout)} (Einsatz ${credits(last.bet)})` : `Nichts gewonnen (Einsatz ${credits(last.bet)})`}
        </p>
      )}
      <button type="button" className="btn btn-primary mt-3 w-full" onClick={onSpin}>
        Drehen für {credits(bet)}
      </button>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Gewinntabelle</summary>
        <ul className="num mt-1 grid grid-cols-2 gap-x-3">
          {SLOT_SYMBOLS.map((s) => (
            <li key={s.id}>
              {s.glyph} {s.glyph} {s.glyph} → ×{s.triple}
            </li>
          ))}
          <li>🍒 🍒 beliebig → ×2</li>
          <li>jedes andere Paar → Einsatz zurück</li>
        </ul>
      </details>
    </div>
  );
}

const OUTSIDE: RouletteBetKind[] = ['red', 'black', 'even', 'odd', 'low', 'high'];

function Roulette({ onSpin, last, balance }: { onSpin: (bets: RouletteBet[]) => void; last: NonNullable<ReturnType<typeof useSimState>>['casino']['lastRoulette']; balance: number }) {
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [chip, setChip] = useState(50);
  const [straight, setStraight] = useState(17);
  const total = bets.reduce((s, b) => s + b.amount, 0);
  const add = (bet: Omit<RouletteBet, 'amount'>): void => {
    setBets((prev) => {
      const existing = prev.find((b) => b.kind === bet.kind && b.value === bet.value);
      if (existing) return prev.map((b) => (b === existing ? { ...b, amount: b.amount + chip } : b));
      return [...prev, { ...bet, amount: chip }];
    });
  };
  const colorOf = (n: number): string => (n === 0 ? 'text-acid' : ROULETTE_RED.has(n) ? 'text-blood' : 'text-white');
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-muted">Chip</span>
        {CHIPS.map((c) => (
          <button key={c} type="button" className={`btn px-2 py-0.5 ${chip === c ? 'border-cyan text-white' : ''}`} onClick={() => setChip(c)} aria-pressed={chip === c}>
            {c}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {OUTSIDE.map((kind) => (
          <button key={kind} type="button" className="btn px-2 py-1 text-xs" onClick={() => add({ kind })}>
            {ROULETTE_BET_LABELS[kind]}
          </button>
        ))}
        {[1, 2, 3].map((v) => (
          <button key={`d${v}`} type="button" className="btn px-2 py-1 text-xs" onClick={() => add({ kind: 'dozen', value: v })}>
            {v}. Dutzend (2:1)
          </button>
        ))}
        {[1, 2, 3].map((v) => (
          <button key={`c${v}`} type="button" className="btn px-2 py-1 text-xs" onClick={() => add({ kind: 'column', value: v })}>
            {v}. Kolonne (2:1)
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-muted">Zahl</span>
          <input type="number" className="input w-20" min={0} max={36} value={straight} onChange={(e) => setStraight(Math.max(0, Math.min(36, Number(e.target.value) || 0)))} aria-label="Zahl für Zahlenwette" />
        </label>
        <button type="button" className="btn px-2 py-1" onClick={() => add({ kind: 'straight', value: straight })}>
          Auf {straight} setzen (35:1)
        </button>
      </div>
      {bets.length > 0 && (
        <ul className="num mt-2 space-y-0.5 text-xs" aria-label="Gesetzte Wetten">
          {bets.map((b, i) => (
            <li key={i} className="flex justify-between">
              <span>
                {ROULETTE_BET_LABELS[b.kind]}
                {b.kind === 'straight' ? ` ${b.value}` : b.kind === 'dozen' || b.kind === 'column' ? ` ${b.value}` : ''}
              </span>
              <span>
                {credits(b.amount)}{' '}
                <button type="button" className="btn btn-ghost px-1 py-0" onClick={() => setBets(bets.filter((x) => x !== b))} aria-label="Wette entfernen">
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="num text-muted">Gesamt {credits(total)}</span>
        <button type="button" className="btn btn-ghost px-2 py-0.5" onClick={() => setBets([])} disabled={bets.length === 0}>
          Tisch leeren
        </button>
      </div>
      {total > balance && <p className="mt-1 text-xs text-amber">Dein Konto deckt diese Einsätze nicht.</p>}
      <button type="button" className="btn btn-primary mt-2 w-full" disabled={bets.length === 0 || total > MAX_BET} onClick={() => onSpin(bets)}>
        Kugel werfen ({credits(total)})
      </button>
      {last && (
        <div className="mt-3 text-center" data-testid="roulette-result">
          <p className={`text-3xl font-semibold ${colorOf(last.number)}`}>{last.number}</p>
          <p className={`num text-xs ${last.payout > 0 ? 'text-acid' : 'text-muted'}`}>
            {last.payout > 0 ? `Auszahlung ${credits(last.payout)}` : 'Keine Wette getroffen'} · gesetzt {credits(last.bets.reduce((s, b) => s + b.amount, 0))}
          </p>
        </div>
      )}
    </div>
  );
}

function Blackjack({ bet, hand, onDeal, onHit, onStand, onDouble }: { bet: number; hand: NonNullable<ReturnType<typeof useSimState>>['casino']['blackjack']; onDeal: () => void; onHit: () => void; onStand: () => void; onDouble: () => void }) {
  const playing = hand?.phase === 'player';
  const player = hand ? handValue(hand.player) : null;
  const dealerCards = hand ? (playing ? hand.dealer.slice(0, 1) : hand.dealer) : [];
  const dealer = hand ? handValue(dealerCards) : null;
  const cards = (list: { rank: number; suit: number }[], hidden: boolean): React.ReactNode => (
    <div className="flex gap-1">
      {list.map((c, i) => (
        <span key={i} className={`inline-flex h-12 w-9 items-center justify-center rounded-sm border border-line bg-white text-sm font-semibold ${c.suit === 1 || c.suit === 2 ? 'text-blood' : 'text-ink'}`}>
          {cardLabel(c)}
        </span>
      ))}
      {hidden && <span className="inline-flex h-12 w-9 items-center justify-center rounded-sm border border-line bg-magenta/40 text-sm text-white">?</span>}
    </div>
  );
  const outcomeText = hand?.outcome === 'blackjack' ? `Blackjack! Auszahlung ${credits(hand.payout)}` : hand?.outcome === 'win' ? `Gewonnen: ${credits(hand.payout)}` : hand?.outcome === 'push' ? 'Unentschieden, Einsatz zurück' : hand?.outcome === 'lose' ? `Verloren (${credits(hand.bet)})` : null;
  return (
    <div>
      {hand ? (
        <div className="space-y-2" data-testid="blackjack-table">
          <div>
            <p className="num text-xs text-muted">Dealer {dealer ? dealer.total : ''}</p>
            {cards(dealerCards, playing)}
          </div>
          <div>
            <p className="num text-xs text-muted">
              Du {player?.total}
              {player?.soft ? ' (weich)' : ''} · Einsatz {credits(hand.bet)}
            </p>
            {cards(hand.player, false)}
          </div>
          {outcomeText && (
            <p className={`num ${hand.outcome === 'lose' ? 'text-blood' : hand.outcome === 'push' ? 'text-muted' : 'text-acid'}`} data-testid="blackjack-result">
              {outcomeText}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">Dealer steht auf 17, Blackjack zahlt 3:2, Verdoppeln mit den ersten beiden Karten. Kein Teilen, keine Versicherung.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {playing ? (
          <>
            <button type="button" className="btn btn-primary" onClick={onHit}>
              Karte
            </button>
            <button type="button" className="btn" onClick={onStand}>
              Halten
            </button>
            {hand.player.length === 2 && (
              <button type="button" className="btn" onClick={onDouble}>
                Verdoppeln
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary w-full" onClick={onDeal}>
            Geben für {credits(bet)}
          </button>
        )}
      </div>
    </div>
  );
}
