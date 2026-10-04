import { detectFVGs, detectLiquiditySweeps } from "./patternDetection";
import { detectMSS, detectOrderBlocks, detectSwingPoints } from "./structureDetection";
import { calculateStochastic, isStochasticConfirming } from "./stochastic";
import { isTimestampInSession } from "./sessionWindows";

const conditionDefaults = {
  requireSweep: true,
  requireMss: true,
  requireFvg: true,
  requireOrderBlock: true,
  requireStoch: true,
  requireDisplacement: false,
};

function getConditionOptions(options) {
  return Object.fromEntries(
    Object.entries(conditionDefaults).map(([key, defaultValue]) => [
      key,
      options[key] === undefined ? defaultValue : Boolean(options[key]),
    ]),
  );
}

function overlapsZone(bar, zone) {
  return bar.low <= zone.top && bar.high >= zone.bottom;
}

function getDirectionType(direction) {
  if (direction === "long") return "bullish";
  if (direction === "short") return "bearish";
  return null;
}

function hasRequiredSweep(sweeps, event, direction, lookback) {
  const sweptType = direction === "bullish" ? "low" : "high";
  return sweeps.some((sweep) => (
    sweep.type === sweptType
    && sweep.index < event.index
    && (sweep.confirmedAt ?? sweep.index) <= event.index
    && event.index - sweep.index <= lookback
  ));
}

export function ictEntryRule(bars, options = {}) {
  if (!Array.isArray(bars)) throw new Error("bars must be an array.");

  const conditions = getConditionOptions(options);
  if (conditions.requireDisplacement) {
    throw new Error("Displacement detection is not implemented; disable that condition before running this backtest.");
  }
  if (!Object.values(conditions).some(Boolean)) {
    throw new Error("Enable at least one implemented strategy condition to run this backtest.");
  }

  const swingSize = options.swingSize ?? 2;
  const sweepDetectionLookback = options.sweepDetectionLookback ?? 5;
  const sweepLookback = options.sweepLookback ?? 10;
  const setupLookback = options.setupLookback ?? 20;
  const stochasticKPeriod = options.stochasticKPeriod ?? 14;
  const stochasticDPeriod = options.stochasticDPeriod ?? 3;
  const session = options.session ?? "All sessions";

  for (const [name, value] of [["sweepLookback", sweepLookback], ["setupLookback", setupLookback]]) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  }

  const fvgEvents = detectFVGs(bars);
  const sweeps = detectLiquiditySweeps(bars, sweepDetectionLookback);
  const swingPoints = detectSwingPoints(bars, swingSize);
  const mssEvents = detectMSS(bars, swingPoints);
  const mssContexts = mssEvents.map((event) => ({
    event,
    orderBlock: detectOrderBlocks(bars, [event])[0] || null,
  }));
  const stochastic = conditions.requireStoch
    ? calculateStochastic(bars, stochasticKPeriod, stochasticDPeriod)
    : [];

  if (conditions.requireStoch && bars.length < stochasticKPeriod + stochasticDPeriod) {
    throw new Error(`At least ${stochasticKPeriod + stochasticDPeriod} bars are required for stochastic confirmation.`);
  }

  const requiresMssContext = conditions.requireMss || conditions.requireSweep || conditions.requireOrderBlock;
  const matchingContexts = (type, index) => mssContexts.filter(({ event }) => (
    event.type === type
    && event.index <= index
    && (event.confirmedAt ?? event.index) <= index
    && index - event.index <= setupLookback
  ));

  const matchingZones = (type, index, event, context) => {
    const zones = [];
    if (conditions.requireFvg) {
      fvgEvents.forEach((gap) => {
        if (
          gap.type === type
          && index > (gap.confirmedAt ?? gap.index)
          && index - gap.index <= setupLookback
          && (!event || Math.abs(gap.index - event.index) <= setupLookback)
          && overlapsZone(bars[index], gap)
        ) {
          zones.push({ kind: "FVG", index: gap.index, confirmedAt: gap.confirmedAt ?? gap.index, top: gap.top, bottom: gap.bottom });
        }
      });
    }
    if (
      conditions.requireOrderBlock
      && context?.orderBlock
      && index > (context.orderBlock.confirmedAt ?? context.orderBlock.index)
      && overlapsZone(bars[index], context.orderBlock)
    ) {
      const ob = context.orderBlock;
      zones.push({ kind: "Order block", index: ob.index, confirmedAt: ob.confirmedAt ?? ob.index, top: ob.top, bottom: ob.bottom });
    }
    return zones;
  };

  const entryRule = ({ bars: currentBars, index, direction = "long" }) => {
    if (currentBars !== bars || !Number.isInteger(index) || index < 0 || index >= bars.length) return false;
    const directions = direction === "both" ? ["long", "short"] : [direction];

    return directions.some((side) => {
      const type = getDirectionType(side);
      if (!type || !isTimestampInSession(bars[index].timestamp, session)) return false;
      if (conditions.requireStoch && !isStochasticConfirming(stochastic[index], side)) return false;

      const contexts = matchingContexts(type, index);
      if (requiresMssContext && contexts.length === 0) return false;
      const candidates = contexts.length ? contexts : [null];
      return candidates.some((context) => {
        const event = context?.event;
        const orderBlock = context?.orderBlock;
        if (conditions.requireMss && !event) return false;
        if (conditions.requireSweep && (!event || !hasRequiredSweep(sweeps, event, type, sweepLookback))) return false;
        if (!conditions.requireFvg && !conditions.requireOrderBlock) return true;
        if (event && index <= event.index) return false;
        return matchingZones(type, index, event, { orderBlock }).length > 0;
      });
    });
  };

  entryRule.getEntryReasoning = (signalIndex, direction = "long", entryIndex = signalIndex + 1) => {
    if (!entryRule({ bars, index: signalIndex, direction })) return null;
    const type = getDirectionType(direction);
    const sweptType = type === "bullish" ? "low" : "high";
    const contexts = matchingContexts(type, signalIndex);
    const candidates = contexts.length ? contexts : [null];

    for (const context of candidates) {
      const event = context?.event;
      const sweep = conditions.requireSweep && event
        ? [...sweeps].reverse().find((item) => (
          item.type === sweptType
          && item.index < event.index
          && (item.confirmedAt ?? item.index) <= event.index
          && event.index - item.index <= sweepLookback
        ))
        : null;
      if (conditions.requireSweep && !sweep) continue;
      const zones = matchingZones(type, signalIndex, event, context);
      if ((conditions.requireFvg || conditions.requireOrderBlock) && !zones.length) continue;
      const stochasticAtEntry = conditions.requireStoch ? stochastic[entryIndex] : null;

      return {
        signalIndex,
        signalTimestamp: bars[signalIndex].timestamp,
        entryIndex,
        direction,
        gates: {
          liquiditySweep: conditions.requireSweep,
          mss: conditions.requireMss,
          fvg: conditions.requireFvg,
          orderBlock: conditions.requireOrderBlock,
          stochasticConfirmation: conditions.requireStoch,
        },
        liquiditySweep: sweep ? {
          index: sweep.index,
          timestamp: bars[sweep.index].timestamp,
          type: sweep.type,
          sweptLevel: sweep.sweptLevel,
          confirmedAt: sweep.confirmedAt ?? sweep.index,
        } : null,
        mss: event ? {
          index: event.index,
          timestamp: bars[event.index].timestamp,
          type: event.type,
          brokenLevel: event.brokenLevel,
          confirmedAt: event.confirmedAt ?? event.index,
        } : null,
        zones,
        stochastic: stochasticAtEntry ? {
          index: entryIndex,
          timestamp: bars[entryIndex]?.timestamp,
          k: stochasticAtEntry.k,
          d: stochasticAtEntry.d,
        } : null,
      };
    }
    return null;
  };

  entryRule.getDiagnostics = (direction = "both") => {
    const directions = direction === "both" ? ["long", "short"] : [direction];
    const directionTypes = directions.map(getDirectionType).filter(Boolean);
    const mssIndices = new Set(mssEvents.filter((event) => directionTypes.includes(event.type)).map((event) => event.index));
    const zoneRetestIndices = new Set();
    mssContexts.forEach(({ event, orderBlock }) => {
      if (!directionTypes.includes(event.type)) return;
      for (let index = event.index + 1; index < bars.length && index - event.index <= setupLookback; index += 1) {
        if (matchingZones(event.type, index, event, { orderBlock }).length) zoneRetestIndices.add(index);
      }
    });
    const stochasticIndices = new Set();
    stochastic.forEach((value, index) => {
      if (directions.some((side) => isStochasticConfirming(value, side))) stochasticIndices.add(index);
    });
    const allGatesIndices = new Set();
    bars.forEach((_, index) => {
      if (directions.some((side) => entryRule({ bars, index, direction: side }))) allGatesIndices.add(index);
    });
    const stages = [
      ["bars", bars.length],
      ["sweepDetected", new Set(sweeps.map((sweep) => sweep.index)).size],
      ["mssDetected", mssIndices.size],
      ["obFvgRetest", zoneRetestIndices.size],
      ["stochasticConfirmation", stochasticIndices.size],
      ["allGatesTogether", allGatesIndices.size],
    ];
    const biggestDropOff = stages.slice(1).reduce((largest, [stage, count], index) => {
      const previous = stages[index][1];
      const dropped = Math.max(0, previous - count);
      return dropped > largest.dropped ? { from: stages[index][0], to: stage, dropped } : largest;
    }, { from: null, to: null, dropped: 0 });

    return {
      direction,
      sweepDetected: stages[1][1],
      mssDetected: stages[2][1],
      obFvgRetest: stages[3][1],
      stochasticConfirmation: stages[4][1],
      allGatesTogether: stages[5][1],
      biggestDropOff,
    };
  };

  return entryRule;
}
