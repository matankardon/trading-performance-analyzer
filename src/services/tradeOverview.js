export function openCreatedTradeOverview(trade, { setActivePage, setSelectedTrade }) {
  if (!trade) return false;
  setActivePage("Trades");
  setSelectedTrade(trade);
  return true;
}
