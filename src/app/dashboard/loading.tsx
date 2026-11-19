export default function DashboardLoading() {
  return (
    <div className="min-h-screen pb-6" style={{ background: "#060b18" }}>
      {/* Header skeleton */}
      <div className="h-14 w-full" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: "rgba(0,212,168,0.2)" }} />
            <div className="w-24 h-4 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>
          <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-5 sm:space-y-7">
        {/* Welcome banner skeleton */}
        <div className="rounded-3xl px-7 py-7 animate-pulse" style={{ background: "linear-gradient(135deg, #060b18 0%, #0a1628 60%, #0d1f3c 100%)", minHeight: 100 }}>
          <div className="w-32 h-3 rounded mb-3" style={{ background: "rgba(0,212,168,0.2)" }} />
          <div className="w-64 h-8 rounded mb-2" style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="w-48 h-4 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>

        {/* Prime Cost Command Center skeleton */}
        <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "linear-gradient(135deg, #0a0f1e, #0f1a2e)", border: "1px solid rgba(0,212,168,0.1)", minHeight: 160 }}>
          <div className="px-6 pt-5 pb-2">
            <div className="w-48 h-3 rounded" style={{ background: "rgba(0,212,168,0.15)" }} />
          </div>
          <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0,1,2].map(i => (
              <div key={i} className="rounded-xl p-4 h-28" style={{ background: "rgba(255,255,255,0.03)" }} />
            ))}
          </div>
        </div>

        {/* KPI strip skeleton */}
        <div className="rounded-2xl p-6 animate-pulse" style={{ background: "linear-gradient(135deg, #0a0f1e, #0f172a)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl p-5 h-20" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        </div>

        {/* Location cards skeleton */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="w-40 h-4 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.1)" }} />
            <div className="w-24 h-3 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "linear-gradient(135deg, #0a0f1e, #0f172a)", border: "1px solid rgba(255,255,255,0.07)", minHeight: 200 }}>
                <div className="h-1 w-full" style={{ background: "rgba(0,212,168,0.15)" }} />
                <div className="p-5 space-y-3">
                  <div className="w-32 h-4 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
                  <div className="w-20 h-3 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <div className="rounded-xl h-20" style={{ background: "rgba(0,212,168,0.05)" }} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg h-12" style={{ background: "rgba(255,255,255,0.04)" }} />
                    <div className="rounded-lg h-12" style={{ background: "rgba(255,255,255,0.04)" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center justify-center py-4 gap-3">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#00d4a8", animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#00d4a8", animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#00d4a8", animationDelay: "300ms" }} />
          <span className="text-xs text-gray-500 ml-1">Loading your dashboard…</span>
        </div>
      </main>
    </div>
  );
}
