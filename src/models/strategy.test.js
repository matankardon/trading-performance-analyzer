import {
  dbToStrategy,
  dbToStrategyVersion,
  strategyToDb,
  strategyVersionToDb,
} from "./strategy";

describe("strategy persistence adapters", () => {
  it("maps strategy rows and versions into the canonical shape", () => {
    const version = dbToStrategyVersion({
      id: "version-1",
      strategy_id: "strategy-1",
      version_number: 2,
      entry_rules: "Sweep",
      conditions: { mss: true },
    });
    const strategy = dbToStrategy({
      id: "strategy-1",
      user_id: "user-1",
      name: "London Sweep",
      status: "Testing",
    }, [version]);

    expect(strategy).toMatchObject({
      id: "strategy-1",
      userId: "user-1",
      name: "London Sweep",
      versions: [expect.objectContaining({ id: "version-1", version: 2 })],
    });
  });

  it("maps canonical strategies and versions to database payloads", () => {
    expect(strategyToDb({ userId: "user-1", name: "London Sweep" })).toMatchObject({
      user_id: "user-1",
      name: "London Sweep",
      status: "Draft",
    });
    expect(strategyVersionToDb({
      strategyId: "strategy-1",
      version: 2,
      entryRules: "Sweep",
      conditions: { mss: true },
    })).toMatchObject({
      strategy_id: "strategy-1",
      version_number: 2,
      entry_rules: "Sweep",
      conditions: { mss: true },
    });
  });
});
