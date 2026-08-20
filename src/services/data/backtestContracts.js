import { DATA_STATUS, isVerifiedData } from "./dataStatus";

export function createDatasetIdentity({ provider = null, asset = null, timeframe = null, startDate = null, endDate = null, retrievedAt = null, datasetVersion = null } = {}) {
  return { provider, asset, timeframe, startDate, endDate, retrievedAt, datasetVersion };
}

export function createBacktestInput({ strategyId, strategyVersion, dataset, engineVersion = null } = {}) {
  return {
    strategyId: strategyId || null,
    strategyVersion: strategyVersion || null,
    asset: dataset?.asset || null,
    timeframe: dataset?.timeframe || null,
    startDate: dataset?.startDate || null,
    endDate: dataset?.endDate || null,
    dataProvider: dataset?.provider || null,
    dataStatus: dataset?.dataStatus || DATA_STATUS.UNAVAILABLE,
    dataset: dataset || null,
    backtestEngineVersion: engineVersion,
  };
}

export function canRunRealBacktest({ dataStatus, bars = [], validation } = {}) {
  return isVerifiedData(dataStatus) && dataStatus === DATA_STATUS.HISTORICAL && bars.length > 0 && validation?.valid === true;
}
