import axios from "axios";
import { useEffect, useRef, useState } from "react";

const API_BASE = "https://api-uretim.gursoymaden.com.tr/api/reports";
const PLC_API_BASE = "https://api-uretim.gursoymaden.com.tr/api/plc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlcDokum {
  dokumNo: string;
  value: number;
  lastReadAtUtc: string;
}

interface PlcItem {
  label: string;
  key: string;
  mapped: boolean;
  unit: string | null;
  total: number;
  dokumCount: number;
  dokumler: PlcDokum[];
}

interface PlcSummary {
  date: string;
  dokumCount: number;
  dokumNolar: string[];
  items: PlcItem[];
}

interface ReportItem {
  ad: string;
  birim?: string;
  deger: number;
}

interface ReportBody {
  baslik: {
    dokumanNo: string;
    revizyonNo: string;
    yayinTarihi: string;
  };
  uretim: ReportItem[];
  tuketim: ReportItem[];
  ticariUrunVerimlilik: ReportItem[];
  stok: ReportItem[];
}

interface Report {
  id: number;
  reportDate: string;
  body: ReportBody;
  note: string | null;
  createdBy: string;
  updatedBy: string;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

type FilterKey =
  | "bugun"
  | "dun"
  | "bu-hafta"
  | "bu-ay"
  | "gecen-hafta"
  | "gecen-ay"
  | "bu-yil";

interface DateRange {
  from: string;
  to: string;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getRange(key: FilterKey): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (key) {
    case "bugun": {
      const s = isoDate(today);
      return { from: s, to: s };
    }
    case "dun": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      const s = isoDate(d);
      return { from: s, to: s };
    }
    case "bu-hafta": {
      const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const mon = new Date(today);
      mon.setDate(today.getDate() - day);
      return { from: isoDate(mon), to: isoDate(today) };
    }
    case "bu-ay": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: isoDate(first), to: isoDate(today) };
    }
    case "gecen-hafta": {
      const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const mon = new Date(today);
      mon.setDate(today.getDate() - day - 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: isoDate(mon), to: isoDate(sun) };
    }
    case "gecen-ay": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: isoDate(first), to: isoDate(last) };
    }
    case "bu-yil": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { from: isoDate(first), to: isoDate(today) };
    }
  }
}

function isSingleDay(range: DateRange) {
  return range.from === range.to;
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cur <= end) {
    dates.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "bugun", label: "Bugün" },
  { key: "dun", label: "Dün" },
  { key: "bu-hafta", label: "Hafta" },
  { key: "gecen-hafta", label: "Geçen Hafta" },
  { key: "bu-ay", label: "Bu Ay" },
  { key: "gecen-ay", label: "Geçen Ay" },
  { key: "bu-yil", label: "Bu Yıl" },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDisplayDate(isoStr: string) {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

function formatShortDate(isoStr: string) {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS: { key: keyof ReportBody; title: string; accent: string }[] = [
  { key: "uretim", title: "ÜRETİM", accent: "bg-slate-500" },
  { key: "tuketim", title: "TÜKETİM", accent: "bg-slate-500" },
  { key: "ticariUrunVerimlilik", title: "TİCARİ ÜRÜN VERİMLİLİK", accent: "bg-slate-500" },
  { key: "stok", title: "STOK", accent: "bg-slate-500" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ item, index }: { item: ReportItem; index: number }) {
  return (
    <tr className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
      <td className="py-2.5 px-4 text-xs text-slate-700 leading-snug">{item.ad}</td>
      <td className="py-2.5 px-4 pr-0 text-xs text-right font-semibold text-slate-900">
        {fmt(item.deger)}
      </td>
      <td className="py-2.5 px-4 text-xs text-slate-400 text-right w-16 whitespace-nowrap">
        {item.birim ?? "Ton"}
      </td>
    </tr>
  );
}

function ReportCard({ report }: { report: Report }) {
  const b = report.body;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Card header */}
      <div className="bg-blue-950 px-5 py-4 flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Döküman No: {b.baslik.dokumanNo}</span>
            <span className="text-xs text-slate-400">Revizyon No: {b.baslik.revizyonNo}</span>
            <span className="text-xs text-slate-400">Yayın: {b.baslik.yayinTarihi}</span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-medium text-sm">{formatDisplayDate(report.reportDate)}</p>
          
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(({ key, title, accent }) => {
        const items = key === "baslik"
          ? []
          : (b[key] as ReportItem[]).map((item) => ({
              ...item,
              birim: item.birim ?? "Ton",
            }));
        if (!items.length) return null;
        return (
          <div key={key}>
            <div className={`${accent} px-4 py-2 flex items-center gap-2`}>
              <span className="text-white text-xs font-bold uppercase tracking-widest">
                {title}
              </span>
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {items.map((item, i) => (
                  <Row key={i} item={item} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function PlcReportCard({ summary }: { summary: PlcSummary }) {
  const mapped = summary.items.filter((i) => i.mapped && i.total > 0);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-blue-950 px-5 py-4 flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Döküm Sayısı: {summary.dokumCount}</span>
          <span className="text-xs text-slate-400">
            {summary.dokumNolar.join(", ")}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-medium text-sm">{formatDisplayDate(summary.date)}</p>
          <span className="text-xs text-blue-400 font-semibold uppercase tracking-widest">PLC Verisi</span>
        </div>
      </div>
      <div className="bg-slate-500 px-4 py-2">
        <span className="text-white text-xs font-bold uppercase tracking-widest">HAMMADDE / ENERJİ</span>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {mapped.map((item, i) => (
            <tr key={item.key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              <td className="py-2.5 px-4 text-xs text-slate-700 leading-snug">{item.label}</td>
              <td className="py-2.5 px-4 pr-0 text-xs text-right font-semibold text-slate-900">
                {fmt(item.total)}
              </td>
              <td className="py-2.5 px-4 text-xs text-slate-400 text-right w-16 whitespace-nowrap">
                {item.unit ?? "—"}
              </td>
            </tr>
          ))}
          {mapped.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-xs text-slate-400">
                Veri bulunamadı.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DailyProductionReport() {
  const lastScrollY = useRef(0);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setShowScrollTop(y > window.innerHeight);
      if (y < 10) {
        setHeaderVisible(true);
      } else if (y > lastScrollY.current) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [activeFilter, setActiveFilter] = useState<FilterKey | "ozel">("bugun");
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedRange, setAppliedRange] = useState<DateRange>(getRange("bugun"));
  const [reports, setReports] = useState<Report[]>([]);
  const [plcReports, setPlcReports] = useState<PlcSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchRange(range: DateRange, filterKey: FilterKey | "ozel") {
    setLoading(true);
    setError(null);
    setReports([]);
    setPlcReports([]);

    if (isSingleDay(range)) {
      axios
        .get<Report>(`${API_BASE}/${range.from}`)
        .then((r) => setReports([r.data]))
        .catch((err) => {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            return axios
              .get<PlcSummary>(`${PLC_API_BASE}/daily-summary/${range.from}`)
              .then((r) => setPlcReports([r.data]))
              .catch(() => setError("Bu dönemde rapor bulunamadı."));
          }
          setError("Rapor yüklenirken bir hata oluştu.");
        })
        .finally(() => setLoading(false));
    } else {
      axios
        .get<Report[]>(`${API_BASE}`, { params: { from: range.from, to: range.to } })
        .then((r) => {
          if (r.data.length === 0 && filterKey === "bu-hafta") {
            const dates = datesBetween(range.from, range.to);
            return Promise.all(
              dates.map((date) =>
                axios
                  .get<PlcSummary>(`${PLC_API_BASE}/daily-summary/${date}`)
                  .then((r) => r.data)
                  .catch(() => null)
              )
            ).then((results) => {
              setPlcReports(results.filter(Boolean) as PlcSummary[]);
            });
          }
          setReports(r.data);
        })
        .catch((err) => {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            setError("Bu dönemde rapor bulunamadı.");
          } else {
            setError("Rapor yüklenirken bir hata oluştu.");
          }
        })
        .finally(() => setLoading(false));
    }
  }

  useEffect(() => {
    fetchRange(appliedRange, activeFilter);
  }, [appliedRange]);

  function handleFilterClick(key: FilterKey) {
    setActiveFilter(key);
    setShowRangePicker(false);
    setAppliedRange(getRange(key));
  }

  function handleCustomFromChange(value: string) {
    setCustomFrom(value);
    if (customTo && customTo < value) setCustomTo("");
  }

  function handleCustomToChange(value: string) {
    setCustomTo(value);
  }

  function handleApplyRange() {
    if (customFrom && customTo) {
      setActiveFilter("ozel");
      setAppliedRange({ from: customFrom, to: customTo });
      setShowRangePicker(false);
    }
  }

  const rangeLabel =
    activeFilter === "ozel" && customFrom && customTo
      ? `${formatShortDate(customFrom)} – ${formatShortDate(customTo)}`
      : "Aralık Seç";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top bar */}
      <header className={[
          "bg-blue-950 px-4 pt-2 md:pb-4 md:pt-6 pb-5 sticky top-0 z-10 shadow-lg",
          "transition-transform duration-300 sm:translate-y-0",
          headerVisible ? "translate-y-0" : "-translate-y-full",
        ].join(" ")}>
        <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
          BG Ferrokrom
        </p>
        <h1 className="text-white text-xl font-bold mb-4">Günlük Üretim Raporları</h1>

        {/* Filter pills — horizontally scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterClick(f.key)}
              className={[
                "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all",
                activeFilter === f.key
                  ? "bg-white text-blue-950 shadow"
                  : "bg-blue-900/60 text-blue-200 hover:bg-blue-800",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}

          {/* Range toggle */}
          <button
            onClick={() => setShowRangePicker((v) => !v)}
            className={[
              "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5",
              activeFilter === "ozel"
                ? "bg-white text-blue-950 shadow"
                : showRangePicker
                ? "bg-blue-700 text-white"
                : "bg-blue-900/60 text-blue-200 hover:bg-blue-800",
            ].join(" ")}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {rangeLabel}
          </button>
        </div>

        {/* Range picker panel */}
        {showRangePicker && (
          <div className="mt-3 bg-blue-900/80 backdrop-blur rounded-xl p-4 flex flex-col gap-3 max-w-140">
            <div className="flex flex-col gap-1">
              <label className="text-blue-300 text-xs font-medium">Başlangıç Tarihi</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => handleCustomFromChange(e.target.value)}
                className="bg-blue-950 border border-blue-600 rounded-lg h-8 text-white text-center px-4 placeholder:text-white"
                placeholder="Başlangıç tarihi seçiniz"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-blue-300 text-xs font-medium">Bitiş Tarihi</label>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => handleCustomToChange(e.target.value)}
                className="bg-blue-950 border border-blue-600 rounded-lg h-8 text-white text-center px-4"
                placeholder="Bitiş tarihi seçiniz"
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={handleApplyRange}
                disabled={!customFrom || !customTo}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Filtrele
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Rapor yükleniyor…</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white rounded-2xl border border-red-100 px-5 py-10 text-center">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm font-medium text-slate-700">{error}</p>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-10 text-center">
            <p className="text-2xl mb-2">📋</p>
            <p className="text-sm font-medium text-slate-500">Bu dönemde rapor bulunamadı.</p>
          </div>
        )}

        {!loading && reports.map((r) => <ReportCard key={r.id} report={r} />)}
        {!loading && plcReports.map((s) => <PlcReportCard key={s.date} summary={s} />)}
      </main>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-blue-950 text-white shadow-lg flex items-center justify-center hover:bg-blue-800 transition-colors"
          aria-label="Yukarı çık"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
