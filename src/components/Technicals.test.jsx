import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Technicals from "./Technicals";
import { TRADING_VIEW_TICKER_SYMBOLS } from "../services/tradingViewWidgetConfigs";

describe("Technicals", () => {
  beforeEach(() => localStorage.clear());

  it("renders the honest rating label and resolves a journaled asset to its TradingView symbol", async () => {
    render(<Technicals trades={[{ asset: "CFDs on Gold (US$ / OZ)" }]} selectedAsset="CFDs on Gold (US$ / OZ)" />);
    const script = await waitFor(() => document.querySelector(
      'script[src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"]',
    ));
    expect(JSON.parse(script.textContent)).toMatchObject({
      symbol: "OANDA:XAUUSD",
      colorTheme: "dark",
      isTransparent: false,
      locale: "en",
    });
    expect(screen.getByText("Technical rating from TradingView — not a prediction or advice.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Technical analysis symbol" })).toHaveValue("OANDA:XAUUSD");
    expect(screen.queryByText(/What are the experts thinking/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What does this mean?" })).toBeInTheDocument();
    expect(screen.getByText("How to read the rating and counts")).toBeInTheDocument();
  });

  it("offers journal assets before ticker tape symbols and changes the widget on selection", async () => {
    render(<Technicals trades={[{ asset: "EUR/USD" }]} />);
    const script = await waitFor(() => document.querySelector(
      'script[src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"]',
    ));
    expect(JSON.parse(script.textContent).symbol).toBe("FX:EURUSD");
    const select = screen.getByRole("combobox", { name: "Technical analysis symbol" });
    const options = [...select.options].map(({ value }) => value);
    expect(options[0]).toBe("FX:EURUSD");
    expect(options.slice(1)).toEqual(TRADING_VIEW_TICKER_SYMBOLS
      .map(({ proName }) => proName)
      .filter((symbol) => symbol !== "FX:EURUSD"));
    fireEvent.change(select, { target: { value: "BITSTAMP:BTCUSD" } });
    await waitFor(() => {
      const nextScript = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"]');
      expect(JSON.parse(nextScript.textContent).symbol).toBe("BITSTAMP:BTCUSD");
    });
  });

  it("uses a persisted user mapping before built-in mappings", async () => {
    localStorage.setItem("tradeCatalystTradingViewSymbolMap", JSON.stringify({ Gold: "CUSTOM:XAUUSD" }));
    render(<Technicals trades={[{ asset: "Gold" }]} selectedAsset="Gold" />);
    await waitFor(() => {
      const script = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"]');
      expect(JSON.parse(script.textContent).symbol).toBe("CUSTOM:XAUUSD");
    });
  });
});
