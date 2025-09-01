import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

// === UPDATE THESE IF YOU REDEPLOY ===
const AMM_A = "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0"; // AMM #1
const AMM_B = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"; // AMM #2

// === ABI that matches YOUR AMM.sol ===
const AMM_ABI = [
  "function token1() view returns (address)",
  "function token2() view returns (address)",

  // quote helpers in your AMM
  "function calculateToken1Swap(uint256 _token1Amount) view returns (uint256 token2Amount)",
  "function calculateToken2Swap(uint256 _token2Amount) view returns (uint256 token1Amount)",

  // directional swaps in your AMM
  "function swapToken1(uint256 _token1Amount) returns (uint256 token2Amount)",
  "function swapToken2(uint256 _token2Amount) returns (uint256 token1Amount)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

function fmt(x, d = 4) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

export default function Aggregator() {
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);

  const [ammA, setAmmA] = useState(null);
  const [ammB, setAmmB] = useState(null);

  const [t1, setT1] = useState(null);
  const [t2, setT2] = useState(null);
  const [t1Dec, setT1Dec] = useState(18);
  const [t2Dec, setT2Dec] = useState(18);
  const [t1Sym, setT1Sym] = useState("T1");
  const [t2Sym, setT2Sym] = useState("T2");

  const [resA, setResA] = useState({ r1: 0, r2: 0 });
  const [resB, setResB] = useState({ r1: 0, r2: 0 });

  const [dir, setDir] = useState("t1_to_t2");
  const [amount, setAmount] = useState("1000");
  const [slippage, setSlippage] = useState("0.5"); // percent

  const parsedAmount = useMemo(() => Number(amount || "0"), [amount]);
  const [quotes, setQuotes] = useState({ a: 0, b: 0, best: "A" });

  useEffect(() => {
    (async () => {
      if (!window.ethereum) { alert("Please install MetaMask"); return; }
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const s = provider.getSigner();
      const addr = await s.getAddress();
      setSigner(s); setAccount(addr);

      // sanity: AMM code present
      const [codeA, codeB] = await Promise.all([provider.getCode(AMM_A), provider.getCode(AMM_B)]);
      if (codeA === "0x" || codeB === "0x") { alert("AMM address has no code. Redeploy & update addresses."); return; }

      const a = new ethers.Contract(AMM_A, AMM_ABI, s);
      const b = new ethers.Contract(AMM_B, AMM_ABI, s);
      setAmmA(a); setAmmB(b);

      // discover tokens from AMM A
      const _t1 = await a.token1();
      const _t2 = await a.token2();
      const [code1, code2] = await Promise.all([provider.getCode(_t1), provider.getCode(_t2)]);
      if (code1 === "0x" || code2 === "0x") { alert("Token address has no code. Did you restart the node?"); return; }
      setT1(_t1); setT2(_t2);

      // token meta
      const t1c = new ethers.Contract(_t1, ERC20_ABI, s);
      const t2c = new ethers.Contract(_t2, ERC20_ABI, s);
      const [d1, d2, sym1, sym2] = await Promise.all([
        t1c.decimals(), t2c.decimals(), t1c.symbol(), t2c.symbol()
      ]);
      setT1Dec(Number(d1)); setT2Dec(Number(d2)); setT1Sym(sym1); setT2Sym(sym2);

      // initial reserves from actual balances
      const [a_r1, a_r2, b_r1, b_r2] = await Promise.all([
        t1c.balanceOf(AMM_A), t2c.balanceOf(AMM_A),
        t1c.balanceOf(AMM_B), t2c.balanceOf(AMM_B),
      ]);
      setResA({ r1: Number(ethers.utils.formatUnits(a_r1, d1)), r2: Number(ethers.utils.formatUnits(a_r2, d2)) });
      setResB({ r1: Number(ethers.utils.formatUnits(b_r1, d1)), r2: Number(ethers.utils.formatUnits(b_r2, d2)) });

      window.ethereum.on("chainChanged", () => window.location.reload());
      window.ethereum.on("accountsChanged", async () => {
        const s2 = provider.getSigner();
        setSigner(s2);
        setAccount(await s2.getAddress());
      });
    })();
  }, []);

  // Quotes from your AMM's VIEW functions (precise)
  useEffect(() => {
    (async () => {
      try {
        if (!ammA || !ammB || !t1 || !t2 || parsedAmount <= 0) {
          setQuotes({ a: 0, b: 0, best: "A" });
          return;
        }
        const decIn = dir === "t1_to_t2" ? t1Dec : t2Dec;
        const outDec = dir === "t1_to_t2" ? t2Dec : t1Dec;
        const amountWei = ethers.utils.parseUnits(String(parsedAmount), decIn);

        let outAWei, outBWei;
        if (dir === "t1_to_t2") {
          [outAWei, outBWei] = await Promise.all([
            ammA.callStatic.calculateToken1Swap(amountWei),
            ammB.callStatic.calculateToken1Swap(amountWei),
          ]);
        } else {
          [outAWei, outBWei] = await Promise.all([
            ammA.callStatic.calculateToken2Swap(amountWei),
            ammB.callStatic.calculateToken2Swap(amountWei),
          ]);
        }

        const a = Number(ethers.utils.formatUnits(outAWei, outDec));
        const b = Number(ethers.utils.formatUnits(outBWei, outDec));
        setQuotes({ a, b, best: a >= b ? "A" : "B" });
      } catch (e) {
        console.warn("Quote error:", e);
      }
    })();
  }, [ammA, ammB, t1, t2, t1Dec, t2Dec, dir, parsedAmount]);

  // Auto-refresh reserves every 5s
  useEffect(() => {
    if (!signer || !t1 || !t2) return;
    const id = setInterval(() => { trulyRefreshReserves(); }, 5000);
    return () => clearInterval(id);
  }, [signer, t1, t2]);

  async function approveIfNeeded(tokenAddr, spender, amountWei) {
    const erc = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    const current = await erc.allowance(account, spender);
    if (current.gte(amountWei)) return;
    const tx = await erc.approve(spender, amountWei);
    await tx.wait();
  }

  async function trulyRefreshReserves() {
    if (!signer || !t1 || !t2) return;
    const t1c = new ethers.Contract(t1, ERC20_ABI, signer);
    const t2c = new ethers.Contract(t2, ERC20_ABI, signer);
    const [a_r1, a_r2, b_r1, b_r2] = await Promise.all([
      t1c.balanceOf(AMM_A), t2c.balanceOf(AMM_A),
      t1c.balanceOf(AMM_B), t2c.balanceOf(AMM_B),
    ]);
    setResA({ r1: Number(ethers.utils.formatUnits(a_r1, t1Dec)), r2: Number(ethers.utils.formatUnits(a_r2, t2Dec)) });
    setResB({ r1: Number(ethers.utils.formatUnits(b_r1, t1Dec)), r2: Number(ethers.utils.formatUnits(b_r2, t2Dec)) });
  }

  async function swapOn(whichDex) {
    if (!signer) return;
    const amm = whichDex === "A" ? ammA : ammB;

    const tokenIn = dir === "t1_to_t2" ? t1 : t2;
    const decIn   = dir === "t1_to_t2" ? t1Dec : t2Dec;
    const decOut  = dir === "t1_to_t2" ? t2Dec : t1Dec;
    const amountWei = ethers.utils.parseUnits(amount || "0", decIn);

    try {
      // Compute user's min-out guard from the last displayed quote
      const slipPct = Math.max(0, Number(slippage || "0")) / 100;
      const quotedOut = whichDex === "A" ? quotes.a : quotes.b; // displayed quote for THIS dex
      const minOutGuard = quotedOut * (1 - slipPct);

      // Get a fresh on-chain quote right now for THIS AMM (view function; no allowance needed)
      let expectedOutWei;
      if (dir === "t1_to_t2") {
        expectedOutWei = await amm.callStatic.calculateToken1Swap(amountWei);
      } else {
        expectedOutWei = await amm.callStatic.calculateToken2Swap(amountWei);
      }
      const expectedOut = Number(ethers.utils.formatUnits(expectedOutWei, decOut));

      // Block if current expected < user's min
      if (expectedOut < minOutGuard) {
        alert(`Price moved. Expected ${fmt(expectedOut)} < min ${fmt(minOutGuard)}. Increase slippage or reduce amount.`);
        return;
      }

      // Approval (needed for the actual swap)
      await approveIfNeeded(tokenIn, amm.address, amountWei);

      // Execute the swap (simulate first; will revert if too large)
      let tx;
      if (dir === "t1_to_t2") {
        await amm.callStatic.swapToken1(amountWei);
        tx = await amm.swapToken1(amountWei);
      } else {
        await amm.callStatic.swapToken2(amountWei);
        tx = await amm.swapToken2(amountWei);
      }
      await tx.wait();

      await trulyRefreshReserves();
    } catch (e) {
      const reason = e?.error?.message || e?.reason || e?.message || String(e);
      if (/liquidity|too large|insufficient/i.test(reason)) {
        alert("Swap failed: amount too large for current pool liquidity.");
      } else {
        alert(`Swap failed: ${reason}`);
      }
      console.error(e);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2>Dex Aggregator (MVP)</h2>
      <p style={{ opacity: 0.7 }}>Wallet: {account || "—"}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
          <h4>Dex #1</h4>
          <div>{t1Sym}: {fmt(resA.r1)} &nbsp;|&nbsp; {t2Sym}: {fmt(resA.r2)}</div>
          <div>Quote: {
            dir === "t1_to_t2"
              ? `${fmt(quotes.a)} ${t2Sym}`
              : `${fmt(quotes.a)} ${t1Sym}`
          }</div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
          <h4>Dex #2</h4>
          <div>{t1Sym}: {fmt(resB.r1)} &nbsp;|&nbsp; {t2Sym}: {fmt(resB.r2)}</div>
          <div>Quote: {
            dir === "t1_to_t2"
              ? `${fmt(quotes.b)} ${t2Sym}`
              : `${fmt(quotes.b)} ${t1Sym}`
          }</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label>Direction:</label>
        <select value={dir} onChange={e => setDir(e.target.value)}>
          <option value="t1_to_t2">{t1Sym} → {t2Sym}</option>
          <option value="t2_to_t1">{t2Sym} → {t1Sym}</option>
        </select>

        <label style={{ marginLeft: 16 }}>Amount:</label>
        <input value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 180 }} />

        <label style={{ marginLeft: 16 }}>Slippage %:</label>
        <input value={slippage} onChange={e => setSlippage(e.target.value)} style={{ width: 80 }} />
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>Best route:</strong> {quotes.a >= quotes.b ? "Dex #1" : "Dex #2"}
      </div>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        {(() => {
          const slipPct = Math.max(0, Number(slippage || "0")) / 100;
          const bestOut = quotes.a >= quotes.b ? quotes.a : quotes.b;
          const minOutDisplay = bestOut * (1 - slipPct);
          return <>Min received (slippage {slippage}%): {fmt(minOutDisplay)} {dir === "t1_to_t2" ? t2Sym : t1Sym}</>;
        })()}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button
          onClick={() => swapOn(quotes.a >= quotes.b ? "A" : "B")}
          disabled={!account || parsedAmount <= 0}
        >
          Swap on Best
        </button>
        <button onClick={() => swapOn("A")} disabled={!account || parsedAmount <= 0}>Force Dex #1</button>
        <button onClick={() => swapOn("B")} disabled={!account || parsedAmount <= 0}>Force Dex #2</button>
        <button onClick={() => trulyRefreshReserves()}>Refresh Reserves</button>
      </div>
    </div>
  );
}
