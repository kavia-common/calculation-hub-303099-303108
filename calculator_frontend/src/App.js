import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://localhost:3001";

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  // Keep UI clean; avoid scientific for typical inputs
  return String(n);
}

function isOperator(token) {
  return token === "+" || token === "-" || token === "*" || token === "/";
}

// PUBLIC_INTERFACE
function App() {
  const [display, setDisplay] = useState("0");
  const [pendingA, setPendingA] = useState(null);
  const [pendingOp, setPendingOp] = useState(null);
  const [shouldResetDisplay, setShouldResetDisplay] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const expressionPreview = useMemo(() => {
    if (pendingA === null || pendingOp === null) return "";
    return `${formatNumber(pendingA)} ${pendingOp}`;
  }, [pendingA, pendingOp]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history?limit=50`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || `Failed to load history (HTTP ${res.status})`);
      }
      const data = await res.json();
      setHistory(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(e.message || "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const safeSetError = useCallback((msg) => {
    setError(msg);
    if (msg) {
      window.clearTimeout(safeSetError._t);
      safeSetError._t = window.setTimeout(() => setError(""), 4500);
    }
  }, []);
  safeSetError._t = safeSetError._t || 0;

  const appendDigit = useCallback(
    (digit) => {
      safeSetError("");
      setDisplay((prev) => {
        if (shouldResetDisplay) return digit;
        if (prev === "0" && digit !== ".") return digit;
        if (digit === "." && prev.includes(".")) return prev;
        return prev + digit;
      });
      setShouldResetDisplay(false);
    },
    [safeSetError, shouldResetDisplay]
  );

  const clearAll = useCallback(() => {
    safeSetError("");
    setDisplay("0");
    setPendingA(null);
    setPendingOp(null);
    setShouldResetDisplay(false);
  }, [safeSetError]);

  const backspace = useCallback(() => {
    safeSetError("");
    setDisplay((prev) => {
      if (shouldResetDisplay) return "0";
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
  }, [safeSetError, shouldResetDisplay]);

  const toggleSign = useCallback(() => {
    safeSetError("");
    setDisplay((prev) => {
      if (prev === "0") return "0";
      if (prev.startsWith("-")) return prev.slice(1);
      return `-${prev}`;
    });
  }, [safeSetError]);

  const toNumber = useCallback((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }, []);

  const callCalculate = useCallback(async (a, b, op) => {
    const res = await fetch(`${API_BASE_URL}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a, b, op }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || `Calculation failed (HTTP ${res.status})`);
    }
    return data;
  }, []);

  const chooseOperator = useCallback(
    async (op) => {
      safeSetError("");

      const current = toNumber(display);
      if (current === null) {
        safeSetError("Invalid number.");
        return;
      }

      // If user taps an operator after having a pending op, compute first (chain calc)
      if (pendingA !== null && pendingOp !== null && !shouldResetDisplay) {
        setBusy(true);
        try {
          const out = await callCalculate(pendingA, current, pendingOp);
          setDisplay(formatNumber(out.result));
          setPendingA(out.result);
          setPendingOp(op);
          setShouldResetDisplay(true);
          await fetchHistory();
        } catch (e) {
          safeSetError(e.message || "Calculation failed.");
        } finally {
          setBusy(false);
        }
        return;
      }

      setPendingA(current);
      setPendingOp(op);
      setShouldResetDisplay(true);
    },
    [
      callCalculate,
      display,
      fetchHistory,
      pendingA,
      pendingOp,
      safeSetError,
      shouldResetDisplay,
      toNumber,
    ]
  );

  const equals = useCallback(async () => {
    safeSetError("");

    if (pendingA === null || pendingOp === null) return;

    const b = toNumber(display);
    if (b === null) {
      safeSetError("Invalid number.");
      return;
    }

    setBusy(true);
    try {
      const out = await callCalculate(pendingA, b, pendingOp);
      setDisplay(formatNumber(out.result));
      setPendingA(null);
      setPendingOp(null);
      setShouldResetDisplay(true);
      await fetchHistory();
    } catch (e) {
      safeSetError(e.message || "Calculation failed.");
    } finally {
      setBusy(false);
    }
  }, [callCalculate, display, fetchHistory, pendingA, pendingOp, safeSetError, toNumber]);

  const clearHistory = useCallback(async () => {
    setBusy(true);
    safeSetError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `Failed to clear history (HTTP ${res.status})`);
      await fetchHistory();
    } catch (e) {
      safeSetError(e.message || "Failed to clear history.");
    } finally {
      setBusy(false);
    }
  }, [fetchHistory, safeSetError]);

  const onKeyDown = useCallback(
    (e) => {
      if (busy) return;

      const key = e.key;
      if ((key >= "0" && key <= "9") || key === ".") {
        e.preventDefault();
        appendDigit(key);
        return;
      }
      if (key === "Enter" || key === "=") {
        e.preventDefault();
        equals();
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        clearAll();
        return;
      }
      if (key === "+" || key === "-" || key === "*" || key === "/") {
        e.preventDefault();
        chooseOperator(key);
      }
    },
    [appendDigit, backspace, busy, chooseOperator, clearAll, equals]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (
    <div className="page">
      <div className="appShell">
        <aside className="historyPanel" aria-label="Calculation history">
          <div className="historyHeader">
            <div>
              <h2 className="historyTitle">History</h2>
              <p className="historySubtitle">Latest calculations</p>
            </div>

            <button
              className="btn btnSecondary"
              onClick={clearHistory}
              disabled={busy || historyLoading || history.length === 0}
              type="button"
            >
              Clear
            </button>
          </div>

          <div className="historyBody">
            {historyLoading ? (
              <div className="historyEmpty">Loading…</div>
            ) : history.length === 0 ? (
              <div className="historyEmpty">No history yet.</div>
            ) : (
              <ul className="historyList">
                {history.map((h) => (
                  <li key={h.id} className="historyItem">
                    <div className="historyExpr">
                      <span className="mono">{formatNumber(h.a)}</span>{" "}
                      <span className="op">{h.op}</span>{" "}
                      <span className="mono">{formatNumber(h.b)}</span>
                    </div>
                    <div className="historyResult">
                      <span className="eq">=</span>{" "}
                      <span className="mono strong">{formatNumber(h.result)}</span>
                    </div>
                    <div className="historyMeta">{new Date(h.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="calculatorPanel" aria-label="Calculator">
          <div className="calcHeader">
            <div>
              <h1 className="calcTitle">Calculator</h1>
              <p className="calcHint">Keyboard supported • ESC clears</p>
            </div>
            <div className="statusDot" aria-hidden="true" title="Connected to backend on port 3001" />
          </div>

          <div className="display" role="group" aria-label="Display">
            <div className="displayTop">
              <div className="preview" aria-label="Pending expression">
                {expressionPreview}
              </div>
              <div className="badge" aria-label="API base URL">
                {API_BASE_URL}
              </div>
            </div>
            <div className="displayMain" aria-label="Current value">
              {display}
            </div>
            {error ? (
              <div className="errorBanner" role="alert">
                {error}
              </div>
            ) : null}
          </div>

          <div className="keypad" role="group" aria-label="Keypad">
            <button className="key keyUtility" onClick={clearAll} disabled={busy} type="button">
              AC
            </button>
            <button className="key keyUtility" onClick={backspace} disabled={busy} type="button">
              ⌫
            </button>
            <button className="key keyUtility" onClick={toggleSign} disabled={busy} type="button">
              ±
            </button>
            <button
              className="key keyOperator"
              onClick={() => chooseOperator("/")}
              disabled={busy}
              type="button"
            >
              ÷
            </button>

            <button className="key" onClick={() => appendDigit("7")} disabled={busy} type="button">
              7
            </button>
            <button className="key" onClick={() => appendDigit("8")} disabled={busy} type="button">
              8
            </button>
            <button className="key" onClick={() => appendDigit("9")} disabled={busy} type="button">
              9
            </button>
            <button
              className="key keyOperator"
              onClick={() => chooseOperator("*")}
              disabled={busy}
              type="button"
            >
              ×
            </button>

            <button className="key" onClick={() => appendDigit("4")} disabled={busy} type="button">
              4
            </button>
            <button className="key" onClick={() => appendDigit("5")} disabled={busy} type="button">
              5
            </button>
            <button className="key" onClick={() => appendDigit("6")} disabled={busy} type="button">
              6
            </button>
            <button
              className="key keyOperator"
              onClick={() => chooseOperator("-")}
              disabled={busy}
              type="button"
            >
              −
            </button>

            <button className="key" onClick={() => appendDigit("1")} disabled={busy} type="button">
              1
            </button>
            <button className="key" onClick={() => appendDigit("2")} disabled={busy} type="button">
              2
            </button>
            <button className="key" onClick={() => appendDigit("3")} disabled={busy} type="button">
              3
            </button>
            <button
              className="key keyOperator"
              onClick={() => chooseOperator("+")}
              disabled={busy}
              type="button"
            >
              +
            </button>

            <button className="key keyWide" onClick={() => appendDigit("0")} disabled={busy} type="button">
              0
            </button>
            <button className="key" onClick={() => appendDigit(".")} disabled={busy} type="button">
              .
            </button>
            <button className="key keyEquals" onClick={equals} disabled={busy} type="button">
              =
            </button>
          </div>

          <div className="footerNote">
            Tip: click an operator to chain calculations. Errors (e.g., divide-by-zero) are shown above.
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
