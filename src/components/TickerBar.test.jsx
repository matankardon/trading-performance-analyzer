import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TickerBar, { TRADING_VIEW_TICKER_SYMBOLS } from "./TickerBar";

describe("TickerBar", () => {
  it("uses the TradingView ticker tape with the defined symbols and visible attribution", async () => {
    render(<TickerBar />);
    const script = await waitFor(() => document.querySelector(
      'script[src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"]',
    ));
    const config = JSON.parse(script.textContent);
    expect(config.symbols).toEqual(TRADING_VIEW_TICKER_SYMBOLS);
    expect(config.symbols.map(({ proName }) => proName)).toEqual([
      "OANDA:XAUUSD",
      "FX:EURUSD",
      "FX:GBPUSD",
      "FX:USDJPY",
      "BITSTAMP:BTCUSD",
      "FOREXCOM:SPXUSD",
      "FOREXCOM:NSXUSD",
      "TVC:DXY",
    ]);
    expect(config).toMatchObject({ colorTheme: "dark", isTransparent: false, locale: "en" });
    expect(screen.getByRole("link", { name: "Track all markets on TradingView" })).toBeVisible();
    expect(screen.queryByText("DEMO DATA")).not.toBeInTheDocument();
    expect(screen.getByLabelText("TradingView market ticker").querySelector(".tradingview-widget-shell"))
      .toHaveStyle({ height: "38px" });
  });
});
