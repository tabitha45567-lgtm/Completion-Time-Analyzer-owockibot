import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Zap,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const BOUNTIES_URL = "https://bounty.owockibot.xyz/bounties";
const STATS_URL = "https://bounty.owockibot.xyz/stats";

function classifyType(b) {
  const text = `${b.title || ""} ${b.description || ""} ${(b.tags || []).join(" ")}`.toLowerCase();
  if (/\bweekly\b|\bweekend\b|this week/.test(text)) return "Weekly";
  return "Thematic";
}

function parseReward(b) {
  const n = parseFloat(String(b.rewardFormatted || "0").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

function short(addr) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function fmtHours(h) {
  if (h == null || !isFinite(h)) return "—";
  if (h < 1) return Math.round(h * 60) + "m";
  if (h < 48) return h.toFixed(1) + "h";
  return (h / 24).toFixed(1) + "d";
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function BountyAnalytics() {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [raw, setRaw] = useState([]);
  const [totals, setTotals] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const load = async () => {
    setStatus("loading");
    setError(null);
    try {
      const [bounties, stats] = await Promise.all([
        fetchJson(BOUNTIES_URL),
        fetchJson(STATS_URL).catch(() => null),
      ]);
      setRaw(Array.isArray(bounties) ? bounties : []);
      setTotals(stats);
      setLastRefreshed(new Date());
      setStatus("ok");
    } catch (e) {
      setError(String(e.message || e));
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const derived = useMemo(() => {
    return raw.map((b) => {
      const firstSubmittedAt = b.submissions?.[0]?.submittedAt ?? null;
      let hoursToSubmit = null;
      if (b.claimedAt && firstSubmittedAt) {
        const h = (firstSubmittedAt - b.claimedAt) / 3_600_000;
        if (isFinite(h) && h >= 0) hoursToSubmit = h;
      }
      return {
        id: b.id,
        title: b.title,
        type: classifyType(b),
        status: b.status,
        rewardUSD: parseReward(b),
        claimedBy: b.claimedBy ? b.claimedBy.toLowerCase() : null,
        claimedAt: b.claimedAt || null,
        createdAt: typeof b.createdAt === "number" ? b.createdAt : Date.parse(b.createdAt) || null,
        submissionTimes: (b.submissions || []).map((s) => s.submittedAt).filter(Boolean),
        hoursToSubmit,
      };
    });
  }, [raw]);

  const claimToSubmit = useMemo(() => {
    const valid = derived.filter((d) => d.hoursToSubmit != null);
    const hours = valid.map((d) => d.hoursToSubmit);
    return {
      count: valid.length,
      avg: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
      med: median(hours),
    };
  }, [derived]);

  const fastest = useMemo(() => {
    const byBuilder = new Map();
    for (const d of derived) {
      if (!d.claimedBy || d.hoursToSubmit == null) continue;
      if (!byBuilder.has(d.claimedBy)) byBuilder.set(d.claimedBy, []);
      byBuilder.get(d.claimedBy).push(d.hoursToSubmit);
    }
    return [...byBuilder.entries()]
      .map(([addr, hours]) => ({
        addr,
        avgHours: hours.reduce((a, b) => a + b, 0) / hours.length,
        count: hours.length,
      }))
      .sort((a, b) => a.avgHours - b.avgHours)
      .slice(0, 8);
  }, [derived]);

  const completionByType = useMemo(() => {
    const groups = { Weekly: { claimed: 0, completed: 0 }, Thematic: { claimed: 0, completed: 0 } };
    for (const d of derived) {
      if (!d.claimedAt) continue;
      groups[d.type].claimed += 1;
      if (d.status === "completed") groups[d.type].completed += 1;
    }
    return Object.entries(groups).map(([type, g]) => ({
      type,
      rate: g.claimed ? Math.round((g.completed / g.claimed) * 100) : 0,
      claimed: g.claimed,
      completed: g.completed,
    }));
  }, [derived]);

  const activityTrend = useMemo(() => {
    const byDay = new Map();
    for (const d of derived) {
      for (const t of d.submissionTimes) {
        const day = new Date(t).toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) || 0) + 1);
      }
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, count]) => ({ day: day.slice(5), submissions: count }));
  }, [derived]);

  return (
    <div className="min-h-screen bg-[#171016] text-[#F2E9E4] font-sans">
      <header className="border-b border-[#3A2A30] px-6 py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#C9A98C]">
            <Clock size={12} />
            owockibot bounty board
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1 tracking-tight">
            Builder Speed &amp; Completion Ledger
          </h1>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-[#3A2A30] bg-[#241A1F] px-4 py-2 text-sm font-medium hover:border-[#E8A33D] transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto space-y-8">
        <div className="rounded-xl border border-[#3A2A30] bg-[#1E1519] p-4 flex items-start gap-2 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-[#C9A98C]" />
          <p className="text-[#C9A98C]">
            The bounty API has no "weekly vs thematic" field — bounties here
            are sorted into <span className="text-[#E8A33D]">Weekly</span> or{" "}
            <span className="text-[#E8A33D]">Thematic</span> by a keyword
            match on the title/tags, not an official category. "Time to
            submit" measures from the current claim to the first submission
            after it — bounties that were reclaimed after a rejection may not
            reflect the original builder's pace.
            {totals && (
              <>
                {" "}
                Analyzing {raw.length} of {totals.totalBounties} total bounties
                (the API returns only the most recent batch).
              </>
            )}
          </p>
        </div>

        {status === "loading" && <p className="text-sm text-[#C9A98C]">Loading bounty data…</p>}
        {status === "error" && (
          <div className="flex items-start gap-2 text-sm text-[#FF8B6B]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{error || "Could not reach the bounty board API."}</p>
          </div>
        )}

        {status === "ok" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={<Clock size={16} />}
                label="Avg time to submit"
                value={fmtHours(claimToSubmit.avg)}
                sub={`median ${fmtHours(claimToSubmit.med)}`}
                color="#E8A33D"
              />
              <StatCard
                icon={<Zap size={16} />}
                label="Fastest builder"
                value={fastest[0] ? fmtHours(fastest[0].avgHours) : "—"}
                sub={fastest[0] ? short(fastest[0].addr) : "no data"}
                color="#7BC9A3"
              />
              <StatCard
                icon={<TrendingUp size={16} />}
                label="Weekly completion"
                value={
                  completionByType.find((c) => c.type === "Weekly")?.rate + "%"
                }
                sub={`${completionByType.find((c) => c.type === "Weekly")?.claimed || 0} claimed`}
                color="#8FA6C9"
              />
              <StatCard
                icon={<TrendingUp size={16} />}
                label="Thematic completion"
                value={
                  completionByType.find((c) => c.type === "Thematic")?.rate + "%"
                }
                sub={`${completionByType.find((c) => c.type === "Thematic")?.claimed || 0} claimed`}
                color="#D98CA0"
              />
            </div>

            <section className="rounded-xl border border-[#3A2A30] bg-[#1E1519] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C9A98C] mb-4">
                Fastest completers (avg time from claim to first submission)
              </h2>
              {fastest.length === 0 ? (
                <p className="text-sm text-[#7A6560]">Not enough claim/submission data yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {fastest.map((f, i) => (
                    <div
                      key={f.addr}
                      className="flex items-center justify-between text-sm bg-[#171016] rounded-lg px-3 py-2 border border-[#3A2A30]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[#7A6560] w-5 text-right">{i + 1}</span>
                        <span className="font-mono">{short(f.addr)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[#C9A98C]">
                        <span>{f.count} {f.count === 1 ? "bounty" : "bounties"}</span>
                        <span className="font-mono text-[#E8A33D]">{fmtHours(f.avgHours)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-[#3A2A30] bg-[#1E1519] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C9A98C] mb-4">
                Completion rate by bounty type
              </h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={completionByType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3A2A30" />
                    <XAxis dataKey="type" stroke="#C9A98C" fontSize={12} />
                    <YAxis stroke="#C9A98C" fontSize={12} unit="%" />
                    <Tooltip
                      contentStyle={{
                        background: "#171016",
                        border: "1px solid #3A2A30",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="rate" name="Completion %" fill="#E8A33D" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-[#3A2A30] bg-[#1E1519] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C9A98C] mb-4">
                Builder activity over time (submissions per day)
              </h2>
              {activityTrend.length === 0 ? (
                <p className="text-sm text-[#7A6560]">No submission timestamps in this sample.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activityTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3A2A30" />
                      <XAxis dataKey="day" stroke="#C9A98C" fontSize={11} />
                      <YAxis stroke="#C9A98C" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "#171016",
                          border: "1px solid #3A2A30",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="submissions"
                        stroke="#8FA6C9"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <footer className="text-xs text-[#7A6560] pb-6 space-y-1">
              <p>Source: bounty.owockibot.xyz/bounties and /stats, fetched live in your browser.</p>
              {lastRefreshed && <p>Last refreshed {lastRefreshed.toLocaleTimeString()}</p>}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="rounded-lg bg-[#1E1519] border border-[#3A2A30] p-3">
      <div className="flex items-center gap-1.5 text-xs text-[#C9A98C]">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="text-lg font-mono font-semibold mt-1">{value}</div>
      <div className="text-[11px] text-[#7A6560] mt-0.5">{sub}</div>
    </div>
  );
    }
