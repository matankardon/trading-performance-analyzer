import { useMemo, useState } from "react";
import { readSymbolMap, readTradingViewSymbolMap, resolveDefaultChartSelection } from "../services/symbolMap";
import { studiesForVersion, indicatorChipText } from "../services/tradingViewStudies";
import { readPineScriptId } from "../services/pineScript";
import TradingViewChart from "./TradingViewChart";
import PineScriptPanel from "./PineScriptPanel";
import "./TradingWorkspaces.css";

const TRADINGVIEW_INTERVAL = "15";

export default function ChartWorkspace({
  strategyLibrary = [],
  selectedAsset = "",
  onPageChange = () => {},
}) {
  const [symbolMaps] = useState(() => ({
    chart: readSymbolMap(),
    tradingView: readTradingViewSymbolMap(),
  }));
  const selection = resolveDefaultChartSelection(
    selectedAsset,
    [],
    symbolMaps.chart,
    symbolMaps.tradingView,
  );
  const [strategyId, setStrategyId] = useState(strategyLibrary[0]?.id || "");
  const [strategyVersionChoice, setStrategyVersionChoice] = useState();
  const [scriptIdOverrides, setScriptIdOverrides] = useState({});
  const selectedStrategy = strategyLibrary.find(({ id }) => id === strategyId) || strategyLibrary[0] || null;
  const strategyVersions = useMemo(
    () => [...(selectedStrategy?.versions || [])].sort((left, right) => Number(right.version) - Number(left.version)),
    [selectedStrategy],
  );
  const strategyVersionId = strategyVersionChoice === undefined
    ? strategyVersions[0]?.id || ""
    : strategyVersionChoice || "";
  const selectedVersion = strategyVersions.find((version) => version.id === strategyVersionId) || null;
  const scriptId = selectedVersion
    ? scriptIdOverrides[selectedVersion.id] ?? readPineScriptId(selectedVersion.id)
    : "";
  const strategyVersionForPine = useMemo(
    () => selectedVersion ? { ...selectedVersion, strategyName: selectedStrategy?.name || selectedVersion.name } : null,
    [selectedStrategy?.name, selectedVersion],
  );
  const studyMapping = useMemo(() => studiesForVersion(selectedVersion, scriptId), [scriptId, selectedVersion]);
  const tradingViewSymbol = selection.tradingViewSymbol;

  function selectStrategy(nextStrategyId) {
    setStrategyId(nextStrategyId);
    const nextStrategy = strategyLibrary.find(({ id }) => id === nextStrategyId);
    const latestVersion = [...(nextStrategy?.versions || [])]
      .sort((left, right) => Number(right.version) - Number(left.version))[0];
    setStrategyVersionChoice(latestVersion?.id || null);
  }

  return (
    <div className="trading-workspace chart-only-workspace">
      <section className="trading-workspace-card chart-strategy-toolbar" aria-label="Chart strategy studies">
        <label>Strategy
          <select aria-label="Strategy" value={selectedStrategy?.id || ""} onChange={(event) => selectStrategy(event.target.value)}>
            {strategyLibrary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Version
          <select aria-label="Strategy version" value={selectedVersion?.id || ""} onChange={(event) => setStrategyVersionChoice(event.target.value || null)}>
            <option value="">Select a version</option>
            {strategyVersions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}
          </select>
        </label>
        <div className="chart-strategy-status">
          <div className="chart-indicator-status">
            <span>Studies · manual review</span>
            {studyMapping.indicators.map((indicator) => <span className={`chart-indicator-chip ${indicator.status === "sent" ? "" : "unavailable"}`} key={indicator.key}>{indicatorChipText(indicator)}</span>)}
            {studyMapping.manualConditions.map((condition) => <span className="chart-indicator-chip unavailable" key={condition.key}>{condition.label}: Check manually</span>)}
            {studyMapping.customScript && <span className="chart-indicator-chip unavailable">Custom script (unverified)</span>}
          </div>
          {studyMapping.manualOnly && <div className="chart-manual-indicators">
            <span>This strategy declares no chart indicators (only manual conditions). Add indicators in Strategy Lab to see them here.</span>
            <button type="button" className="secondary-btn" onClick={() => onPageChange("Strategy Lab")}>Open Strategy Lab</button>
          </div>}
          <span className="chart-muted-note chart-indicator-guidance">If an indicator isn’t visible, add it with the chart’s Indicators button.</span>
        </div>
      </section>
      <section className="trading-workspace-card chart-main-card" aria-label="Chart workspace">
        <div className="chart-card-heading">
          <div><p className="eyebrow">TRADINGVIEW · EMBEDDED CHART</p><h2>TradingView chart · {tradingViewSymbol}</h2></div>
        </div>
        <TradingViewChart symbol={tradingViewSymbol} interval={TRADINGVIEW_INTERVAL} studies={studyMapping.studies} />
        <p className="chart-muted-note">Chart data is provided by TradingView. Indicators and setup conditions are not detected by this application.</p>
        <p className="chart-drawings-note">Drawings made on this chart are not saved and are cleared when you change symbol or timeframe. To keep them: take a screenshot (or use the chart&apos;s snapshot button) and attach it to a trade.</p>
      </section>
      <PineScriptPanel
        key={selectedVersion?.id || "no-version"}
        version={strategyVersionForPine}
        scriptId={scriptId}
        onScriptIdChange={(value) => {
          if (selectedVersion) setScriptIdOverrides((previous) => ({ ...previous, [selectedVersion.id]: value }));
        }}
      />
    </div>
  );
}
