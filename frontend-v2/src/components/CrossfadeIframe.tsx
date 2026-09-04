import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

interface Props {
  title: string;
  src: string;
  sandbox?: string;
  loading?: "lazy" | "eager";
  className?: string;
}

/**
 * Iframe avec double-buffering — quand `src` change (ex: rafraîchissement
 * automatique d'un graphique surveillé), la nouvelle page se charge dans un
 * second iframe invisible ; on ne la fait apparaître (fondu) qu'une fois son
 * chargement terminé, et l'ancien contenu reste affiché entre-temps. Sans ça,
 * changer le `src` d'un iframe le vide immédiatement (fond blanc) le temps
 * que la nouvelle page se charge — un flash visible à chaque rafraîchissement.
 */
export function CrossfadeIframe({ title, src, sandbox, loading = "lazy", className }: Props) {
  const [srcs, setSrcs] = useState<[string, string]>([src, ""]);
  const [visible, setVisible] = useState<0 | 1>(0);
  const lastSrc = useRef(src);

  useEffect(() => {
    if (src === lastSrc.current) return;
    lastSrc.current = src;
    const hidden = visible === 0 ? 1 : 0;
    setSrcs(prev => {
      const next: [string, string] = [prev[0], prev[1]];
      next[hidden] = src;
      return next;
    });
  }, [src, visible]);

  const handleLoad = (slot: 0 | 1) => {
    if (slot !== visible && srcs[slot] === src) {
      setVisible(slot);
    }
  };

  return (
    <div className={cn("relative", className)}>
      {([0, 1] as const).map(slot => (
        <iframe
          key={slot}
          title={`${title}-${slot}`}
          src={srcs[slot]}
          sandbox={sandbox}
          loading={loading}
          onLoad={() => handleLoad(slot)}
          className={cn(
            "absolute inset-0 w-full h-full border-0 transition-opacity duration-300 ease-out",
            visible === slot ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          )}
        />
      ))}
    </div>
  );
}
