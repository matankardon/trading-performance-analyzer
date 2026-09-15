const snapshotFields = [
  "symbol",
  "assetName",
  "timeframe",
  "timestamp",
  "session",
  "trend",
  "swingHigh",
  "swingLow",
  "previousDayHigh",
  "previousDayLow",
  "liquidityLevels",
  "fairValueGaps",
  "orderBlocks",
  "marketStructureShift",
  "displacement",
  "entryZone",
  "stopZone",
  "takeProfitZone",
  "direction",
  "riskReward",
  "setupConditions",
  "setupScore",
  "marketTradingScore",
];

function hasValue(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  return true;
}

export function normalizeSetupSnapshot(input = {}) {
  return snapshotFields.reduce((snapshot, field) => {
    if (hasValue(input[field])) {
      snapshot[field] = input[field];
    }

    return snapshot;
  }, {});
}

export function serializeSetupSnapshot(snapshot) {
  return JSON.stringify(normalizeSetupSnapshot(snapshot), null, 2);
}

export function downloadSetupSnapshot(snapshot) {
  const blob = new Blob([serializeSetupSnapshot(snapshot)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${snapshot.symbol || "setup"}-setup-snapshot.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copySetupSnapshot(snapshot) {
  const serialized = serializeSetupSnapshot(snapshot);

  if (!navigator.clipboard?.writeText) {
    return false;
  }

  await navigator.clipboard.writeText(serialized);
  return true;
}
