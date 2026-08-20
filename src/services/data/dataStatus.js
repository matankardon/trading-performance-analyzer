export const DATA_STATUS = Object.freeze({
  LIVE: "LIVE",
  HISTORICAL: "HISTORICAL",
  ESTIMATED: "ESTIMATED",
  DERIVED: "DERIVED",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "ERROR",
  SIMULATED: "SIMULATED",
});

export const DATA_STATUS_LABELS = Object.freeze({
  LIVE: "Live",
  HISTORICAL: "Historical",
  ESTIMATED: "Estimated",
  DERIVED: "Derived",
  UNAVAILABLE: "Unavailable",
  ERROR: "Error",
  SIMULATED: "Demo data",
});

export function createSourceMetadata(overrides = {}) {
  return {
    provider: null,
    source: null,
    sourceId: null,
    retrievedAt: null,
    publishedAt: null,
    methodology: null,
    dataStatus: DATA_STATUS.UNAVAILABLE,
    ...overrides,
  };
}

export function isVerifiedData(dataStatus) {
  return [DATA_STATUS.LIVE, DATA_STATUS.HISTORICAL].includes(dataStatus);
}
