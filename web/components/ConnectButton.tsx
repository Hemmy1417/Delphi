"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet, type Discovered } from "@/lib/wallet";

function short(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function ConnectButton() {
  const { address, connecting, wallets, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function onPick(w: Discovered) {
    setErr("");
    try {
      await connect(w);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  if (!address) {
    return (
      <div className="relative" ref={ref}>
        <button onClick={() => setOpen((o) => !o)} disabled={connecting} className="btn !px-5 !py-2.5 text-[0.7rem]">
          {connecting ? "Connecting" : "Connect"}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-64 card p-2 z-30">
            <p className="eyebrow px-2 py-2">Choose a wallet</p>
            {wallets.length === 0 ? (
              <div className="px-2 py-2">
                <p className="text-sm text-body">No wallet detected.</p>
                <a href="https://rabby.io" target="_blank" rel="noreferrer" className="link mono text-xs mt-2 inline-block">
                  Install a wallet ↗
                </a>
              </div>
            ) : (
              wallets.map((w) => (
                <button
                  key={w.info.uuid}
                  onClick={() => onPick(w)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-elevated transition-colors text-left"
                >
                  {w.info.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.info.icon} alt="" width={18} height={18} />
                  ) : (
                    <span className="w-[18px] h-[18px] bg-hairline-strong" />
                  )}
                  <span className="mono text-xs uppercase tracking-[0.12em] text-ink">{w.info.name}</span>
                </button>
              ))
            )}
            {err && <p className="px-3 py-2 text-xs text-warning break-words">{err}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost !px-5 !py-2.5 text-[0.7rem]">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="mono">{short(address)}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 card p-3 z-30">
          <div className="eyebrow">Connected</div>
          <div className="mono text-sm text-ink break-all mt-1.5">{address}</div>
          <div className="flex gap-2 mt-3">
            <button onClick={copy} className="btn-ghost flex-1 !py-2 text-[0.65rem]">
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => { disconnect(); setOpen(false); }} className="btn-ghost flex-1 !py-2 text-[0.65rem]">
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
