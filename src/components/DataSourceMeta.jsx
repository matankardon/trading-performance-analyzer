import { DATA_STATUS_LABELS } from "../services/data";
import "./DataSourceMeta.css";

function DataSourceMeta({ metadata = {}, className = "" }) {
  const status = metadata.dataStatus || "UNAVAILABLE";
  const statusLabel = DATA_STATUS_LABELS[status] || status;
  const source = metadata.source || metadata.provider || "Not connected";
  const updated = metadata.retrievedAt || metadata.publishedAt || "--";

  return <div className={`data-source-meta ${className}`}><span>Data source: {source}</span><span>Updated: {formatTimestamp(updated)}</span><span className={`data-source-status data-source-${status.toLowerCase()}`}>{statusLabel}</span></div>;
}

function formatTimestamp(value) {
  if (!value || value === "--") return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default DataSourceMeta;
