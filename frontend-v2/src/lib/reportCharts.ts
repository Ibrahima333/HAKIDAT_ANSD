const STORAGE_KEY = "hakidata_report_charts";

export interface ReportChart {
  id: string;
  questionText: string;
  questionName: string;
  chartHtml: string;
  chartUrl?: string;
  vizType: string | null;
  addedAt: number;
}

function load(): ReportChart[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(charts: ReportChart[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
}

export function getReportCharts(): ReportChart[] {
  return load();
}

export function getReportChartCount(): number {
  return load().length;
}

export function isChartInReport(id: string): boolean {
  return load().some(c => c.id === id);
}

export function toggleReportChart(chart: ReportChart): boolean {
  const charts = load();
  const idx = charts.findIndex(c => c.id === chart.id);
  if (idx >= 0) {
    charts.splice(idx, 1);
    save(charts);
    return false;
  }
  charts.push(chart);
  save(charts);
  return true;
}

export function clearReportCharts() {
  localStorage.removeItem(STORAGE_KEY);
}
