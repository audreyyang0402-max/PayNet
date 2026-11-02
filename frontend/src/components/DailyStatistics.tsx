export type DailyStats = {
  sample_days: number;
  orders_per_day: number;
  median_daily_orders: number;
  daily_order_stddev: number;
  average_daily_amount: number;
  days_with_orders: number;
};

export default function DailyStatistics({ stats, merchant = false }: { stats?: DailyStats; merchant?: boolean }) {
  if (!stats) return null;
  return <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
    <h2 className="font-semibold text-slate-900">{merchant ? "Demand planning" : "Your ordering pattern"}</h2>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[
        ["Orders per day", stats.orders_per_day],
        ["Typical day (median)", stats.median_daily_orders],
        ["Daily variation (standard deviation)", stats.daily_order_stddev],
        [merchant ? "Confirmed sales per day" : "Spending per day", `RM ${stats.average_daily_amount.toFixed(2)}`],
      ].map(([label, value]) => <div key={label}><p className="text-xs text-slate-600">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></div>)}
    </div>
    <p className="text-xs leading-relaxed text-slate-600">Based on {stats.sample_days} full calendar days in Malaysia; {stats.days_with_orders} had orders. Includes zero-order days and excludes today because it is still in progress. Order counts include cancelled and pending orders; money includes vendor-confirmed orders only.</p>
    {merchant && <p className="text-sm text-indigo-900">Use these averages as a starting point for staffing. Larger daily variation means demand is less consistent. Check the top dishes below before preparing stock; these observations are not a guarantee of tomorrow’s sales.</p>}
  </section>;
}
