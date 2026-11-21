"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fmt, type City, type Forecast, type Meta } from "@/lib/api";
import { DriverChart, ForecastChart, Spark } from "@/components/charts";
import { exportForecastPdf } from "@/lib/export-pdf";

const ZoneMap = dynamic(() => import("@/components/zone-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div>,
});

const SHIFTS = [
  { label: "Night", icon: "night", from: 0, to: 6 },
  { label: "Morning", icon: "sunrise", from: 6, to: 12 },
  { label: "Afternoon", icon: "sun", from: 12, to: 18 },
  { label: "Evening", icon: "sunset", from: 18, to: 24 },
] satisfies { label: string; icon: IconName; from: number; to: number }[];

type View = "overview" | "forecast" | "drivers" | "table";
type IconName = "brand" | "overview" | "forecast" | "drivers" | "table" | "trips" | "peak" | "revenue" | "calendar" | "download" | "play" | "pause" | "night" | "sunrise" | "sun" | "sunset";

const ICONS: Record<IconName, React.ReactNode> = {
  brand: <><path d="M3 11l1.5-4A2 2 0 0 1 6.4 5.7h11.2a2 2 0 0 1 1.9 1.3L21 11v7h-3v-2H6v2H3v-7z" /><path d="M3 11h18M7 11l1.5-3h7L17 11" /><circle cx="7" cy="14" r=".7" /><circle cx="17" cy="14" r=".7" /></>,
  overview: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  forecast: <><path d="M3 3v18h18" /><path d="m6 14 4-4 4 3 6-7" /></>,
  drivers: <><path d="M3 11l1.5-4A2 2 0 0 1 6.4 5.7h11.2a2 2 0 0 1 1.9 1.3L21 11v7h-3v-2H6v2H3v-7z" /><path d="M3 11h18M7 11l1.5-3h7L17 11" /><circle cx="7" cy="14" r=".7" /><circle cx="17" cy="14" r=".7" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></>,
  trips: <><path d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11z" /><circle cx="12" cy="10" r="2.2" /></>,
  peak: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  revenue: <><path d="M12 2v20M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v3h14v-3" /></>,
  play: <path d="m8 5 12 7-12 7V5z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  night: <path d="M20.8 13A8.5 8.5 0 0 1 11 3.2 8.5 8.5 0 1 0 20.8 13z" />,
  sunrise: <><path d="M3 18h18M5 14a7 7 0 0 1 14 0M12 3v4m-8 3 3 2m13-2-3 2m-5-3 2 2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
  sunset: <><path d="M3 18h18M5 14a7 7 0 0 1 14 0M12 3v4m-8 3 3 2m13-2-3 2m-5-3 2" /><path d="m9 7 3 3 3-3" /></>,
};

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [date, setDate] = useState<string>("");
  const [zone, setZone] = useState<string>("");
  const [hour, setHour] = useState<number>(18);
  const [city, setCity] = useState<City | null>(null);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    if (window.localStorage.getItem("addis-ride-theme") === "light") {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
      setTheme("light");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem("addis-ride-theme", nextTheme);
  }, [theme]);

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m);
      const qs = new URLSearchParams(window.location.search);
      const qz = qs.get("zone");
      const qd = qs.get("date");
      const z = m.zones.find((x) => x.zone.toLowerCase() === (qz ?? "").toLowerCase())?.zone ?? "Kazanchis";
      let d = m.first_day;
      if (qd) {
        if (m.dates.includes(qd)) d = qd;
        else setNotice(`We only forecast 1–14 November 2025, so "${qd}" can't be shown. Showing 1 November.`);
      }
      setZone(z);
      setDate(d);
    }).catch((e) => setError(`Can't reach the forecast server: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!date) return;
    api.city(date).then(setCity).catch((e) => setError(e.message));
  }, [date]);

  useEffect(() => {
    if (!date || !zone) return;
    setError(null);
    api.forecast(zone, date).then(setFc).catch((e) => setError(e.message));
    const url = new URL(window.location.href);
    url.searchParams.set("zone", zone);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url.toString());
  }, [zone, date]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h + 1) % 24), 650);
    return () => clearInterval(t);
  }, [playing]);

  const zoneInfo = useMemo(() => meta?.zones.find((z) => z.zone === zone), [meta, zone]);
  const sidebarZones = useMemo(
    () => [...(city?.zones ?? [])].sort((a, b) => a.zone.localeCompare(b.zone)),
    [city],
  );
  const cityTotal = useMemo(() => (city?.zones ?? []).reduce((a, z) => a + z.total, 0), [city]);
  const cityHour = useMemo(() => (city?.zones ?? []).reduce((a, z) => a + (z.hourly[hour] ?? 0), 0), [city, hour]);
  const pick = useCallback((z: string) => setZone(z), []);
  const downloadForecastPdf = useCallback(() => {
    if (!fc || !meta) return;
    try {
      exportForecastPdf(fc, meta, zone);
    } catch (e) {
      setError(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [fc, meta, zone]);

  if (error && !meta) {
    return (
      <main className="grid min-h-screen place-items-center p-8 bg-ink-950">
        <div className="glass max-w-md p-8 text-center">
          <div className="mb-4 flex justify-center text-accent"><Icon name="brand" className="h-10 w-10" /></div>
          <h1 className="text-xl font-bold text-white">Forecast server not reachable</h1>
          <p className="mt-3 text-sm text-slate-400">{error}</p>
          <p className="mt-4 text-xs text-slate-500">Start it with <code className="text-accent px-2 py-1 rounded-lg bg-accent/10">python app/app.py</code></p>
        </div>
      </main>
    );
  }

  const k = fc?.kpis;
  const h = fc?.hours[hour];

  const NAV_ITEMS: { id: View; icon: IconName; label: string }[] = [
    { id: "overview", icon: "overview", label: "Overview" },
    { id: "forecast", icon: "forecast", label: "Forecast" },
    { id: "drivers", icon: "drivers", label: "Driver Plan" },
    { id: "table", icon: "table", label: "Data Table" },
  ];

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden">
      {/* ════════ SIDEBAR ════════════════════════════════════════════ */}
      <aside id="dashboard-sidebar" data-open={sidebarOpen} className={`sidebar relative flex h-screen min-h-0 flex-col overflow-x-hidden transition-all duration-300 ease-out ${sidebarOpen ? "w-[280px] overflow-y-auto" : "w-0 overflow-visible"} shrink-0`}>

        {/* ── Sidebar body (only rendered when open) ── */}
        {sidebarOpen && (
          <>
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-3 px-4 py-5 border-b border-white/5">
        <div className="theme-keep-white grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent via-rose to-violet text-white shadow-lg shadow-accent/20">
            <Icon name="brand" className="h-5 w-5" />
          </div>
          <div className="leading-tight overflow-hidden">
            <div className="text-[15px] font-bold tracking-tight text-white whitespace-nowrap">Addis Ride</div>
            <div className="text-[10px] font-medium text-slate-500 whitespace-nowrap">Demand Forecasting</div>
          </div>
          <button onClick={() => setSidebarOpen(false)}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar">
            ◁
          </button>
        </div>

        {/* Navigation */}
        <nav className="shrink-0 px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-600">Dashboard</div>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => {
              setView(item.id);
              if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
            }}
                    className={`sidebar-nav-item w-full ${view === item.id ? "active" : ""}`}>
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Zone selector (sidebar) */}
        <div className="shrink-0 px-4 py-3 border-t border-white/5">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Select zone</div>
          {meta && <ZoneSelect zones={meta.zones} value={zone} onChange={setZone} />}
          {zoneInfo && (
            <div className="mt-2 flex items-center gap-2">
              <span className="badge badge-accent">{zoneInfo.type_label}</span>
              <span className="badge">{zoneInfo.fare.toFixed(0)} birr</span>
            </div>
          )}
        </div>

        {/* Zone list (sidebar) */}
        <div className="flex min-h-[12rem] flex-1 shrink-0 flex-col border-t border-white/5 px-3 py-2">
          <div className="mb-2 flex shrink-0 items-center justify-between px-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">
            <span>All Zones</span>
            <span className="normal-case tracking-normal text-slate-300">· {fmt.hour(hour)}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain scrollbar-thin">
            {sidebarZones.map((z) => {
              const selected = z.zone === zone;
              const tripsPerDriverHour = meta?.trips_per_driver_hour ?? 1.3;
              const drivers = Math.ceil((z.hourly[hour] ?? 0) / tripsPerDriverHour);
              return (
              <button key={z.zone} onClick={() => setZone(z.zone)}
                      className={`leader-row w-full text-left ${selected ? "active" : ""}`}>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected ? "bg-accent" : "bg-sky"}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-100 truncate">
                    {z.zone}
                  </div>
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-200">
                  {fmt.int(drivers)}
                </span>
              </button>
              );
            })}
          </div>
        </div>

        {/* Model info (bottom) */}
        {meta && (
          <div className="shrink-0 px-4 py-3 border-t border-white/5 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-600">Model</div>
            <div className="text-[11px] text-slate-400">
              <span className="text-slate-200 font-semibold">{meta.model.name}</span>
              <br />{meta.model.n_features} features · trained {meta.model.trained_on}
            </div>
            <div className="flex gap-2 mt-1">
              <span className="badge badge-mint">RMSE {meta.model.rmse}</span>
              <span className="badge">{Math.round(100 * (1 - meta.model.rmse / meta.model.baseline_rmse))}% vs baseline</span>
            </div>
          </div>
        )}
          </>
        )}
      </aside>
      {sidebarOpen && (
        <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />
      )}

      {/* ════════ MAIN CONTENT ═══════════════════════════════════════ */}
      <main className="dashboard-main flex-1 min-w-0 overflow-y-auto scrollbar-thin bg-ambient">
        {/* ── Top header bar ─────────────────────────────────────── */}
        <header className="dashboard-header sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
          <div className="dashboard-header-inner flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">
                  {view === "overview" && "Dashboard Overview"}
                  {view === "forecast" && `24-Hour Forecast`}
                  {view === "drivers" && "Driver Planning"}
                  {view === "table" && "Hourly Data"}
                </h1>
                <p className="text-[11px] text-slate-500">
                  {zone} · {date ? fmt.day(date).long : "Loading..."} · {city?.weekday ?? ""}
                </p>
              </div>
            </div>
            <div className="dashboard-header-actions flex items-center gap-3">
              {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" aria-controls="dashboard-sidebar"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10">
                  ☰
                </button>
              )}
              {meta && (
                <>
                  <span className="header-meta badge">Team {meta.team}</span>
                  <span className="header-meta badge badge-accent">RMSE {meta.model.rmse}</span>
                </>
              )}
              <button onClick={toggleTheme} aria-pressed={theme === "light"}
                      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                      className="theme-toggle">
                <Icon name={theme === "dark" ? "sun" : "night"} className="h-4 w-4" />
              </button>
              <button onClick={downloadForecastPdf} disabled={!fc || !meta}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Export forecast as PDF">
                <Icon name="download" className="h-4 w-4" />
                <span className="hidden sm:inline">Export PDF</span>
              </button>
              <div className="header-avatar theme-keep-white h-9 w-9 rounded-full bg-gradient-to-br from-accent to-violet grid place-items-center text-xs font-bold text-white shadow-lg">
                TD
              </div>
            </div>
          </div>
        </header>

        <div className="dashboard-content px-4 py-5 space-y-5 lg:pr-0">
          {/* Notices */}
          {notice && (
            <div className="flex items-start gap-3 glass-sm px-4 py-3 text-sm text-sky-100 border-sky/30 bg-sky/10 animate-in">
              <span>📅</span><span className="flex-1">{notice}</span>
              <button className="text-slate-400 hover:text-white transition" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
            </div>
          )}
          {error && meta && (
            <div className="glass-sm px-4 py-3 text-sm text-red-200 border-red-400/30 bg-red-500/10 animate-in">{error}</div>
          )}

          {/* ── Date strip ──────────────────────────────────────── */}
          <section className="animate-in">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
              <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Forecast day</span>
              {meta?.dates.map((d) => {
                const f = fmt.day(d);
                const on = d === date;
                return (
                  <button key={d} onClick={() => setDate(d)} aria-pressed={on}
                          className={`forecast-date flex shrink-0 items-baseline gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] transition ${on ? "theme-keep-white" : ""}
                            ${on ? "glow border-accent bg-accent font-semibold text-white" : "border-white/[.06] bg-ink-850/80 text-slate-300 hover:border-white/15 hover:bg-ink-800"}`}>
                    <span className={`text-[10px] font-semibold uppercase ${on ? "text-white/85" : f.weekend ? "text-accent/80" : "text-slate-500"}`}>{f.dow}</span>
                    <span className="font-bold">{f.num}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ══════ VIEW: OVERVIEW ══════════════════════════════════ */}
          {view === "overview" && (
            <>
              {/* KPI row */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Trips expected" value={k ? fmt.int(k.total) : "–"} color="#ff7a45" icon="trips"
                     sub={k ? <span><Delta v={k.vs_usual_pct} /> vs usual {fc?.weekday}</span> : null} delay={0} />
                <Kpi label="Peak hour" value={k?.peak_hour ?? "–"} color="#4c9bff" icon="peak"
                     sub={k ? `${fmt.int(k.peak_trips)} trips · ${Math.round(k.peak_range[0])}–${Math.round(k.peak_range[1])} range` : null} delay={1} />
                <Kpi label="Drivers at peak" value={k ? String(k.peak_drivers) : "–"} color="#2bd4a4" icon="drivers"
                     sub={k ? `${fmt.int(k.driver_hours)} driver-hours today` : null} delay={2} />
                <Kpi label="Gross fares" value={k ? `${fmt.birr(k.gross_fares)}` : "–"} unit="birr" color="#a78bfa" icon="revenue"
                     sub={fc ? `at ${fc.fare.toFixed(0)} birr/trip avg` : null} delay={3} />
              </section>

              {/* Map + Zone panel */}
              <section className="grid gap-5 lg:grid-cols-12 animate-in animate-in-d2">

                {/* Map card */}
                <div className="overview-map-card glass relative min-w-0 overflow-hidden lg:col-span-7">
                  {/* Map fills the space between the city-stats overlay and the scrubber */}
                  <div className="absolute inset-0">
                    {meta && <ZoneMap zones={meta.zones} city={city?.zones ?? null} hour={hour} selected={zone} onSelect={pick} lightMode={theme === "light"} />}
                  </div>

                  {/* Map overlay: city demand stats */}
                  <div className="pointer-events-none absolute left-4 top-4 z-10">
                    <div className="rounded-2xl border border-white/10 bg-ink-950/80 px-4 py-3 backdrop-blur-lg">
                      <div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">
                        City demand · {fmt.hour(hour)}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-white">{fmt.int(cityHour)}</span>
                        <span className="text-xs font-medium text-slate-400">trips/hr</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{fmt.int(cityTotal)} total today · tap a zone</div>
                    </div>
                  </div>

                  {/* Hour scrubber — pinned to bottom */}
                  <div className="absolute inset-x-4 bottom-4 z-10">
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/85 px-4 py-3 backdrop-blur-lg">
                      <button onClick={() => setPlaying((p) => !p)}
                              className="theme-keep-white grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-r from-accent to-rose text-white shadow-lg shadow-accent/30 transition hover:scale-110 active:scale-95"
                              aria-label={playing ? "Pause" : "Play the day"}>
                        <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
                      </button>
                      <div className="flex-1">
                        <input type="range" min={0} max={23} value={hour} className="scrub"
                               onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }} aria-label="Hour of day" />
                        <div className="relative mt-1 h-3 text-[9px] font-medium text-slate-500">
                          {[0, 3, 6, 9, 12, 15, 18, 21].map((x) => (
                            <span key={x} className={`absolute -translate-x-1/2 ${x % 6 ? "hidden sm:inline" : ""}`}
                                  style={{ left: `calc(9px + (100% - 18px) * ${x / 23})` }}>{fmt.hour(x)}</span>
                          ))}
                        </div>
                      </div>
                      <div className="w-16 text-right text-lg font-bold tabular-nums text-white">{fmt.hour(hour)}</div>
                    </div>
                  </div>
                </div>

                {/* Right panel: zone info + leaderboard */}
                <div className="overview-zone-panel flex min-w-0 flex-col gap-5 lg:col-span-5">
                  {/* Zone header */}
                  <div className="glass p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Selected Zone</div>
                        {meta && <ZoneSelect zones={meta.zones} value={zone} onChange={setZone} prominent />}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="badge badge-accent">{zoneInfo?.type_label}</span>
                          <span className="badge">{zoneInfo?.fare.toFixed(0)} birr avg</span>
                        </div>
                      </div>
                      {h && (
                        <div className="glass-sm px-4 py-3 text-right shrink-0">
                          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">at {h.time}</div>
                          <div className="text-2xl font-bold text-accent">{fmt.int(h.forecast)}</div>
                          <div className="text-[10px] text-slate-400">{h.drivers} drivers</div>
                        </div>
                      )}
                    </div>
                    {/* Lookup chips */}
                    <div className="mt-4 border-t border-white/5 pt-4">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Context & Events</div>
                      <div className="flex flex-wrap gap-2">
                        {fc?.lookup.chips.map((c, i) => (
                          <span key={i} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold
                            ${c.kind === "event" ? "border-sky/30 bg-sky/10 text-sky-100"
                              : c.kind === "rain" ? "border-mint/30 bg-mint/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-slate-300"}`}>
                            <span>{c.icon}</span>{c.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick sparkline leaderboard — fills remaining height */}
                  <div className="glass p-4 flex flex-col flex-1 min-h-0">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <h3 className="text-sm font-bold text-white">Zone Leaderboard</h3>
                      <span className="text-[10px] text-slate-500">{city?.weekday}</span>
                    </div>
                    <div className="space-y-0.5 overflow-y-auto scrollbar-thin flex-1 min-h-0">
                      {city?.zones.map((z, i) => {
                        const pct = z.usual_total ? 100 * (z.total / z.usual_total - 1) : 0;
                        const on = z.zone === zone;
                        return (
                          <button key={z.zone} onClick={() => setZone(z.zone)}
                                  className={`leader-row w-full text-left ${on ? "active" : ""}`}>
                            <span className="w-5 text-[10px] font-bold text-slate-600">{i + 1}</span>
                            <span className="flex-1 text-[12px] font-semibold text-slate-200">{z.zone}{z.has_event && <><span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-sky" /><span className="sr-only">, event scheduled</span></>}</span>
                            <Spark values={z.hourly} color={on ? "#ff7a45" : "#4c9bff"} />
                            <span className="w-12 text-right text-[11px] font-bold tabular-nums text-white">{fmt.int(z.total)}</span>
                            <span className="w-12 text-right text-[10px]"><Delta v={pct} /></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Mini forecast preview */}
              <section className="glass p-5 animate-in animate-in-d3 mt-4">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-white">24-Hour Curve</h2>
                    <p className="text-xs text-slate-400">{zone} · {fc ? fmt.day(fc.date).long : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-[10px] text-slate-400">
                    <Legend swatch={<span className="h-0.5 w-5 rounded bg-accent" />} label="Forecast" />
                    <Legend swatch={<span className="h-3 w-5 rounded bg-accent/25" />} label="80% range" />
                    <Legend swatch={<span className="h-0 w-5 border-t-2 border-dashed border-slate-400" />} label="Usual" />
                    {!!fc?.events.length && <Legend swatch={<span className="h-3 w-5 rounded border border-sky/50 bg-sky/20" />} label="Event" />}
                  </div>
                </div>
                {fc && <ForecastChart hours={fc.hours} events={fc.events} hour={hour} onHover={setHour} lightMode={theme === "light"} />}
              </section>
            </>
          )}

          {/* ══════ VIEW: FORECAST ════════════════════════════════════ */}
          {view === "forecast" && (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in">
                <Kpi label="Total Trips" value={k ? fmt.int(k.total) : "–"} color="#ff7a45" icon="trips"
                     sub={k ? <span><Delta v={k.vs_usual_pct} /> vs usual</span> : null} delay={0} />
                <Kpi label="Peak Hour" value={k?.peak_hour ?? "–"} color="#4c9bff" icon="peak"
                     sub={k ? `${fmt.int(k.peak_trips)} trips` : null} delay={1} />
                <Kpi label="Peak Drivers" value={k ? String(k.peak_drivers) : "–"} color="#2bd4a4" icon="drivers"
                     sub={k ? `${fmt.int(k.driver_hours)} driver-hrs` : null} delay={2} />
                <Kpi label="Revenue" value={k ? `${fmt.birr(k.gross_fares)}` : "–"} unit="birr" color="#a78bfa" icon="revenue"
                     sub={fc ? `${fc.fare.toFixed(0)} birr/trip` : null} delay={3} />
              </section>
              <section className="glass p-5 animate-in animate-in-d1">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">Hourly Forecast · {zone}</h2>
                    <p className="text-sm text-slate-400">{fc ? fmt.day(fc.date).long : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-[10px] text-slate-400">
                    <Legend swatch={<span className="h-0.5 w-5 rounded bg-accent" />} label="Forecast" />
                    <Legend swatch={<span className="h-3 w-5 rounded bg-accent/25" />} label="80% range" />
                    <Legend swatch={<span className="h-0 w-5 border-t-2 border-dashed border-slate-400" />} label="Usual day" />
                    {!!fc?.events.length && <Legend swatch={<span className="h-3 w-5 rounded border border-sky/50 bg-sky/20" />} label="Event window" />}
                  </div>
                </div>
                {fc && <ForecastChart hours={fc.hours} events={fc.events} hour={hour} onHover={setHour} lightMode={theme === "light"} />}
              </section>

              {/* Lookup context */}
              <section className="glass p-5 animate-in animate-in-d2">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Weather & Events Lookup</div>
                <div className="flex flex-wrap gap-2">
                  {fc?.lookup.chips.map((c, i) => (
                    <span key={i} className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold
                      ${c.kind === "event" ? "border-sky/30 bg-sky/10 text-sky-100"
                        : c.kind === "rain" ? "border-mint/30 bg-mint/10 text-emerald-100"
                        : "border-white/10 bg-white/5 text-slate-300"}`}>
                      <span className="text-base">{c.icon}</span>{c.text}
                    </span>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* ══════ VIEW: DRIVERS ═════════════════════════════════════ */}
          {view === "drivers" && (
            <>
              <section className="glass p-5 animate-in">
                <h2 className="text-xl font-bold tracking-tight text-white">Driver Staffing Plan</h2>
                <p className="mb-4 text-sm text-slate-400">
                  Bars: forecast ÷ {meta?.trips_per_driver_hour} trips/driver-hour (orange = busiest) ·
                  <span className="text-mint"> green ticks</span>: safe staffing at 80% upper bound
                </p>
                {fc && <DriverChart hours={fc.hours} hour={hour} lightMode={theme === "light"} />}
              </section>

              {/* Shift cards */}
              {fc && (
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in animate-in-d1">
                  {SHIFTS.map((s) => {
                    const hs = fc.hours.filter((h) => h.hour >= s.from && h.hour < s.to);
                    const peak = Math.max(...hs.map((h) => h.drivers));
                    const safe = Math.max(...hs.map((h) => h.drivers_safe));
                    const trips = hs.reduce((a, h) => a + h.forecast, 0);
                    const active = hour >= s.from && hour < s.to;
                    return (
                      <div key={s.label}
                           className={`glass glass-hover p-4 ${active ? "border-accent/30 glow" : ""}`}>
                        <div className="flex items-center gap-2">
                          <Icon name={s.icon} className="h-4 w-4 text-accent" />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{s.label}</span>
                        </div>
                        <div className="text-[10px] tabular-nums text-slate-500 mt-0.5">{fmt.hour(s.from)}–{fmt.hour(s.to % 24)}</div>
                        <div className="mt-3 text-3xl font-bold tabular-nums text-white">{fmt.int(peak)}<span className="ml-1.5 text-xs font-medium text-slate-400">drivers</span></div>
                        <div className="mt-1 text-xs text-slate-400">
                          <span className="text-mint font-semibold">{fmt.int(safe)} safe</span> · {fmt.int(trips)} trips
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
            </>
          )}

          {/* ══════ VIEW: TABLE ═══════════════════════════════════════ */}
          {view === "table" && fc && (
            <section className="glass overflow-hidden animate-in">
              <div className="data-table-header flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">Hourly Data · {zone}</h2>
                  <p className="text-xs text-slate-400">{fmt.day(fc.date).long} — all numbers behind the charts</p>
                </div>
                <a download={`forecast_${fc.zone.toLowerCase().replace(/ /g, "_")}_${fc.date}.csv`}
                   href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(fc))}`}
                   className="glass-sm px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition flex items-center gap-2">
                  <Icon name="download" className="h-4 w-4" /> Export CSV
                </a>
              </div>
              <div className="data-table-scroll scrollbar-thin max-h-[600px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-850/95 backdrop-blur text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>{["Hour", "Forecast", "80% Range", "Usual", "Drivers", "Safe", "Fares (birr)", "Temp", "Rain", "Event"].map((c) =>
                      <th key={c} className="px-4 py-3 text-right font-bold first:text-left border-b border-white/5">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {fc.hours.map((r) => (
                      <tr key={r.hour} onMouseEnter={() => setHour(r.hour)}
                          className={`border-t border-white/[.04] tabular-nums transition ${r.hour === hour ? "bg-accent/10" : "hover:bg-white/[.03]"}`}>
                        <td className="px-4 py-2.5 font-bold text-slate-200">{r.time}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-white">{fmt.one(r.forecast)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{Math.round(r.lower_80)}–{Math.round(r.upper_80)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{fmt.one(r.typical)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-200">{r.drivers}</td>
                        <td className="px-4 py-2.5 text-right text-mint font-semibold">{r.drivers_safe}</td>
                        <td className="px-4 py-2.5 text-right text-slate-200">{fmt.int(r.fares)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{r.temp_c.toFixed(1)}°</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{r.rain_mm > 0 ? r.rain_mm : "–"}</td>
                        <td className="px-4 py-2.5 text-right">{r.event && <span aria-label="Event window" className="mx-auto block h-1.5 w-1.5 rounded-full bg-sky" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4 pt-2 text-[10px] text-slate-600">
            <span>Team {meta?.team} · Qiyas AI Hackathon · {meta?.model.name} · {meta?.model.n_features} features</span>
            <span>Validation RMSE {meta?.model.rmse} · MAE {meta?.model.mae} · synthetic data</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function toCsv(fc: Forecast) {
  const head = "hour,forecast_trips,lower_80,upper_80,usual_day,drivers_needed,drivers_safe,gross_fares_birr,temp_c,rain_mm,event_window";
  return [head, ...fc.hours.map((r) => [r.time, r.forecast, r.lower_80, r.upper_80, r.typical, r.drivers, r.drivers_safe, r.fares, r.temp_c, r.rain_mm, r.event ? 1 : 0].join(","))].join("\n");
}

function ZoneSelect({ zones, value, onChange, prominent = false }: {
  zones: Meta["zones"]; value: string; onChange: (zone: string) => void; prominent?: boolean;
}) {
  return (
    <div className={`zone-select-wrap ${prominent ? "zone-select-wrap-prominent" : ""}`}>
      <select aria-label="Select zone" value={value} onChange={(e) => onChange(e.target.value)} className="zone-select">
        {zones.map((z) => <option key={z.zone} value={z.zone}>{z.zone}</option>)}
      </select>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="zone-select-chevron">
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Kpi({ label, value, unit, sub, color, delay = 0 }: {
  label: string; value: string; unit?: string; sub: React.ReactNode; color: string; icon: IconName; delay?: number;
}) {
  return (
    <div className={`glass glass-hover relative p-4 animate-in animate-in-d${delay}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="kpi-value mt-2 text-[34px] font-bold leading-none tracking-tight text-white">
        {value}{unit && <span className="kpi-unit ml-1.5 text-sm font-semibold text-slate-400">{unit}</span>}
      </div>
      <div className="mt-1.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return <span className={`font-bold ${up ? "text-mint" : "text-rose"}`}>{up ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%</span>;
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return <span className="flex items-center gap-2">{swatch}{label}</span>;
}
