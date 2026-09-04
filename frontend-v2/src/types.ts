export interface PipelineResultSummary {
  id: string;
  questionName: string;
  questionText: string;
  databaseName: string;
  schemaName: string;
  providerName: string;
  timestamp: number;
}

export interface ArtifactUrls {
  sql: string;
  csv: string;
  metadata: string;
  chart: string;
  report: string;
  logs: string;
}

export interface PipelineResult extends PipelineResultSummary {
  sql: string;
  csvData: Record<string, unknown>[];
  metadata: {
    question?: string;
    rows_returned: number;
    /** Cause identifiée d'un résultat vide (tables sans données), sinon null */
    empty_reason?: string | null;
    columns: Array<{ name: string; type: string }>;
    sql_file?: string;
    database?: string;
    schema?: string;
    execution_time_ms?: number;
    query_hash?: string;
  };
  report: string;
  logs: string;
  chartHtml: string;
  vizType?: string | null;
  vizAlternatives?: string[];
  artifactUrls: ArtifactUrls;
}

export interface DashboardItem {
  id: string;
  questionName: string;
  questionText: string;
  /** URL de l'artefact chart (ex: /api/artifacts/xxx/chart).
   *  Préféré à chartHtml pour éviter de saturer localStorage avec de gros HTML Plotly. */
  chartUrl: string;
  database: string;
  schema: string;
  provider: string;
  pinnedAt: number;
  /** Largeur en colonnes (6 = demi, 12 = pleine largeur) */
  w: number;
  /** Rafraîchissement automatique activé (opt-in, par graphique) */
  watched?: boolean;
}

export interface KpiItem {
  id: string;               // = questionName
  questionText: string;     // question posée en langage naturel
  questionName: string;
  columnName: string;       // nom de la colonne retournée
  value: string;            // valeur formatée pour l'affichage
  rawValue: number | null;  // valeur numérique brute (pour le delta)
  previousValue: number | null; // valeur avant le dernier refresh
  database: string;
  schema: string;
  provider: string;
  pinnedAt: number;
  lastUpdated: number;
}

export interface AppState {
  databases: string[];
  schemas: string[];
  providers: string[];
  selectedDatabase: string;
  selectedSchema: string;
  selectedProvider: string;
  overwriteExisting: boolean;
  history: PipelineResultSummary[];
  activeResultId: string | null;
  activeResult: PipelineResult | null;
  isLoading: boolean;
  isBootstrapping: boolean;
  errorMessage: string | null;
  /** Texte à insérer dans le champ de saisie (depuis l'explorateur de schéma) */
  insertText: string | null;
}
