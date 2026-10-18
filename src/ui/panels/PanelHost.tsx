import { useGameStore, type Panel } from '../store/gameStore';
import { RAIL_ENTRIES } from '../navigation';
import { BuildPanel } from './BuildPanel';
import { BusinessPanel } from './BusinessPanel';
import { FinancePanel } from './FinancePanel';
import { CityPanel } from './CityPanel';
import { StatsPanel } from './StatsPanel';
import { LockedPanel } from './LockedPanel';
import { BusinessDashboard } from './BusinessDashboard';
import { StaffPanel } from './StaffPanel';
import { RealEstatePanel } from './RealEstatePanel';
import { UnderworldPanel } from './UnderworldPanel';
import { FactionsPanel } from './FactionsPanel';
import { PoliticsPanel } from './PoliticsPanel';
import { ResearchPanel } from './ResearchPanel';
import { CasinoPanel } from './CasinoPanel';
import { WorldMapPanel } from './WorldMapPanel';
import { useSimState } from '../store/gameStore';

export interface PanelView {
  panel: Panel;
  title: string;
  content: React.ReactNode;
  wide: boolean;
}

/** Title and content of the open panel; shared by the desktop host and the phone sheet. */
export function usePanelView(): PanelView | null {
  const panel = useGameStore((s) => s.panel);
  const dashboardId = useGameStore((s) => s.dashboardBuildingId);
  const state = useSimState();
  if (!panel) return null;
  const entry = RAIL_ENTRIES.find((e) => e.id === panel);
  const dashboardBuilding = panel === 'dashboard' && dashboardId !== null ? state?.buildings[dashboardId] : undefined;
  const title = panel === 'dashboard' ? (dashboardBuilding?.label ?? 'Dashboard') : (entry?.label ?? panel);
  const wide = panel === 'dashboard';
  let content: React.ReactNode;
  switch (panel) {
    case 'dashboard':
      content = dashboardBuilding ? <BusinessDashboard key={dashboardBuilding.id} building={dashboardBuilding} /> : <p className="text-sm text-muted">Kein Betrieb ausgewählt.</p>;
      break;
    case 'staff':
      content = <StaffPanel />;
      break;
    case 'realestate':
      content = <RealEstatePanel />;
      break;
    case 'underworld':
      content = <UnderworldPanel />;
      break;
    case 'factions':
      content = <FactionsPanel />;
      break;
    case 'politics':
      content = <PoliticsPanel />;
      break;
    case 'research':
      content = <ResearchPanel />;
      break;
    case 'casino':
      content = <CasinoPanel />;
      break;
    case 'map':
      content = <WorldMapPanel />;
      break;
    case 'build':
      content = <BuildPanel />;
      break;
    case 'business':
      content = <BusinessPanel />;
      break;
    case 'finance':
      content = <FinancePanel />;
      break;
    case 'city':
      content = <CityPanel />;
      break;
    case 'stats':
      content = <StatsPanel />;
      break;
    default:
      content = <LockedPanel panel={panel} phase={entry?.phase ?? 2} />;
  }
  return { panel, title, content, wide };
}

export function PanelHost() {
  const setPanel = useGameStore((s) => s.setPanel);
  const view = usePanelView();
  if (!view) return null;
  const { panel, title, content, wide } = view;
  return (
    <section className={`panel pointer-events-auto flex ${wide ? 'w-[36rem]' : 'w-[26rem]'} max-w-[calc(100vw-10rem)] shrink-0 flex-col border-y-0`} aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-sm font-medium text-white">{title}</h2>
        <button type="button" className="btn btn-ghost px-2 py-0.5" aria-label="Panel schließen" onClick={() => setPanel(panel)}>
          ×
        </button>
      </div>
      <div className="scroll flex-1 p-4">{content}</div>
    </section>
  );
}
