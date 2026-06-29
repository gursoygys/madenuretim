import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { API_BASE, PLC_API_BASE } from "~/env";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlcItem {
  label: string;
  key: string;
  mapped: boolean;
  unit: string | null;
  total: number;
}

interface PlcSummary {
  date: string;
  dokumCount: number;
  items: PlcItem[];
}

interface ExtraRow {
  id: string;
  label: string;
  value: string;
}

// ─── Field definitions ────────────────────────────────────────────────────────

type SectionKey = "uretim" | "tuketim" | "ticariUrunVerimlilik" | "stok";

interface FieldDef {
  id: string;
  label: string;
  unit: string;
  section: SectionKey;
  plcKey?: string;
  plcDivide?: number; // applied when pulling from PLC (e.g. 1000 for kg→ton)
  readOnly?: boolean; // formula-derived, not user-editable
  manual?: boolean;   // purely user-entered, no PLC source
}

const FIELDS: FieldDef[] = [
  // ÜRETİM — manual inputs
  { id: "siviUrun_tonGun",      label: "Sıvı Ürün",          unit: "TonGün",  section: "uretim", manual: true },
  // ÜRETİM — calculated
  { id: "siviUrun_tonSaat",     label: "Sıvı Ürün",          unit: "TonSaat", section: "uretim", readOnly: true },
  { id: "ticariUrun_tonGun",    label: "Ticari Ürün",        unit: "TonGün",  section: "uretim", readOnly: true },
  { id: "ticariUrun_tonSaat",   label: "Ticari Ürün",        unit: "TonSaat", section: "uretim", readOnly: true },
  { id: "siviUrunAylik_tonAy",  label: "Sıvı Ürün Aylık",   unit: "TonAy",   section: "uretim", manual: true },
  { id: "siviUrunAylik_tonGun", label: "Sıvı Ürün Aylık",   unit: "TonGün",  section: "uretim", readOnly: true },
  { id: "ticariAylik_tonAy",    label: "Ticari Ürün Aylık",  unit: "TonAy",   section: "uretim", manual: true },
  { id: "ticariAylik_tonGun",   label: "Ticari Ürün Aylık",  unit: "TonGün",  section: "uretim", readOnly: true },

  // TÜKETİM — PLC sourced (kg → ton ÷1000), except elektrik
  { id: "cromErkay",       label: "Krom Cevheri (Erkay Maden)",    unit: "Ton", section: "tuketim", plcKey: "Krom Cevheri (Erkay Maden)",    plcDivide: 1000 },
  { id: "cromBG",          label: "Krom Cevheri (BG Maden)",       unit: "Ton", section: "tuketim", plcKey: "Krom Cevheri (BG Maden)",       plcDivide: 1000 },
  { id: "cromOrhun",       label: "Krom Cevheri (Orhun Maden)",    unit: "Ton", section: "tuketim", plcKey: "Krom Cevheri (Orhun Maden)",    plcDivide: 1000 },
  { id: "cromTurkMaadin",  label: "Krom Cevheri (Türk Maadin)",    unit: "Ton", section: "tuketim", plcKey: "Krom Cevheri (Türk Maadin)",    plcDivide: 1000 },
  { id: "cromDBH",         label: "Krom Cevheri (DBH Maden)",      unit: "Ton", section: "tuketim", plcKey: "Krom Cevheri (DBH Maden)",      plcDivide: 1000 },
  { id: "cromCVK",         label: "Krom Cevheri (CVK Maden)",      unit: "Ton", section: "tuketim", plcKey: "Krom Cevheri (CVK Maden)",      plcDivide: 1000 },
  { id: "tozFerrokrom",    label: "Toz Ferrokrom",                  unit: "Ton", section: "tuketim", plcKey: "Toz Ferrokrom",                  plcDivide: 1000 },
  { id: "ferrokrom0310",   label: "03-10 Ferrokrom",                unit: "Ton", section: "tuketim", plcKey: "03-10 Ferrokrom",                plcDivide: 1000 },
  { id: "uretimAtik",      label: "Üretim Atıkları / Pelet",       unit: "Ton", section: "tuketim", plcKey: "Üretim Atıkları / Pelet",       plcDivide: 1000 },
  { id: "jigMetal",        label: "Jig Metal",                      unit: "Ton", section: "tuketim", plcKey: "Jig Metal",                      plcDivide: 1000 },
  { id: "kokKomuru",       label: "Kok Kömürü",                     unit: "Ton", section: "tuketim", plcKey: "Kok Kömürü",                     plcDivide: 1000 },
  { id: "antrasit",        label: "Antrasit",                       unit: "Ton", section: "tuketim", plcKey: "Antrasit",                       plcDivide: 1000 },
  { id: "elektrik",        label: "Elektrik",                       unit: "Mwh", section: "tuketim", plcKey: "Elektrik" },

  // VERİMLİLİK — all calculated
  { id: "cevherVerim",   label: "Ton başına cevher tüketimi",         unit: "Ton", section: "ticariUrunVerimlilik", readOnly: true },
  { id: "kokVerim",      label: "Ton başına kok kömürü tüketimi",     unit: "Ton", section: "ticariUrunVerimlilik", readOnly: true },
  { id: "elektrikVerim", label: "Ton başına elektrik tüketimi",       unit: "Mwh", section: "ticariUrunVerimlilik", readOnly: true },

  // STOK — PLC sourced ÷1000
  { id: "stok_kirilamamisFerrokrom",   label: "Kırılmamış Ferrokrom",            unit: "Ton", section: "stok", plcKey: "Kırılmamış Ferrokrom",            plcDivide: 1000 },
  { id: "stok_bgKirilamamisFerrokrom", label: "BlackGreen Kırılmamış Ferrokrom", unit: "Ton", section: "stok", plcKey: "BlackGreen Kırılmamış Ferrokrom", plcDivide: 1000 },
  { id: "stok_ferrokrom1050",          label: "10-50 Ferrokrom",                 unit: "Ton", section: "stok", plcKey: "10-50 Ferrokrom",                 plcDivide: 1000 },
  { id: "stok_bgFerrokrom1050",        label: "BlackGreen 10-50 Ferrokrom",      unit: "Ton", section: "stok", plcKey: "BlackGreen 10-50 Ferrokrom",      plcDivide: 1000 },
  { id: "stok_ferrokrom310",           label: "3-10 Ferrokrom",                  unit: "Ton", section: "stok", plcKey: "3-10 Ferrokrom",                  plcDivide: 1000 },
  { id: "stok_tozFerrokrom",           label: "Toz Ferrokrom",                   unit: "Ton", section: "stok", plcKey: "Toz Ferrokrom (Stok)",            plcDivide: 1000 },
  { id: "stok_toplamFerrokrom",        label: "Toplam Ferrokrom",                unit: "Ton", section: "stok", readOnly: true },
  { id: "stok_toplamKromCevheri",      label: "Toplam Krom Cevheri",             unit: "Ton", section: "stok", readOnly: true },
  { id: "stok_cromErkay",              label: "Krom Cevheri (Erkay Maden)",      unit: "Ton", section: "stok", plcKey: "Stok Krom Cevheri (Erkay)",       plcDivide: 1000 },
  { id: "stok_cromBG",                 label: "Krom Cevheri (BG Maden)",         unit: "Ton", section: "stok", plcKey: "Stok Krom Cevheri (BG)",          plcDivide: 1000 },
  { id: "stok_cromOrhun",              label: "Krom Cevheri (Orhun Maden)",      unit: "Ton", section: "stok", plcKey: "Stok Krom Cevheri (Orhun)",       plcDivide: 1000 },
  { id: "stok_cromTurkMaadin",         label: "Krom Cevheri (Türk Maadin)",      unit: "Ton", section: "stok", plcKey: "Stok Krom Cevheri (Türk Maadin)", plcDivide: 1000 },
  { id: "stok_cromDBH",                label: "Krom Cevheri (DBH Maden)",        unit: "Ton", section: "stok", plcKey: "Stok Krom Cevheri (DBH)",         plcDivide: 1000 },
  { id: "stok_cromCVK",                label: "Krom Cevheri (CVK Maden)",        unit: "Ton", section: "stok", plcKey: "Stok Krom Cevheri (CVK)",         plcDivide: 1000 },
  { id: "stok_kokKomuru",              label: "Kok Kömürü",                      unit: "Ton", section: "stok", plcKey: "Stok Kok Kömürü",                 plcDivide: 1000 },
  { id: "stok_antrasit",               label: "Antrasit",                        unit: "Ton", section: "stok", plcKey: "Stok Antrasit",                   plcDivide: 1000 },
  { id: "stok_pelet",                  label: "Pelet",                           unit: "Ton", section: "stok", plcKey: "Stok Pelet",                      plcDivide: 1000 },
];

const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "uretim",               title: "ÜRETİM" },
  { key: "tuketim",              title: "TÜKETİM" },
  { key: "ticariUrunVerimlilik", title: "TİCARİ ÜRÜN VERİMLİLİK" },
  { key: "stok",                 title: "STOK" },
];

const EXTRA_ROW_OPTIONS = [
  "Kireçtaşı", "Dolomit", "Kuvars", "Demir Cevheri", "Manganez Cevheri",
  "Magnezit", "Elektrot Pastası", "Boksit", "Kireç", "Soda Külü",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function n(v: string): number {
  return parseFloat(String(v).replace(",", ".")) || 0;
}

function fmt2(v: string | number): string {
  const num = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  if (isNaN(num)) return "";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dayOfMonth(dateStr: string): number {
  if (!dateStr) return 1;
  return new Date(dateStr + "T00:00:00").getDate();
}

function calcDerived(vals: Record<string, string>, dateStr: string): Record<string, string> {
  const dayNo = dayOfMonth(dateStr);

  // ÜRETİM
  const siviGun      = n(vals.siviUrun_tonGun);
  const tozF         = n(vals.tozFerrokrom);
  const f0310        = n(vals.ferrokrom0310);
  const ticariGun    = siviGun - tozF - f0310;
  const siviSaat     = siviGun / 24;
  const ticariSaat   = ticariGun / 24;
  const siviAylikAy  = n(vals.siviUrunAylik_tonAy);
  const ticariAylikAy = n(vals.ticariAylik_tonAy);
  const siviAylikGun   = dayNo > 0 ? siviAylikAy / dayNo : 0;
  const ticariAylikGun = dayNo > 0 ? ticariAylikAy / dayNo : 0;

  // TÜKETİM — krom toplamı (6 maden)
  const totalCrom = n(vals.cromErkay) + n(vals.cromBG) + n(vals.cromOrhun)
    + n(vals.cromTurkMaadin) + n(vals.cromDBH) + n(vals.cromCVK);
  const kok      = n(vals.kokKomuru);
  const antrasit = n(vals.antrasit);
  const elektrik = n(vals.elektrik);

  // VERİMLİLİK
  const cevherVerim   = ticariGun > 0 ? totalCrom / ticariGun : null;
  const kokVerim      = ticariGun > 0 ? (kok + antrasit) / ticariGun : null;
  const elektrikVerim = ticariGun > 0 ? elektrik / ticariGun : null;

  // STOK
  const toplamFerrokrom =
    n(vals.stok_kirilamamisFerrokrom) + n(vals.stok_bgKirilamamisFerrokrom) +
    n(vals.stok_ferrokrom1050) + n(vals.stok_bgFerrokrom1050) +
    n(vals.stok_ferrokrom310) + n(vals.stok_tozFerrokrom);
  const toplamKromCevheri =
    n(vals.stok_cromErkay) + n(vals.stok_cromBG) + n(vals.stok_cromOrhun) +
    n(vals.stok_cromTurkMaadin) + n(vals.stok_cromDBH) + n(vals.stok_cromCVK);

  function calc(v: number | null) {
    return v === null ? "0" : String(v);
  }

  return {
    siviUrun_tonSaat:     String(siviSaat),
    ticariUrun_tonGun:    String(ticariGun),
    ticariUrun_tonSaat:   String(ticariSaat),
    siviUrunAylik_tonGun: String(siviAylikGun),
    ticariAylik_tonGun:   String(ticariAylikGun),
    cevherVerim:          calc(cevherVerim),
    kokVerim:             calc(kokVerim),
    elektrikVerim:        calc(elektrikVerim),
    stok_toplamFerrokrom:    String(toplamFerrokrom),
    stok_toplamKromCevheri:  String(toplamKromCevheri),
  };
}

// ─── Combobox ────────────────────────────────────────────────────────────────

function LabelCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? EXTRA_ROW_OPTIONS.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : EXTRA_ROW_OPTIONS;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function select(opt: string) {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onChange(query);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative w-full">
      <input
        type="text"
        value={query}
        placeholder="Veya yazınız ve enter tuşuna basınız…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKey}
        className="w-full h-7 px-2 text-xs text-slate-800 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {open && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={() => select(opt)}
              className="px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 cursor-pointer"
            >
              {opt}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400 italic">Bulunamadı — Enter ile ekleyin</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Form({ onSuccess }: { onSuccess?: () => void }) {
  const [date, setDate] = useState(isoToday());
  const [plcLoading, setPlcLoading] = useState(false);
  const [plcSource, setPlcSource] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.id, ""]))
  );
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  function applyPlc(summary: PlcSummary) {
    const byLabel: Record<string, number> = {};
    summary.items.forEach((item) => { byLabel[item.label] = item.total; });

    const newVals: Record<string, string> = {};
    const newSource: Record<string, boolean> = {};

    FIELDS.forEach((f) => {
      if (f.plcKey && byLabel[f.plcKey] != null) {
        const raw = byLabel[f.plcKey];
        newVals[f.id] = String(f.plcDivide ? raw / f.plcDivide : raw);
        newSource[f.id] = true;
      }
    });

    setValues((prev) => {
      const merged = { ...prev, ...newVals };
      return { ...merged, ...calcDerived(merged, date) };
    });
    setPlcSource(newSource);
  }

  useEffect(() => {
    if (!date) return;
    setPlcLoading(true);
    setPlcSource({});
    axios
      .get<PlcSummary>(`${PLC_API_BASE}/api/plc/daily-summary/${date}`)
      .then((r) => applyPlc(r.data))
      .catch(() => {})
      .finally(() => setPlcLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function handleChange(id: string, raw: string) {
    setValues((prev) => {
      const next = { ...prev, [id]: raw };
      return { ...next, ...calcDerived(next, date) };
    });
  }

  function addExtraRow() {
    setExtraRows((prev) => [...prev, { id: `row-${Date.now()}-${Math.random()}`, label: "", value: "" }]);
  }

  function updateExtraRow(id: string, field: "label" | "value", val: string) {
    setExtraRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function removeExtraRow(id: string) {
    setExtraRows((prev) => prev.filter((r) => r.id !== id));
  }

  const derived = calcDerived(values, date);

  function getDisplayVal(f: FieldDef): string {
    const raw = f.readOnly ? (derived[f.id] ?? values[f.id]) : values[f.id];
    if (f.readOnly) {
      return fmt2(raw);
    }
    const fromPlc = plcSource[f.id];
    if (fromPlc && !editing.has(f.id)) return fmt2(raw);
    return raw;
  }

  function buildBody() {
    function item(id: string, label: string, birim: string, val?: string) {
      const v = val ?? values[id];
      const d = derived[id];
      const raw = d !== undefined ? d : v;
      return { ad: label, birim, deger: n(raw) };
    }
    const tuketimExtra = extraRows
      .filter((r) => r.label)
      .map((r) => ({ ad: r.label, birim: "Ton", deger: n(r.value) }));

    return {
      baslik: { dokumanNo: "F.13.36", revizyonNo: "00", yayinTarihi: "5.08.2024" },
      uretim:               FIELDS.filter((f) => f.section === "uretim").map((f)               => item(f.id, f.label, f.unit)),
      tuketim:              [...FIELDS.filter((f) => f.section === "tuketim").map((f)           => item(f.id, f.label, f.unit)), ...tuketimExtra],
      ticariUrunVerimlilik: FIELDS.filter((f) => f.section === "ticariUrunVerimlilik").map((f) => item(f.id, f.label, f.unit)),
      stok:                 FIELDS.filter((f) => f.section === "stok").map((f)                 => item(f.id, f.label, f.unit)),
    };
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitOk(false);
    try {
      await axios.post(`${API_BASE}/api/reports`, {
        reportDate: date,
        body: buildBody(),
        note: note || null,
        createdBy: "web",
      });
      setSubmitOk(true);
      onSuccess?.();
    } catch {
      setSubmitError("Rapor kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex flex-col">
      {/* Date + PLC badge */}
      <div className="bg-blue-100 border-b border-blue-200 px-5 py-4 flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Rapor Tarihi
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg h-9 px-3 text-sm text-slate-800 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(({ key, title }) => {
        const fields = FIELDS.filter((f) => f.section === key);
        const isTuketim = key === "tuketim";

        return (
          <div key={key} className="bg-white border-b border-slate-200">
            <div className="bg-slate-500 px-4 py-2">
              <span className="text-white text-xs font-bold uppercase tracking-widest">{title}</span>
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {fields.map((f, i) => {
                  const isCalc  = !!f.readOnly;
                  const fromPlc = !!plcSource[f.id];
                  const isEdit  = editing.has(f.id);
                  const display = getDisplayVal(f);

                  return (
                    <tr key={f.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="py-2 px-4 text-xs text-slate-700 leading-snug w-1/2">
                        {f.label}
                        {/* {fromPlc && (
                          <span className="ml-1.5 text-[10px] font-semibold text-blue-400 uppercase">plc</span>
                        )} */}
                      </td>
                      <td className="py-1.5 px-2 pr-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={display}
                          readOnly={isCalc}
                          onFocus={() => {
                            if (!isCalc && fromPlc)
                              setEditing((p) => new Set(p).add(f.id));
                          }}
                          onBlur={() =>
                            setEditing((p) => { const s = new Set(p); s.delete(f.id); return s; })
                          }
                          onChange={(e) => handleChange(f.id, e.target.value)}
                          className={[
                            "w-full h-7 px-2 text-xs text-right font-semibold rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors",
                            isCalc
                              ? "bg-slate-100 border-slate-100 text-slate-500 cursor-default"
                              : fromPlc && !isEdit
                              ? "bg-blue-50 border-blue-200 text-slate-900 cursor-pointer focus:cursor-text"
                              : "bg-white border-slate-200 text-slate-900",
                          ].join(" ")}
                        />
                      </td>
                      <td className="py-1.5 px-3 text-xs text-slate-400 whitespace-nowrap w-16 text-right">
                        {f.unit}
                      </td>
                    </tr>
                  );
                })}

                {/* Extra rows (TÜKETİM only) */}
                {isTuketim && extraRows.map((row, i) => (
                  <tr key={row.id} className={(fields.length + i) % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="py-1.5 px-3 flex">
                        <button
                          type="button"
                          onClick={() => removeExtraRow(row.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors mr-1"
                          aria-label="Satırı sil"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      <LabelCombobox
                        value={row.label}
                        onChange={(v) => updateExtraRow(row.id, "label", v)}
                      />
                    </td>
                    <td className="py-1.5 px-2 pr-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.value}
                        onChange={(e) => updateExtraRow(row.id, "value", e.target.value)}
                        placeholder="0"
                        className="w-full h-7 px-2 text-xs text-right font-semibold rounded-md border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-xs text-slate-400 whitespace-nowrap w-16 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-slate-400">Ton</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {isTuketim && (
              <div className="px-4 py-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={addExtraRow}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Satır Ekle
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Note */}
      <div className="bg-white border-b border-slate-200">
        <div className="bg-slate-500 px-4 py-2">
          <span className="text-white text-xs font-bold uppercase tracking-widest">NOT</span>
        </div>
        <div className="px-4 py-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Varsa açıklama veya not ekleyiniz…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Submit */}
      {submitError && <p className="text-xs text-red-600 text-center px-4 pt-3">{submitError}</p>}
      {submitOk    && <p className="text-xs text-green-600 text-center font-semibold px-4 pt-3">Rapor başarıyla kaydedildi.</p>}

      <div className="p-4 bg-blue-100">
        <button
          type="submit"
          disabled={submitting || !date}
          className="w-full h-11 rounded-xl bg-blue-950 text-white text-sm font-semibold hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {submitting ? "Kaydediliyor…" : "Raporu Kaydet"}
        </button>
      </div>
    </form>
  );
}
