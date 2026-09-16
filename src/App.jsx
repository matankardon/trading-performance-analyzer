import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import PrivacyNotice from "./components/PrivacyNotice";
import TickerBar from "./components/TickerBar";

const Analytics = lazy(() => import("./components/Analytics"));
const EconomicCalendar = lazy(() => import("./components/EconomicCalendar"));
const MarketSentiment = lazy(() => import("./components/MarketSentiment"));
const InvestingWorkspace = lazy(() => import("./components/InvestingWorkspace"));
const DayTradingDashboard = lazy(() => import("./components/DayTradingDashboard"));
const ScreenshotTradeWorkflow = lazy(() => import("./components/ScreenshotTradeWorkflow"));
const StrategyLab = lazy(() => import("./components/StrategyLab"));

import "./App.css";

const emptyForm = {
  date: "",
  asset: "",
  direction: "Long",
  entry: "",
  exit: "",
  stopLoss: "",
  takeProfit: "",
  pnl: "",
  strategy: "",
  session: "New York",
  notes: "",

  liquiditySweep: false,
  mss: false,
  fvg: false,
  displacement: false,
  orderBlock: false,
  stochasticConfirmation: false,

  tradeQuality: "Valid Setup",
  ruleBreak: false,
};

function extractNumericValue(text) {
  if (!text) {
    return "";
  }

  const match = String(text).match(/^-?[\d,]+\.?\d*/);
  return match ? match[0].replace(/,/g, "") : "";
}

function hasAnnotation(text) {
  return typeof text === "string" && (text.includes("(calculated)") || text.includes("(inconsistent"));
}

function annotationHint(text) {
  return text.includes("(inconsistent")
    ? "AI flagged this as inconsistent — verify"
    : "AI-calculated — double-check";
}

function LazyViewFallback() {
  return (
    <div className="workflow-loading" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <strong>Loading view...</strong>
    </div>
  );
}

function App() {
  const [activeMode, setActiveMode] = useState("DAY TRADING");
  const [activePage, setActivePage] = useState("Overview");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [strategyLibrary, setStrategyLibrary] = useState([]);

  const [showTradeForm, setShowTradeForm] = useState(false);
  const [showScreenshotWorkflow, setShowScreenshotWorkflow] = useState(false);
  const [showNavigationMenu, setShowNavigationMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showScreenshotConsent, setShowScreenshotConsent] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotAiExtraction, setScreenshotAiExtraction] = useState(null);
  const [screenshotAnnotations, setScreenshotAnnotations] = useState({});
  const [selectedTradeScreenshotUrl, setSelectedTradeScreenshotUrl] = useState("");
  const [editingTrade, setEditingTrade] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);

  const [trades, setTrades] = useState([]);

  const [loadingTrades, setLoadingTrades] = useState(true);
  const [savingTrade, setSavingTrade] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [assetFilter, setAssetFilter] = useState("All");
  const [strategyFilter, setStrategyFilter] = useState("All");
  const [sessionFilter, setSessionFilter] = useState("All");
  const [resultFilter, setResultFilter] = useState("All");
  const [qualityFilter, setQualityFilter] = useState("All");

  const [form, setForm] = useState(emptyForm);

  /*
  ==================================================
  LOAD USER + TRADES
  ==================================================
  */

  async function loadTradesForUser(user) {
    if (!user) {
      setTrades([]);
      setLoadingTrades(false);
      return;
    }

    setLoadingTrades(true);

    try {
      const {
        data,
        error,
      } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Could not load trades:",
          error
        );

        setTrades([]);
        return;
      }

      setTrades(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (error) {
      console.error(
        "Unexpected error loading trades:",
        error
      );

      setTrades([]);
    } finally {
      setLoadingTrades(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      setLoadingTrades(true);

      try {
        const {
          data,
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error(
            "Could not get auth session:",
            error
          );

          if (mounted) {
            setCurrentUser(null);
            setTrades([]);
            setLoadingTrades(false);
          }

          return;
        }

        const user =
          data?.session?.user || null;

        if (!mounted) {
          return;
        }

        setCurrentUser(user);

        if (user) {
          await loadTradesForUser(user);
        } else {
          setTrades([]);
          setLoadingTrades(false);
        }
      } catch (error) {
        console.error(
          "Unexpected authentication error:",
          error
        );

        if (mounted) {
          setCurrentUser(null);
          setTrades([]);
          setLoadingTrades(false);
        }
      }
    }

    initializeAuth();

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) {
          return;
        }

        const user =
          session?.user || null;

        setCurrentUser(user);

        if (!user) {
          setTrades([]);
          setLoadingTrades(false);
          return;
        }

        await loadTradesForUser(user);
      }
    );

    return () => {
      mounted = false;

      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedTradeScreenshot() {
      setSelectedTradeScreenshotUrl("");
      if (!selectedTrade?.screenshot_path || !currentUser) {
        return;
      }

      const { data, error } = await supabase.storage
        .from("trade-screenshots")
        .createSignedUrl(selectedTrade.screenshot_path, 300);

      if (error) {
        console.error("Could not load trade screenshot:", error);
        return;
      }

      if (!cancelled) {
        setSelectedTradeScreenshotUrl(data?.signedUrl || "");
      }
    }

    loadSelectedTradeScreenshot();
    return () => {
      cancelled = true;
    };
  }, [currentUser, selectedTrade]);

  /*
  ==================================================
  AUTH SUCCESS
  ==================================================
  */

  async function handleAuthSuccess(user) {
    setCurrentUser(user);
    setActivePage("Overview");

    await loadTradesForUser(user);
  }

  /*
  ==================================================
  LOGOUT
  ==================================================
  */

  async function handleLogout() {
    const {
      error,
    } = await supabase.auth.signOut();

    if (error) {
      console.error(
        "Could not sign out:",
        error
      );

      window.alert(
        `Could not sign out: ${error.message}`
      );

      return;
    }

    setCurrentUser(null);
    setTrades([]);
    setSelectedTrade(null);
    setShowTradeForm(false);
  }

  /*
  ==================================================
  FORM
  ==================================================
  */

  function handleChange(e) {
    const {
      name,
      value,
    } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleCheckboxChange(e) {
    const {
      name,
      checked,
    } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: checked,
    }));
  }

  function openAddTrade() {
    setEditingTrade(null);
    setScreenshotFile(null);
    setScreenshotAiExtraction(null);
    setScreenshotAnnotations({});

    setForm({
      ...emptyForm,
      date: new Date()
        .toISOString()
        .split("T")[0],
    });

    setShowTradeForm(true);
  }

  function openScreenshotWorkflow() {
    if (currentUser?.user_metadata?.screenshot_consent_acknowledged) {
      setShowScreenshotWorkflow(true);
    } else {
      setShowScreenshotConsent(true);
    }
  }

  function closeScreenshotWorkflow() {
    setShowScreenshotWorkflow(false);
    setShowScreenshotConsent(false);
  }

  async function handleScreenshotConsent(dontShowAgain) {
    if (dontShowAgain) {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...(currentUser?.user_metadata || {}),
          screenshot_consent_acknowledged: true,
        },
      });

      if (error) {
        console.error("Could not save screenshot consent:", error);
        window.alert(`Could not save screenshot consent: ${error.message}`);
        return false;
      }

      if (data?.user) {
        setCurrentUser(data.user);
      }
    }

    setShowScreenshotConsent(false);
    setShowScreenshotWorkflow(true);
    return true;
  }

  function confirmScreenshotExtraction({ extraction, notes, conditionStates, file, aiExtraction }) {
    const numericFields = ["entry", "exit", "stopLoss", "takeProfit", "pnl"];
    const annotations = numericFields.reduce((fields, field) => ({
      ...fields,
      ...(hasAnnotation(extraction[field]) ? { [field]: annotationHint(extraction[field]) } : {}),
    }), {});
    const nextForm = {
      ...emptyForm,
      date: extraction.date || "",
      asset: extraction.asset || "",
      direction: extraction.direction?.toLowerCase() === "short"
        ? "Short"
        : extraction.direction?.toLowerCase() === "long"
        ? "Long"
        : "",
      entry: extractNumericValue(extraction.entry),
      exit: extractNumericValue(extraction.exit),
      stopLoss: extractNumericValue(extraction.stopLoss),
      takeProfit: extractNumericValue(extraction.takeProfit),
      pnl: extractNumericValue(extraction.pnl),
      strategy: extraction.strategy || "",
      notes: notes || "",
      liquiditySweep: conditionStates?.["Liquidity Sweep"] === "CONFIDENT",
      mss: conditionStates?.MSS === "CONFIDENT",
      fvg: conditionStates?.FVG === "CONFIDENT",
      displacement: conditionStates?.Displacement === "CONFIDENT",
      orderBlock: conditionStates?.["Order Block"] === "CONFIDENT",
      stochasticConfirmation: conditionStates?.["Stochastic Confirmation"] === "CONFIDENT",
    };
    setEditingTrade(null);
    setScreenshotFile(file || null);
    setScreenshotAiExtraction(aiExtraction || null);
    setScreenshotAnnotations(annotations);
    setForm(nextForm);
    setShowScreenshotWorkflow(false);
    setShowTradeForm(true);
  }

  function openEditTrade(trade) {
    setEditingTrade(trade);
    setScreenshotFile(null);
    setScreenshotAiExtraction(null);
    setScreenshotAnnotations({});

    setForm({
      ...emptyForm,

      date: trade.date || "",

      asset: trade.asset || "",

      direction:
        trade.direction || "Long",

      entry:
        trade.entry ?? "",

      exit:
        trade.exit ?? "",

      stopLoss:
        trade.stop_loss ?? "",

      takeProfit:
        trade.take_profit ?? "",

      pnl:
        trade.pnl ?? "",

      strategy:
        trade.strategy || "",

      session:
        trade.session || "New York",

      notes:
        trade.notes || "",

      liquiditySweep:
        Boolean(
          trade.liquidity_sweep
        ),

      mss:
        Boolean(trade.mss),

      fvg:
        Boolean(trade.fvg),

      displacement:
        Boolean(
          trade.displacement
        ),

      orderBlock:
        Boolean(
          trade.order_block
        ),

      stochasticConfirmation:
        Boolean(
          trade.stochastic_confirmation
        ),

      tradeQuality:
        trade.trade_quality ||
        "Valid Setup",

      ruleBreak:
        Boolean(
          trade.rule_break
        ),
    });

    setSelectedTrade(null);
    setShowTradeForm(true);
  }

  function closeTradeForm() {
    setShowTradeForm(false);
    setEditingTrade(null);
    setScreenshotFile(null);
    setScreenshotAiExtraction(null);
    setScreenshotAnnotations({});
    setForm(emptyForm);
  }

  /*
  ==================================================
  SAVE TRADE
  ==================================================
  */

  async function saveTrade(e) {
    e.preventDefault();

    if (!currentUser) {
      window.alert(
        "You must be logged in to save a trade."
      );

      return;
    }

    setSavingTrade(true);

    const tradeData = {
      user_id: currentUser.id,

      date:
        form.date || null,

      asset:
        form.asset.trim(),

      direction:
        form.direction,

      entry:
        form.entry === ""
          ? null
          : Number(form.entry),

      exit:
        form.exit === ""
          ? null
          : Number(form.exit),

      stop_loss:
        form.stopLoss === ""
          ? null
          : Number(form.stopLoss),

      take_profit:
        form.takeProfit === ""
          ? null
          : Number(form.takeProfit),

      pnl:
        form.pnl === ""
          ? 0
          : Number(form.pnl),

      strategy:
        form.strategy || null,

      session:
        form.session || "New York",

      notes:
        form.notes || null,

      liquidity_sweep:
        Boolean(
          form.liquiditySweep
        ),

      mss:
        Boolean(form.mss),

      fvg:
        Boolean(form.fvg),

      displacement:
        Boolean(
          form.displacement
        ),

      order_block:
        Boolean(
          form.orderBlock
        ),

      stochastic_confirmation:
        Boolean(
          form.stochasticConfirmation
        ),

      trade_quality:
        form.tradeQuality ||
        "Valid Setup",

      rule_break:
        Boolean(form.ruleBreak),
    };

    try {
      if (editingTrade) {
        const {
          data,
          error,
        } = await supabase
          .from("trades")
          .update(tradeData)
          .eq(
            "id",
            editingTrade.id
          )
          .eq(
            "user_id",
            currentUser.id
          )
          .select()
          .single();

        if (error) {
          console.error(
            "Could not update trade:",
            error
          );

          window.alert(
            `Could not update trade: ${error.message}`
          );

          return;
        }

        setTrades((previous) =>
          previous.map(
            (trade) =>
              trade.id ===
              editingTrade.id
                ? data
                : trade
          )
        );
      } else {
        let {
          data,
          error,
        } = await supabase
          .from("trades")
          .insert([
            tradeData,
          ])
          .select()
          .single();

        if (error) {
          console.error(
            "Could not save trade:",
            error
          );

          window.alert(
            `Could not save trade: ${error.message}`
          );

          return;
        }

        if (screenshotFile && data?.id) {
          const extension = screenshotFile.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
          const screenshotPath = `${currentUser.id}/${data.id}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("trade-screenshots")
            .upload(screenshotPath, screenshotFile, {
              contentType: screenshotFile.type || "image/jpeg",
              upsert: false,
            });

          if (uploadError) {
            console.error("Could not upload trade screenshot:", uploadError);
            window.alert(`Trade saved, but the screenshot could not be uploaded: ${uploadError.message}`);
          } else {
            const { data: updatedTrade, error: metadataError } = await supabase
              .from("trades")
              .update({
                screenshot_path: screenshotPath,
                ai_extraction: screenshotAiExtraction,
              })
              .eq("id", data.id)
              .eq("user_id", currentUser.id)
              .select()
              .single();

            if (metadataError) {
              console.error("Could not save screenshot metadata:", metadataError);
              window.alert(`Trade saved, but screenshot metadata could not be saved: ${metadataError.message}`);
            } else {
              data = updatedTrade;
            }
          }
        }

        setTrades((previous) => [
          data,
          ...previous,
        ]);
      }

      closeTradeForm();
    } catch (error) {
      console.error(
        "Unexpected trade save error:",
        error
      );

      window.alert(
        "An unexpected error occurred while saving the trade."
      );
    } finally {
      setSavingTrade(false);
    }
  }

  /*
  ==================================================
  DELETE TRADE
  ==================================================
  */

  async function deleteTrade(id) {
    const confirmed =
      window.confirm(
        "Are you sure you want to permanently delete this trade?"
      );

    if (!confirmed) {
      return;
    }

    if (!currentUser) {
      return;
    }

    try {
      const {
        error,
      } = await supabase
        .from("trades")
        .delete()
        .eq("id", id)
        .eq(
          "user_id",
          currentUser.id
        );

      if (error) {
        console.error(
          "Could not delete trade:",
          error
        );

        window.alert(
          `Could not delete trade: ${error.message}`
        );

        return;
      }

      setTrades((previous) =>
        previous.filter(
          (trade) =>
            trade.id !== id
        )
      );

      setSelectedTrade(null);
    } catch (error) {
      console.error(
        "Unexpected delete error:",
        error
      );

      window.alert(
        "An unexpected error occurred while deleting the trade."
      );
    }
  }

  /*
  ==================================================
  STATISTICS
  ==================================================
  */

  const totalTrades =
    trades.length;

  const winningTrades =
    trades.filter(
      (trade) =>
        Number(trade.pnl || 0) > 0
    ).length;

  const losingTrades =
    trades.filter(
      (trade) =>
        Number(trade.pnl || 0) < 0
    ).length;

  const netPnL =
    trades.reduce(
      (sum, trade) =>
        sum +
        Number(
          trade.pnl || 0
        ),
      0
    );

  /*
  ==================================================
  FILTERS
  ==================================================
  */

  const assets = useMemo(
    () => [
      ...new Set(
        trades
          .map(
            (trade) =>
              trade.asset
          )
          .filter(Boolean)
      ),
    ],
    [trades]
  );

  const strategies =
    useMemo(
      () => [
        ...new Set(
          trades
            .map(
              (trade) =>
                trade.strategy
            )
            .filter(Boolean)
        ),
      ],
      [trades]
    );

  const filteredTrades =
    useMemo(() => {
      return trades.filter(
        (trade) => {
          const search =
            searchTerm
              .trim()
              .toLowerCase();

          const matchesSearch =
            !search ||
            String(
              trade.asset || ""
            )
              .toLowerCase()
              .includes(
                search
              ) ||
            String(
              trade.strategy ||
                ""
            )
              .toLowerCase()
              .includes(
                search
              ) ||
            String(
              trade.notes || ""
            )
              .toLowerCase()
              .includes(
                search
              );

          const matchesAsset =
            assetFilter ===
              "All" ||
            trade.asset ===
              assetFilter;

          const matchesStrategy =
            strategyFilter ===
              "All" ||
            trade.strategy ===
              strategyFilter;

          const matchesSession =
            sessionFilter ===
              "All" ||
            trade.session ===
              sessionFilter;

          const pnl =
            Number(
              trade.pnl || 0
            );

          const matchesResult =
            resultFilter ===
              "All" ||
            (resultFilter ===
              "Winning" &&
              pnl > 0) ||
            (resultFilter ===
              "Losing" &&
              pnl < 0) ||
            (resultFilter ===
              "Breakeven" &&
              pnl === 0);

          const matchesQuality =
            qualityFilter ===
              "All" ||
            trade.trade_quality ===
              qualityFilter;

          return (
            matchesSearch &&
            matchesAsset &&
            matchesStrategy &&
            matchesSession &&
            matchesResult &&
            matchesQuality
          );
        }
      );
    }, [
      trades,
      searchTerm,
      assetFilter,
      strategyFilter,
      sessionFilter,
      resultFilter,
      qualityFilter,
    ]);

  function resetFilters() {
    setSearchTerm("");
    setAssetFilter("All");
    setStrategyFilter("All");
    setSessionFilter("All");
    setResultFilter("All");
    setQualityFilter("All");
  }

  /*
  ==================================================
  DASHBOARD
  ==================================================
  */

  function renderDashboard(page = "Overview") {
    return (
      <DayTradingDashboard
        page={page}
        trades={trades}
        loadingTrades={loadingTrades}
        onAddTrade={openAddTrade}
        onUploadScreenshot={openScreenshotWorkflow}
        selectedAsset={selectedAsset}
        onAssetChange={setSelectedAsset}
        onPageChange={setActivePage}
      />
    );

  }

  /*
  ==================================================
  JOURNAL
  ==================================================
  */

  function renderJournal() {
    return (
      <>
        <header className="topbar">
          <div>
            <p className="eyebrow">
              TRADE MANAGEMENT
            </p>

            <h1>
              Trade Journal
            </h1>
          </div>

          <button
            className="add-trade-btn"
            onClick={
              openAddTrade
            }
          >
            + Add Trade
          </button>
        </header>

        <div className="journal-summary">
          <div>
            <span>
              Total Trades
            </span>

            <strong>
              {totalTrades}
            </strong>
          </div>

          <div>
            <span>
              Winning
            </span>

            <strong className="pnl-positive">
              {winningTrades}
            </strong>
          </div>

          <div>
            <span>
              Losing
            </span>

            <strong className="pnl-negative">
              {losingTrades}
            </strong>
          </div>

          <div>
            <span>
              Net P&amp;L
            </span>

            <strong
              className={
                netPnL >= 0
                  ? "pnl-positive"
                  : "pnl-negative"
              }
            >
              {netPnL >= 0
                ? "+"
                : "-"}
              $
              {Math.abs(
                netPnL
              ).toFixed(2)}
            </strong>
          </div>
        </div>

        <div className="panel journal-panel">
          <div className="journal-toolbar">
            <div>
              <p className="eyebrow">
                EXECUTION LOG
              </p>

              <h3>
                All Trades
              </h3>
            </div>
          </div>

          <div className="journal-filters-container">
            <div className="trade-search">
              <input
                type="text"
                placeholder="Search asset, strategy or notes..."
                value={
                  searchTerm
                }
                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }
              />
            </div>

            <div className="journal-filters-grid">
              <select
                value={
                  assetFilter
                }
                onChange={(e) =>
                  setAssetFilter(
                    e.target.value
                  )
                }
              >
                <option value="All">
                  All Assets
                </option>

                {assets.map(
                  (asset) => (
                    <option
                      key={asset}
                      value={asset}
                    >
                      {asset}
                    </option>
                  )
                )}
              </select>

              <select
                value={
                  strategyFilter
                }
                onChange={(e) =>
                  setStrategyFilter(
                    e.target.value
                  )
                }
              >
                <option value="All">
                  All Strategies
                </option>

                {strategies.map(
                  (strategy) => (
                    <option
                      key={strategy}
                      value={
                        strategy
                      }
                    >
                      {strategy}
                    </option>
                  )
                )}
              </select>

              <select
                value={
                  sessionFilter
                }
                onChange={(e) =>
                  setSessionFilter(
                    e.target.value
                  )
                }
              >
                <option value="All">
                  All Sessions
                </option>

                <option value="New York">
                  New York
                </option>

                <option value="London">
                  London
                </option>

                <option value="Asia">
                  Asia
                </option>

                <option value="Overlap">
                  Overlap
                </option>
              </select>

              <select
                value={
                  resultFilter
                }
                onChange={(e) =>
                  setResultFilter(
                    e.target.value
                  )
                }
              >
                <option value="All">
                  All Results
                </option>

                <option value="Winning">
                  Winning
                </option>

                <option value="Losing">
                  Losing
                </option>

                <option value="Breakeven">
                  Breakeven
                </option>
              </select>

              <select
                value={
                  qualityFilter
                }
                onChange={(e) =>
                  setQualityFilter(
                    e.target.value
                  )
                }
              >
                <option value="All">
                  All Quality
                </option>

                <option value="A+ Setup">
                  A+ Setup
                </option>

                <option value="Valid Setup">
                  Valid Setup
                </option>

                <option value="Emotional / Rule Break">
                  Emotional / Rule Break
                </option>
              </select>

              <button
                className="reset-filter-btn"
                onClick={
                  resetFilters
                }
              >
                Reset
              </button>
            </div>

            <div className="filter-results">
              Showing{" "}
              <strong>
                {
                  filteredTrades.length
                }
              </strong>{" "}
              of{" "}
              <strong>
                {trades.length}
              </strong>{" "}
              trades
            </div>
          </div>

          {loadingTrades ? (
            <div className="journal-empty">
              <h3>
                Loading your trades...
              </h3>
            </div>
          ) : filteredTrades.length ===
            0 ? (
            <div className="journal-empty">
              <div className="empty-icon">
                {trades.length ===
                0
                  ? "+"
                  : "⌕"}
              </div>

              <h3>
                {trades.length ===
                0
                  ? "No trades recorded"
                  : "No matching trades"}
              </h3>

              <p>
                {trades.length ===
                0
                  ? "Start building your trading history by adding your first trade."
                  : "Try changing your search or filters."}
              </p>

              {trades.length ===
                0 && (
                <button
                  className="secondary-btn"
                  onClick={
                    openAddTrade
                  }
                >
                  Add Trade
                </button>
              )}
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="trade-table">
                <thead>
                  <tr>
                    <th>
                      Date
                    </th>

                    <th>
                      Asset
                    </th>

                    <th>
                      Direction
                    </th>

                    <th>
                      Session
                    </th>

                    <th>
                      Strategy
                    </th>

                    <th>
                      Quality
                    </th>

                    <th>
                      P&amp;L
                    </th>

                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTrades.map(
                    (trade) => {
                      const pnl =
                        Number(
                          trade.pnl ||
                            0
                        );

                      return (
                        <tr
                          key={
                            trade.id
                          }
                        >
                          <td>
                            {trade.date ||
                              "-"}
                          </td>

                          <td>
                            <strong>
                              {trade.asset ||
                                "-"}
                            </strong>
                          </td>

                          <td>
                            <span
                              className={`direction ${
                                trade.direction ===
                                "Long"
                                  ? "long"
                                  : "short"
                              }`}
                            >
                              {
                                trade.direction
                              }
                            </span>
                          </td>

                          <td>
                            {trade.session ||
                              "-"}
                          </td>

                          <td>
                            {trade.strategy ||
                              "-"}
                          </td>

                          <td>
                            {trade.trade_quality ||
                              "-"}
                          </td>

                          <td
                            className={
                              pnl >= 0
                                ? "pnl-positive"
                                : "pnl-negative"
                            }
                          >
                            {pnl >= 0
                              ? "+"
                              : "-"}
                            $
                            {Math.abs(
                              pnl
                            ).toFixed(
                              2
                            )}
                          </td>

                          <td>
                            <div className="trade-actions">
                              <button
                                className="table-action-btn"
                                onClick={() =>
                                  setSelectedTrade(
                                    trade
                                  )
                                }
                              >
                                View
                              </button>

                              <button
                                className="table-action-btn"
                                onClick={() =>
                                  openEditTrade(
                                    trade
                                  )
                                }
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  /*
  ==================================================
  TRADE DETAILS
  ==================================================
  */

  function renderTradeDetails() {
    if (!selectedTrade) {
      return null;
    }

    const pnl =
      Number(
        selectedTrade.pnl || 0
      );

    const checklist = [
      [
        "Liquidity Sweep",
        selectedTrade.liquidity_sweep,
      ],
      [
        "MSS",
        selectedTrade.mss,
      ],
      [
        "FVG",
        selectedTrade.fvg,
      ],
      [
        "Strong Displacement",
        selectedTrade.displacement,
      ],
      [
        "Order Block",
        selectedTrade.order_block,
      ],
      [
        "Stochastic Confirmation",
        selectedTrade.stochastic_confirmation,
      ],
    ];

    return (
      <div
        className="modal-overlay"
        onClick={() =>
          setSelectedTrade(null)
        }
      >
        <div
          className="trade-details-modal"
          onClick={(e) =>
            e.stopPropagation()
          }
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">
                TRADE REVIEW
              </p>

              <h2>
                {selectedTrade.asset ||
                  "Trade Details"}
              </h2>
            </div>

            <button
              className="close-btn"
              onClick={() =>
                setSelectedTrade(
                  null
                )
              }
            >
              ×
            </button>
          </div>

          <div className="trade-detail-result">
            <div>
              <span>
                Trade Result
              </span>

              <strong
                className={
                  pnl >= 0
                    ? "pnl-positive"
                    : "pnl-negative"
                }
              >
                {pnl >= 0
                  ? "+"
                  : "-"}
                $
                {Math.abs(
                  pnl
                ).toFixed(2)}
              </strong>
            </div>

            <span
              className={`direction ${
                selectedTrade.direction ===
                "Long"
                  ? "long"
                  : "short"
              }`}
            >
              {
                selectedTrade.direction
              }
            </span>
          </div>

          <div className="trade-detail-grid">
            <div>
              <span>Date</span>

              <strong>
                {selectedTrade.date ||
                  "-"}
              </strong>
            </div>

            <div>
              <span>Session</span>

              <strong>
                {selectedTrade.session ||
                  "-"}
              </strong>
            </div>

            <div>
              <span>Strategy</span>

              <strong>
                {selectedTrade.strategy ||
                  "-"}
              </strong>
            </div>

            <div>
              <span>
                Trade Quality
              </span>

              <strong>
                {selectedTrade.trade_quality ||
                  "-"}
              </strong>
            </div>

            <div>
              <span>Entry</span>

              <strong>
                {selectedTrade.entry ??
                  "-"}
              </strong>
            </div>

            <div>
              <span>Exit</span>

              <strong>
                {selectedTrade.exit ??
                  "-"}
              </strong>
            </div>

            <div>
              <span>
                Stop Loss
              </span>

              <strong>
                {selectedTrade.stop_loss ??
                  "-"}
              </strong>
            </div>

            <div>
              <span>
                Take Profit
              </span>

              <strong>
                {selectedTrade.take_profit ??
                  "-"}
              </strong>
            </div>
          </div>

          <div className="detail-section">
            <p className="eyebrow">
              SETUP CHECKLIST
            </p>

            <div className="detail-checklist">
              {checklist.map(
                ([label, checked]) => (
                  <div
                    key={label}
                    className={
                      checked
                        ? "detail-check active"
                        : "detail-check"
                    }
                  >
                    <span>
                      {checked
                        ? "✓"
                        : "—"}
                    </span>

                    <strong>
                      {label}
                    </strong>
                  </div>
                )
              )}
            </div>
          </div>

          {selectedTrade.screenshot_path && (
            <div className="detail-section">
              <p className="eyebrow">SCREENSHOT</p>
              {selectedTradeScreenshotUrl ? (
                <img className="trade-detail-screenshot" src={selectedTradeScreenshotUrl} alt="Saved trade screenshot" />
              ) : (
                <p className="trade-notes">Loading private screenshot...</p>
              )}
            </div>
          )}

          <div className="detail-section">
            <p className="eyebrow">
              NOTES
            </p>

            <div className="trade-notes">
              {selectedTrade.notes ||
                "No notes were added to this trade."}
            </div>
          </div>

          {selectedTrade.rule_break && (
            <div className="rule-warning">
              ⚠ This trade was marked
              as a rule break.
            </div>
          )}

          <div className="trade-detail-actions">
            <button
              className="cancel-btn"
              onClick={() =>
                openEditTrade(
                  selectedTrade
                )
              }
            >
              Edit Trade
            </button>

            <button
              className="delete-btn"
              onClick={() =>
                deleteTrade(
                  selectedTrade.id
                )
              }
            >
              Delete Trade
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
  ==================================================
  TRADE FORM
  ==================================================
  */

  function renderTradeForm() {
    if (!showTradeForm) {
      return null;
    }

    return (
      <div
        className="modal-overlay"
        onClick={closeTradeForm}
      >
        <div
          className="trade-modal"
          onClick={(e) =>
            e.stopPropagation()
          }
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">
                TRADE ENTRY
              </p>

              <h2>
                {editingTrade
                  ? "Edit Trade"
                  : "Add New Trade"}
              </h2>
            </div>

            <button
              type="button"
              className="close-btn"
              onClick={
                closeTradeForm
              }
            >
              ×
            </button>
          </div>

          <form
            onSubmit={saveTrade}
          >
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="date">
                  Date
                </label>

                <input
                  id="date"
                  type="date"
                  name="date"
                  value={
                    form.date
                  }
                  onChange={
                    handleChange
                  }
                />
                {screenshotAnnotations.entry && <span className="field-ai-hint">{screenshotAnnotations.entry}</span>}
              </div>

              <div className="form-field">
                <label htmlFor="asset">
                  Asset
                </label>

                <input
                  id="asset"
                  type="text"
                  name="asset"
                  placeholder="XAUUSD"
                  value={
                    form.asset
                  }
                  onChange={
                    handleChange
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="direction">
                  Direction
                </label>

                <select
                  id="direction"
                  name="direction"
                  value={
                    form.direction
                  }
                  onChange={
                    handleChange
                  }
                >
                  <option value="Long">
                    Long
                  </option>

                  <option value="Short">
                    Short
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="session">
                  Session
                </label>

                <select
                  id="session"
                  name="session"
                  value={
                    form.session
                  }
                  onChange={
                    handleChange
                  }
                >
                  <option value="New York">
                    New York
                  </option>

                  <option value="London">
                    London
                  </option>

                  <option value="Asia">
                    Asia
                  </option>

                  <option value="Overlap">
                    Overlap
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="entry">
                  Entry
                </label>

                <input
                  id="entry"
                  type="number"
                  step="any"
                  name="entry"
                  placeholder="3350.50"
                  value={
                    form.entry
                  }
                  onChange={
                    handleChange
                  }
                />
                {screenshotAnnotations.entry && <span className="field-ai-hint">{screenshotAnnotations.entry}</span>}
              </div>

              <div className="form-field">
                <label htmlFor="exit">
                  Exit
                </label>

                <input
                  id="exit"
                  type="number"
                  step="any"
                  name="exit"
                  placeholder="3360.50"
                  value={
                    form.exit
                  }
                  onChange={
                    handleChange
                  }
                />
                {screenshotAnnotations.exit && <span className="field-ai-hint">{screenshotAnnotations.exit}</span>}
              </div>

              <div className="form-field">
                <label htmlFor="stopLoss">
                  Stop Loss
                </label>

                <input
                  id="stopLoss"
                  type="number"
                  step="any"
                  name="stopLoss"
                  placeholder="3345.00"
                  value={
                    form.stopLoss
                  }
                  onChange={
                    handleChange
                  }
                />
                {screenshotAnnotations.stopLoss && <span className="field-ai-hint">{screenshotAnnotations.stopLoss}</span>}
              </div>

              <div className="form-field">
                <label htmlFor="takeProfit">
                  Take Profit
                </label>

                <input
                  id="takeProfit"
                  type="number"
                  step="any"
                  name="takeProfit"
                  placeholder="3365.00"
                  value={
                    form.takeProfit
                  }
                  onChange={
                    handleChange
                  }
                />
                {screenshotAnnotations.takeProfit && <span className="field-ai-hint">{screenshotAnnotations.takeProfit}</span>}
              </div>

              <div className="form-field">
                <label htmlFor="pnl">
                  P&amp;L ($)
                </label>

                <input
                  id="pnl"
                  type="number"
                  step="any"
                  name="pnl"
                  placeholder="150"
                  value={
                    form.pnl
                  }
                  onChange={
                    handleChange
                  }
                  required
                />
                {screenshotAnnotations.pnl && <span className="field-ai-hint">{screenshotAnnotations.pnl}</span>}
              </div>

              <div className="form-field">
                <label htmlFor="strategy">
                  Strategy
                </label>

                <select
                  id="strategy"
                  name="strategy"
                  value={
                    form.strategy
                  }
                  onChange={
                    handleChange
                  }
                >
                  <option value="">
                    Select strategy
                  </option>

                  <option value="Main Strategy">
                    Main Strategy
                  </option>

                  <option value="Backup Strategy">
                    Backup Strategy
                  </option>
                </select>
              </div>

              <div className="checklist-section">
                <div className="section-title">
                  <p className="eyebrow">
                    MARKET CONTEXT
                  </p>

                  <h3>
                    Setup Checklist
                  </h3>

                  <span>
                    Mark the conditions
                    that were actually
                    present.
                  </span>
                </div>

                <div className="checklist-grid">
                  {[
                    [
                      "liquiditySweep",
                      "Liquidity Sweep",
                    ],
                    [
                      "mss",
                      "MSS",
                    ],
                    [
                      "fvg",
                      "FVG",
                    ],
                    [
                      "displacement",
                      "Strong Displacement",
                    ],
                    [
                      "orderBlock",
                      "Order Block",
                    ],
                    [
                      "stochasticConfirmation",
                      "Stochastic Confirmation",
                    ],
                  ].map(
                    ([name, label]) => (
                      <label
                        className="check-item"
                        key={name}
                      >
                        <input
                          type="checkbox"
                          name={name}
                          checked={Boolean(
                            form[name]
                          )}
                          onChange={
                            handleCheckboxChange
                          }
                        />

                        <span>
                          {label}
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div className="trade-quality-section">
                <div className="section-title">
                  <p className="eyebrow">
                    EXECUTION QUALITY
                  </p>

                  <h3>
                    Trade Quality
                  </h3>
                </div>

                <div className="quality-grid">
                  {[
                    "A+ Setup",
                    "Valid Setup",
                    "Emotional / Rule Break",
                  ].map(
                    (quality) => (
                      <label
                        className="quality-option"
                        key={quality}
                      >
                        <input
                          type="radio"
                          name="tradeQuality"
                          value={
                            quality
                          }
                          checked={
                            form.tradeQuality ===
                            quality
                          }
                          onChange={
                            handleChange
                          }
                        />

                        <span>
                          {quality}
                        </span>
                      </label>
                    )
                  )}
                </div>

                <label className="rule-break-check">
                  <input
                    type="checkbox"
                    name="ruleBreak"
                    checked={Boolean(
                      form.ruleBreak
                    )}
                    onChange={
                      handleCheckboxChange
                    }
                  />

                  <span>
                    I broke one or more
                    trading rules
                  </span>
                </label>
              </div>

              <div className="form-field full-width">
                <label htmlFor="notes">
                  Notes
                </label>

                <textarea
                  id="notes"
                  name="notes"
                  placeholder="Why did you take this trade?"
                  value={
                    form.notes
                  }
                  onChange={
                    handleChange
                  }
                  rows="4"
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={
                  closeTradeForm
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="save-btn"
                disabled={
                  savingTrade
                }
              >
                {savingTrade
                  ? "Saving..."
                  : editingTrade
                  ? "Save Changes"
                  : "Save Trade"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /*
  ==================================================
  MODE + NAVIGATION
  ==================================================
  */

  const isDayTrading = activeMode === "DAY TRADING";

  const navigationItems = isDayTrading
    ? [
      { page: "Overview", label: "Overview", icon: "OV" },
      { page: "Markets", label: "Market", icon: "MK" },
      { page: "Chart", label: "Chart", icon: "CH" },
      { page: "Strategy", label: "Strategy", icon: "SY" },
      { page: "Strategy Lab", label: "Strategy Lab", icon: "SL" },
      { page: "Backtesting", label: "Backtesting", icon: "BT" },
      { page: "Events & News", label: "Events & News", icon: "EV" },
      { page: "Sentiment", label: "Sentiment", icon: "SN" },
      { page: "Trades", label: "Trades", icon: "TR" },
      { page: "Analytics", label: "Analytics", icon: "AN" },
      ]
    : [
        { page: "Overview", label: "Overview", icon: "OV" },
        { page: "Portfolio", label: "Portfolio", icon: "PF" },
        { page: "Watchlist", label: "Watchlist", icon: "WL" },
        { page: "Stocks to Research", label: "Stocks to Research", icon: "RQ" },
        { page: "Opportunities", label: "Opportunities", icon: "OP" },
        { page: "Analyst Radar", label: "Analyst Radar", icon: "AR" },
        { page: "Research", label: "Research", icon: "RS" },
        { page: "Fundamentals", label: "Fundamentals", icon: "FN" },
        { page: "Valuation", label: "Valuation", icon: "VL" },
      ];

  function handleModeChange(mode) {
    setActiveMode(mode);
    setShowNavigationMenu(false);

    if (mode === "DAY TRADING") {
      setActivePage("Overview");
      return;
    }

    setActivePage("Overview");
  }

  /*
  ==================================================
  NOT LOGGED IN
  ==================================================
  */

  if (!currentUser && !loadingTrades) {
    return (
      <Auth
        onAuthSuccess={
          handleAuthSuccess
        }
      />
    );
  }

  /*
  ==================================================
  LOADING
  ==================================================
  */

  if (!currentUser && loadingTrades) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo">
              TC
            </div>

            <div>
              <h1>
                Trade Catalyst
              </h1>

              <p>
                Trading Performance
              </p>
            </div>
          </div>

          <div className="auth-heading">
            <p className="eyebrow">
              TRADE CATALYST
            </p>

            <h2>
              Loading...
            </h2>

            <p>
              Checking your secure
              session.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /*
  ==================================================
  APP
  ==================================================
  */

  return (
    <div className={`app ${isDayTrading ? "day-trading-mode" : "investing-mode"}`}>
      <header className="app-header">
        <div className="app-header-left">
          <div className="nav-menu-wrap">
            <button
              type="button"
              className="nav-menu-trigger"
              aria-expanded={showNavigationMenu}
              aria-haspopup="menu"
              onClick={() => {
                setShowNavigationMenu((previous) => !previous);
                setShowProfileMenu(false);
              }}
            >
              <span className="nav-menu-icon" aria-hidden="true">☰</span>
              <span>{isDayTrading ? "Trading views" : "Investing views"}</span>
            </button>

            {showNavigationMenu && (
              <div className="nav-dropdown" role="menu">
                <p className="nav-dropdown-label">{isDayTrading ? "DAY TRADING" : "INVESTING"}</p>
                {navigationItems.map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.page}
                    className={`nav-dropdown-item ${activePage === item.page ? "active" : ""}`}
                    onClick={() => {
                      setActivePage(item.page);
                      setShowNavigationMenu(false);
                    }}
                  >
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mode-switcher" aria-label="Application mode switch">
            <button type="button" className={`mode-btn ${isDayTrading ? "active" : ""}`} onClick={() => handleModeChange("DAY TRADING")}>DAY TRADING</button>
            <button type="button" className={`mode-btn ${!isDayTrading ? "active" : ""}`} onClick={() => handleModeChange("INVESTING")}>INVESTING</button>
          </div>
        </div>

        <div className="logo app-header-brand">
          <span>TC</span>
          <div>
            <h2>Trade Catalyst</h2>
            <p>Trading Performance</p>
          </div>
        </div>

        <div className="profile-menu-wrap">
          <button
            type="button"
            className="profile-trigger"
            aria-expanded={showProfileMenu}
            aria-haspopup="menu"
            onClick={() => {
              setShowProfileMenu((previous) => !previous);
              setShowNavigationMenu(false);
            }}
          >
            <span className="profile-avatar" aria-hidden="true">{currentUser?.email?.charAt(0).toUpperCase() || "U"}</span>
            <span className="profile-email">{currentUser?.email || "Account"}</span>
            <span aria-hidden="true">⌄</span>
          </button>

          {showProfileMenu && (
            <div className="profile-dropdown" role="menu">
              <button type="button" role="menuitem" className={`profile-dropdown-item ${activePage === "Settings" ? "active" : ""}`} onClick={() => { setActivePage("Settings"); setShowProfileMenu(false); }}>Settings</button>
              <button type="button" role="menuitem" className={`profile-dropdown-item ${activePage === "Privacy" ? "active" : ""}`} onClick={() => { setActivePage("Privacy"); setShowProfileMenu(false); }}>Privacy Notice</button>
              <button type="button" role="menuitem" className="profile-dropdown-item" onClick={handleLogout}>Sign Out</button>
            </div>
          )}
        </div>
      </header>

      <TickerBar />

      <Suspense fallback={<LazyViewFallback />}>
        <main className="main-content">
          {isDayTrading && ["Overview", "Markets", "Strategy", "Chart"].includes(activePage) && renderDashboard(activePage)}

          {!isDayTrading && <InvestingWorkspace page={activePage} />}

          {isDayTrading && activePage === "Trades" && renderJournal()}

          {activePage ===
            "Analytics" && (
            <Analytics
              trades={trades}
            />
          )}

          {isDayTrading && activePage === "Events & News" && (
            <EconomicCalendar />
          )}

          {isDayTrading && activePage === "Sentiment" && (
            <MarketSentiment />
          )}

          {isDayTrading && activePage === "Strategy Lab" && (
            <StrategyLab initialView="library" strategies={strategyLibrary} onStrategiesChange={setStrategyLibrary} />
          )}

          {isDayTrading && activePage === "Backtesting" && (
            <StrategyLab initialView="backtesting" strategies={strategyLibrary} onStrategiesChange={setStrategyLibrary} />
          )}

          {activePage ===
            "Settings" && (
            <div className="coming-soon">
              <p className="eyebrow">
                ACCOUNT SETTINGS
              </p>

              <h1>
                Settings
              </h1>

              <p>
                Signed in as{" "}
                {currentUser.email}
              </p>

              <button
                className="delete-btn"
                onClick={
                  handleLogout
                }
                style={{
                  marginTop: "20px",
                }}
              >
                Sign Out
              </button>
            </div>
          )}

          {activePage === "Privacy" && <PrivacyNotice />}
        </main>
      </Suspense>

      {renderTradeForm()}

      {renderTradeDetails()}

      {(showScreenshotWorkflow || showScreenshotConsent) && (
        <Suspense fallback={<LazyViewFallback />}>
          <ScreenshotTradeWorkflow
            onClose={closeScreenshotWorkflow}
            onConfirm={confirmScreenshotExtraction}
            showConsent={showScreenshotConsent}
            onConsent={handleScreenshotConsent}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;