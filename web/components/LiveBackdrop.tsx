"use client";

// Delphi — Bugatti monochrome. Silver→black gradient wash, horizontal
// speed lines drifting right-to-left at multiple depths (parallax),
// slow vignetting sweep. High-end automotive dashboard energy.

export function LiveBackdrop() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="del-wash" />
      <div className="del-lines del-lines-far">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={`f${i}`} className={`del-line del-lf${i}`} />
        ))}
      </div>
      <div className="del-lines del-lines-near">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={`n${i}`} className={`del-line del-ln${i}`} />
        ))}
      </div>
      <div className="del-sweep" />

      <style jsx>{`
        .del-wash {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 100% 70% at 50% 0%,
              rgba(180, 190, 200, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 90% 60% at 50% 100%,
              rgba(220, 220, 220, 0.03) 0%, transparent 55%);
        }

        .del-lines { position: absolute; inset: 0; }
        .del-line {
          position: absolute;
          height: 1px;
          background: linear-gradient(to right,
            transparent 0%,
            rgba(200, 210, 220, 0.9) 50%,
            transparent 100%);
          will-change: transform;
        }

        /* Far layer — thinner, slower, higher */
        .del-lines-far .del-line { opacity: 0.35; width: 40vw; }
        .del-lf0  { top:  6%; animation: delDrift 22s linear infinite;    animation-delay:  0s;  }
        .del-lf1  { top: 12%; animation: delDrift 26s linear infinite;    animation-delay:  3s;  }
        .del-lf2  { top: 18%; animation: delDrift 24s linear infinite;    animation-delay:  6s;  }
        .del-lf3  { top: 26%; animation: delDrift 28s linear infinite;    animation-delay:  1s;  }
        .del-lf4  { top: 34%; animation: delDrift 25s linear infinite;    animation-delay:  8s;  }
        .del-lf5  { top: 42%; animation: delDrift 27s linear infinite;    animation-delay:  4s;  }
        .del-lf6  { top: 50%; animation: delDrift 23s linear infinite;    animation-delay:  7s;  }
        .del-lf7  { top: 58%; animation: delDrift 29s linear infinite;    animation-delay:  2s;  }
        .del-lf8  { top: 66%; animation: delDrift 26s linear infinite;    animation-delay:  5s;  }
        .del-lf9  { top: 74%; animation: delDrift 24s linear infinite;    animation-delay: 10s;  }
        .del-lf10 { top: 82%; animation: delDrift 28s linear infinite;    animation-delay:  0s;  }
        .del-lf11 { top: 88%; animation: delDrift 25s linear infinite;    animation-delay:  9s;  }
        .del-lf12 { top: 94%; animation: delDrift 27s linear infinite;    animation-delay:  6s;  }
        .del-lf13 { top: 98%; animation: delDrift 26s linear infinite;    animation-delay:  3s;  }

        /* Near layer — thicker, faster */
        .del-lines-near .del-line { opacity: 0.7; height: 2px; width: 55vw; }
        .del-ln0 { top:  8%; animation: delDrift 12s linear infinite;     animation-delay:  0s; }
        .del-ln1 { top: 22%; animation: delDrift 14s linear infinite;     animation-delay:  4s; }
        .del-ln2 { top: 36%; animation: delDrift 13s linear infinite;     animation-delay:  7s; }
        .del-ln3 { top: 48%; animation: delDrift 15s linear infinite;     animation-delay:  2s; }
        .del-ln4 { top: 62%; animation: delDrift 12s linear infinite;     animation-delay:  9s; }
        .del-ln5 { top: 74%; animation: delDrift 14s linear infinite;     animation-delay:  5s; }
        .del-ln6 { top: 86%; animation: delDrift 13s linear infinite;     animation-delay: 11s; }
        .del-ln7 { top: 96%; animation: delDrift 15s linear infinite;     animation-delay:  1s; }

        @keyframes delDrift {
          from { transform: translateX(120vw);  }
          to   { transform: translateX(-120vw); }
        }

        .del-sweep {
          position: absolute; inset: 0;
          background: linear-gradient(105deg,
            transparent 0%,
            transparent 40%,
            rgba(255,255,255,0.03) 50%,
            transparent 60%,
            transparent 100%);
          background-size: 200% 100%;
          animation: delSweep 18s linear infinite;
        }
        @keyframes delSweep {
          from { background-position: -100% 0; }
          to   { background-position:  200% 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .del-line, .del-sweep { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
