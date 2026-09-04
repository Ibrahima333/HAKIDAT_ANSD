import React, { useEffect, useState } from "react";
import { TableProperties, ChevronRight, ChevronDown, RefreshCw, KeyRound, Link, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import { apiFetch } from "../lib/api";
import { HakiLoader } from "./HakiLoader";

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  key: string; // "PRI", "MUL", ou ""
}

interface Table {
  name: string;
  columns: Column[];
}

interface Props {
  database: string;
  schema: string;
  /** Appelé quand l'utilisateur clique sur un nom de table ou de colonne */
  onInsert?: (text: string) => void;
}

export function SchemaExplorer({ database, schema, onInsert }: Props) {
  const [tables, setTables] = useState<Table[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!database) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ database, schema });
      const data = await apiFetch<{ tables: Table[] }>(`/api/schema/explore?${params}`);
      setTables(data.tables ?? []);
      setExpanded(new Set()); // tout replié par défaut
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  };

  // Recharge quand la base/schéma change
  useEffect(() => {
    void load();
  }, [database, schema]);

  const toggle = (tableName: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(tableName) ? next.delete(tableName) : next.add(tableName);
      return next;
    });
  };

  if (!database) return null;

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TableProperties className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[12px] font-medium text-zinc-100">Schéma</span>
          <span className="text-[10.5px] text-zinc-500">· {tables.length} table{tables.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
          title="Actualiser le schéma"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Contenu */}
      <div className="max-h-72 overflow-y-auto">
        {error && (
          <div className="px-4 py-3 text-[11px] text-rose-600 bg-rose-50 border-b border-rose-100">
            {error}
          </div>
        )}

        {isLoading && tables.length === 0 && (
          <div className="px-4 py-6 flex justify-center">
            <HakiLoader size={48} />
          </div>
        )}

        {!isLoading && tables.length === 0 && !error && (
          <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <p className="text-[11px] font-semibold text-zinc-300">
              Aucune table disponible dans cette base
            </p>
            <p className="text-[10.5px] text-zinc-500 leading-relaxed max-w-[220px]">
              Vérifiez que la base <span className="text-zinc-300">{database}</span> contient
              des tables et que le schéma <span className="text-zinc-300">{schema || "public"}</span> est correct.
            </p>
            <p className="text-[10.5px] text-zinc-600">
              Allez dans <span className="text-zinc-400">Configuration → Base de données</span> pour modifier la connexion.
            </p>
          </div>
        )}

        {tables.map(table => {
          const isOpen = expanded.has(table.name);
          return (
            <div key={table.name} className="border-b border-zinc-700/60 last:border-0">
              {/* Ligne table */}
              <button
                type="button"
                onClick={() => toggle(table.name)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/50 transition-colors group text-left"
              >
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                <span className="text-[11px] font-semibold text-zinc-200 flex-1 truncate">{table.name}</span>
                <span className="text-[9.5px] text-zinc-500 shrink-0">{table.columns.length} col.</span>
                {onInsert && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onInsert(table.name); }}
                    className="hidden group-hover:flex items-center text-[9.5px] text-zinc-400 hover:text-white ml-1"
                    title="Insérer le nom de la table"
                  >
                    +
                  </button>
                )}
              </button>

              {/* Colonnes */}
              {isOpen && (
                <div className="bg-zinc-900/60 border-t border-zinc-700/60">
                  {table.columns.map(col => (
                    <div
                      key={col.name}
                      className={cn(
                        "flex items-center gap-2 px-5 py-1.5 group",
                        onInsert && "cursor-pointer hover:bg-zinc-700/50"
                      )}
                      onClick={() => onInsert?.(col.name)}
                    >
                      {/* Icône clé */}
                      <span className="w-3.5 shrink-0">
                        {col.key === "PRI" && <span title="Clé primaire"><KeyRound className="w-3 h-3 text-zinc-400" /></span>}
                        {col.key === "MUL" && <span title="Clé étrangère"><Link className="w-3 h-3 text-zinc-400" /></span>}
                      </span>
                      {/* Nom */}
                      <span className="text-[11px] text-zinc-300 flex-1 truncate">{col.name}</span>
                      {/* Type */}
                      <span className="text-[9.5px] text-zinc-500 shrink-0 truncate max-w-[80px]">{col.type}</span>
                      {/* Nullable */}
                      {col.nullable && (
                        <span className="text-[9px] text-stone-300 shrink-0">?</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
