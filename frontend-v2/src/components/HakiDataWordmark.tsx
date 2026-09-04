import React, { useId } from "react";

/**
 * Wordmark HakiData — traitement original, pas un simple choix de police.
 * "Haki" en blanc plein, "Data" en dégradé ambre (identité de marque), et un
 * mini tracé ascendant sous le mot entier avec un point lumineux à l'extrémité
 * — une "sparkline" de tendance, cohérente avec un produit de Business
 * Intelligence, qui sert de soulignement au lieu d'un simple trait plat.
 */
export function HakiDataWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const gradientId = useId();
  const glowId = useId();

  const isSm = size === "sm";
  const isLg = size === "lg";
  const fontSize = isSm ? 6 : isLg ? 20 : 10;
  const sparkH = isSm ? 3 : isLg ? 8 : 4;
  const sparkW = isSm ? 23 : isLg ? 78 : 39;

  return (
    <div className="inline-flex flex-col items-start" style={{ lineHeight: 1 }}>
      <span
        className="font-logo font-extrabold uppercase whitespace-nowrap"
        style={{ fontSize, letterSpacing: "-0.045em" }}
      >
        <span className="text-white">Haki</span>
        <span
          style={{
            backgroundImage: "linear-gradient(90deg, #C8940A 0%, #F2CD7A 55%, #E0B44A 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Data
        </span>
      </span>

      {/* Sparkline de tendance — tient lieu de soulignement de marque */}
      <svg
        width={sparkW}
        height={sparkH + 3}
        viewBox={`0 0 ${sparkW} ${sparkH + 3}`}
        fill="none"
        className={isSm ? "mt-[1px]" : isLg ? "mt-[6px]" : "mt-[3px]"}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2={sparkW} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C8940A" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#F2CD7A" />
          </linearGradient>
          <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={isSm ? 0.8 : isLg ? 2.2 : 1.4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={`M0,${sparkH} L${sparkW * 0.32},${sparkH * 0.55} L${sparkW * 0.58},${sparkH * 0.75} L${sparkW * 0.8},${sparkH * 0.15} L${sparkW - 2},2`}
          stroke={`url(#${gradientId})`}
          strokeWidth={isSm ? 1.1 : isLg ? 2.4 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={sparkW - 2} cy={2} r={isSm ? 1.4 : isLg ? 3.2 : 2} fill="#F2CD7A" filter={`url(#${glowId})`} />
      </svg>
    </div>
  );
}
