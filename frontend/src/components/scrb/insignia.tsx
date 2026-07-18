import { cn } from "@/lib/utils";

/**
 * Karnataka Police ceremonial seal — original stylised composition.
 * Outer bilingual ring, four-lion Ashoka capital silhouette, chakra, shield with scales.
 * Purely decorative SVG, no external assets.
 */
export function KarnatakaSeal({
  className,
  size = 96,
  animated = false,
}: {
  className?: string;
  size?: number;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={cn(animated && "[&_.chakra]:animate-[spin_60s_linear_infinite]", className)}
      aria-label="Karnataka Police ceremonial seal"
    >
      <defs>
        <radialGradient id="sealBg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(226,163,61,0.35)" />
          <stop offset="60%" stopColor="rgba(226,163,61,0.08)" />
          <stop offset="100%" stopColor="rgba(11,27,43,0)" />
        </radialGradient>
        <linearGradient id="sealMetal" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F3D68A" />
          <stop offset="55%" stopColor="#E2A33D" />
          <stop offset="100%" stopColor="#8A5A17" />
        </linearGradient>
        <path
          id="ringText"
          d="M 100,100 m -78,0 a 78,78 0 1,1 156,0 a 78,78 0 1,1 -156,0"
        />
        <path
          id="ringTextBottom"
          d="M 100,100 m -78,0 a 78,78 0 1,0 156,0 a 78,78 0 1,0 -156,0"
        />
      </defs>

      {/* halo */}
      <circle cx="100" cy="100" r="98" fill="url(#sealBg)" />

      {/* outer ring */}
      <circle cx="100" cy="100" r="88" fill="none" stroke="url(#sealMetal)" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="82" fill="none" stroke="rgba(243,214,138,0.35)" strokeWidth="0.6" />

      {/* bilingual text ring */}
      <text fill="#F3D68A" fontSize="10" letterSpacing="2" fontFamily="Spectral, serif">
        <textPath href="#ringText" startOffset="6%">KARNATAKA STATE POLICE · ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್</textPath>
      </text>
      <text fill="#E2A33D" fontSize="8" letterSpacing="4" fontFamily="Spectral, serif">
        <textPath href="#ringTextBottom" startOffset="18%">SATYAMEVA JAYATE · ಸತ್ಯಮೇವ ಜಯತೆ</textPath>
      </text>

      {/* inner circle */}
      <circle cx="100" cy="100" r="62" fill="rgba(11,27,43,0.55)" stroke="url(#sealMetal)" strokeWidth="1.2" />

      {/* Ashoka chakra */}
      <g className="chakra" style={{ transformOrigin: "100px 100px" }}>
        <circle cx="100" cy="100" r="20" fill="none" stroke="#F3D68A" strokeWidth="1" opacity="0.9" />
        {Array.from({ length: 24 }).map((_, i) => (
          <line
            key={i}
            x1="100" y1="80" x2="100" y2="82"
            stroke="#F3D68A" strokeWidth="0.8"
            transform={`rotate(${i * 15} 100 100)`}
          />
        ))}
        <circle cx="100" cy="100" r="2" fill="#F3D68A" />
      </g>

      {/* Stylised four-lion capital (silhouette) */}
      <g fill="url(#sealMetal)" opacity="0.95">
        <ellipse cx="100" cy="66" rx="18" ry="6" />
        <path d="M85,66 Q85,52 92,50 Q94,58 100,58 Q106,58 108,50 Q115,52 115,66 Z" />
        <circle cx="93" cy="53" r="1.5" />
        <circle cx="107" cy="53" r="1.5" />
        {/* abacus */}
        <rect x="80" y="70" width="40" height="3" rx="1" />
        <rect x="82" y="74" width="36" height="1.5" opacity="0.6" />
      </g>

      {/* Scales of justice below chakra */}
      <g stroke="#F3D68A" strokeWidth="0.8" fill="none" opacity="0.85">
        <line x1="100" y1="128" x2="100" y2="146" />
        <line x1="82" y1="132" x2="118" y2="132" />
        <path d="M82,132 Q78,140 74,132 Z" fill="#F3D68A" opacity="0.5" />
        <path d="M118,132 Q114,140 110,132 Z" fill="#F3D68A" opacity="0.5" />
      </g>

      {/* Motto banner */}
      <g>
        <path d="M60,152 Q100,168 140,152 L140,158 Q100,174 60,158 Z" fill="url(#sealMetal)" opacity="0.9" />
        <text x="100" y="164" textAnchor="middle" fill="#0B1B2B" fontSize="6.5" fontFamily="Spectral, serif" letterSpacing="1.5" fontWeight="600">
          ಸೇವೆಯೇ ನಮ್ಮ ಧರ್ಮ
        </text>
      </g>
    </svg>
  );
}

/** Compact monochrome badge mark for the top-nav. */
export function SealMark({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="mark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#F3D68A" />
          <stop offset="100%" stopColor="#B8801E" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="rgba(11,27,43,0.5)" stroke="url(#mark)" strokeWidth="1" />
      <circle cx="20" cy="20" r="6" fill="none" stroke="url(#mark)" strokeWidth="0.8" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="20" y1="15.5" x2="20" y2="14" stroke="url(#mark)" strokeWidth="0.6"
          transform={`rotate(${i * 30} 20 20)`} />
      ))}
      <path d="M11,10 Q20,6 29,10 L29,13 Q20,9 11,13 Z" fill="url(#mark)" opacity="0.85" />
      <path d="M11,30 Q20,34 29,30 L29,27 Q20,31 11,27 Z" fill="url(#mark)" opacity="0.85" />
    </svg>
  );
}

/** Tricolour thread — Karnataka state colours (red/yellow) with a navy underline. */
export function TricolourThread({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-[3px] w-full overflow-hidden rounded-full", className)}>
      <span className="h-full flex-1" style={{ background: "#C8102E" }} />
      <span className="h-full flex-1" style={{ background: "#F3D68A" }} />
      <span className="h-full flex-1" style={{ background: "#0B1B2B" }} />
    </div>
  );
}

/** Diagonal "RESTRICTED" watermark stamp — evokes an official dossier. */
export function ClassificationStamp({ label = "RESTRICTED · KSP INTERNAL" }: { label?: string }) {
  return (
    <div className="pointer-events-none inline-flex items-center gap-2 rounded-md border border-amber/40 px-2 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-amber shadow-[0_0_8px_var(--amber)]" />
      <span className="text-mono text-[10px] tracking-[0.25em] text-amber-soft">{label}</span>
    </div>
  );
}
