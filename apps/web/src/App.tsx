import { useEffect, useMemo, useState } from "react";

type Device = {
  id: string;
  name: string;
  location: string | null;
  edition: string;
  enabled: boolean;
};
type ApiResult<T> = {
  data?: T;
  meta?: { outcome?: string; failedOperations?: number; durationMs?: number };
  error?: { message?: string };
};
type HubPage = "overview" | "sites" | "connectivity" | "alerts" | "settings";
type SitePage =
  | "overview"
  | "monitoring"
  | "interfaces"
  | "rules"
  | "aliases"
  | "compatibility"
  | "vpn"
  | "site-settings";

const hubNavigation: { id: HubPage; label: string; icon: string }[] = [
  { id: "overview", label: "Hub Overview", icon: "⌂" },
  { id: "sites", label: "Sites", icon: "▦" },
  { id: "connectivity", label: "Connectivity", icon: "⌁" },
  { id: "alerts", label: "Alerts", icon: "♧" },
  { id: "settings", label: "Hub Settings", icon: "⚙" },
];

const siteNavigation: { id: SitePage; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "monitoring", label: "Monitoring", icon: "⌁" },
  { id: "interfaces", label: "Interfaces", icon: "▤" },
  { id: "rules", label: "Firewall Rules", icon: "◈" },
  { id: "aliases", label: "Aliases", icon: "◇" },
  { id: "compatibility", label: "Compatibility", icon: "✓" },
  { id: "vpn", label: "VPN", icon: "⛨" },
  { id: "site-settings", label: "Site Settings", icon: "⚙" },
];

const sitePageLabels: Record<SitePage, string> = {
  overview: "Overview",
  monitoring: "Monitoring",
  interfaces: "Interfaces",
  rules: "Firewall Rules",
  aliases: "Aliases",
  compatibility: "Compatibility",
  vpn: "VPN",
  "site-settings": "Site Settings",
};

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [apiStatus, setApiStatus] = useState<"loading" | "connected" | "offline">("loading");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hubPage, setHubPage] = useState<HubPage>("overview");
  const [selectedSite, setSelectedSite] = useState<Device | null>(null);
  const [sitePage, setSitePage] = useState<SitePage>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadDevices() {
    setApiStatus("loading");
    try {
      const response = await fetch("/api/v1/devices");
      if (!response.ok) throw new Error(`Manager API returned HTTP ${response.status}`);
      const body = (await response.json()) as ApiResult<Device[]>;
      if (!Array.isArray(body.data)) throw new Error("Manager API returned an unexpected device inventory.");
      setDevices(body.data);
      setApiStatus("connected");
      setError(null);
    } catch (err) {
      setApiStatus("offline");
      setError(err instanceof Error ? err.message : "Unable to load device inventory.");
    }
  }

  async function runReadOnlyCheck(device: Device) {
    setBusy(true);
    setOverview(null);
    setError(null);
    try {
      const response = await fetch(`/api/v1/devices/${encodeURIComponent(device.id)}/overview`);
      const body = (await response.json()) as ApiResult<Record<string, unknown>>;
      if (!response.ok && !body.data) {
        throw new Error(body.error?.message ?? `Collection failed (HTTP ${response.status})`);
      }
      setOverview(body.data ?? null);
      if (body.meta?.outcome !== "success") {
        setError(`The read-only collection was incomplete. ${body.meta?.failedOperations ?? 0} operation(s) failed.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Read-only collection failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  const enabledCount = useMemo(() => devices.filter((device) => device.enabled).length, [devices]);

  function openSite(device: Device) {
    setSelectedSite(device);
    setSitePage("overview");
    setOverview(null);
    setError(null);
    setSidebarOpen(false);
  }

  function returnToHub() {
    setSelectedSite(null);
    setHubPage("overview");
    setOverview(null);
    setError(null);
    setSidebarOpen(false);
  }


  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">PF</div>
          <div className="brand-name"><strong>pfSense Hub</strong><span>Manager</span></div>
        </div>

        {selectedSite ? (
          <>
            <button className="back-link" onClick={returnToHub}><span>←</span> Back to Hub</button>
            <div className="nav-caption">SITE WORKSPACE</div>
            <div className="site-identity">
              <span className="site-identity-icon">▦</span>
              <div><strong>{selectedSite.name}</strong><span>{selectedSite.location || "Location not set"}</span></div>
            </div>
            <nav className="navigation" aria-label="Site navigation">
              {siteNavigation.map((item) => (
                <button key={item.id} className={sitePage === item.id ? "nav-item active" : "nav-item"} onClick={() => { setSitePage(item.id); setSidebarOpen(false); }}>
                  <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
            </nav>
          </>
        ) : (
          <>
            <div className="nav-caption">WORKSPACE</div>
            <nav className="navigation" aria-label="Hub navigation">
              {hubNavigation.slice(0, 4).map((item) => (
                <button key={item.id} className={hubPage === item.id ? "nav-item active" : "nav-item"} onClick={() => { setHubPage(item.id); setSidebarOpen(false); }}>
                  <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="nav-caption admin-caption">ADMINISTRATION</div>
            <nav className="navigation" aria-label="Administration">
              <button className={hubPage === "settings" ? "nav-item active" : "nav-item"} onClick={() => { setHubPage("settings"); setSidebarOpen(false); }}>
                <span className="nav-icon">⚙</span><span>Hub Settings</span>
              </button>
            </nav>
          </>
        )}

        <div className="sidebar-footer">
          <span className={apiStatus === "connected" ? "status-dot good" : apiStatus === "loading" ? "status-dot pending" : "status-dot bad"} />
          <div><strong>{apiStatus === "connected" ? "Manager connected" : apiStatus === "loading" ? "Connecting…" : "Manager unavailable"}</strong><span>API connection</span></div>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen((open) => !open)}>☰</button>
            <div className="breadcrumb"><span>pfSense Hub Manager</span><strong>{selectedSite ? selectedSite.name : "Hub Workspace"}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className={`connection-chip ${apiStatus}`}><i />{apiStatus === "connected" ? "Hub connected" : apiStatus === "loading" ? "Connecting" : "Connection issue"}</span>
            <button className="icon-button refresh-button" aria-label="Refresh inventory" title="Refresh inventory" onClick={() => void loadDevices()}>↻</button>
            <div className="avatar" aria-label="User profile">AM</div>
          </div>
        </header>

        <div className="page-content">
          {selectedSite ? (
            <SiteWorkspace
              device={selectedSite}
              page={sitePage}
              overview={overview}
              busy={busy}
              error={error}
              onCheck={() => void runReadOnlyCheck(selectedSite)}
            />
          ) : (
            <HubWorkspace
              page={hubPage}
              devices={devices}
              enabledCount={enabledCount}
              apiStatus={apiStatus}
              error={error}
              onOpenSite={openSite}
              onRefresh={() => void loadDevices()}
            />
          )}
        </div>
        <footer className="app-footer">pfSense Hub Manager <span>·</span> Read-only management mode</footer>
      </main>
    </div>
  );
}

function HubWorkspace(props: {
  page: HubPage;
  devices: Device[];
  enabledCount: number;
  apiStatus: "loading" | "connected" | "offline";
  error: string | null;
  onOpenSite: (device: Device) => void;
  onRefresh: () => void;
}) {
  const { page, devices, enabledCount, apiStatus, error, onOpenSite, onRefresh } = props;
  const title = page === "overview" ? "Network Overview" : hubNavigation.find((item) => item.id === page)?.label ?? "Hub Overview";
  const description = page === "overview"
    ? "A centralized view of your managed firewall sites."
    : page === "sites"
      ? "Review registered firewalls and open an individual site workspace."
      : page === "connectivity"
        ? "A central view of relationships and reachability between your sites."
        : page === "alerts"
          ? "Review issues reported by the manager and connected firewalls."
          : "Manage the Hub Manager application.";

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">HUB WORKSPACE</div><h1>{title}</h1><p>{description}</p></div>
        <button className="primary-button" onClick={onRefresh}>↻ <span>Refresh</span></button>
      </div>

      {error && <div className="notice" role="alert"><strong>Inventory notice</strong><span>{error}</span></div>}

      {page === "overview" || page === "sites" ? (
        <>
          <section className="metric-grid" aria-label="Inventory summary">
            <MetricCard icon="▦" label="Registered sites" value={String(devices.length)} detail="Devices in manager inventory" tone="blue" />
            <MetricCard icon="✓" label="Enabled configurations" value={String(enabledCount)} detail="Enabled in manager configuration" tone="green" />
            <MetricCard icon="◷" label="Disabled configurations" value={String(devices.length - enabledCount)} detail="Disabled in manager configuration" tone="orange" />
            <MetricCard icon="⌁" label="API connection" value={apiStatus === "connected" ? "Connected" : apiStatus === "loading" ? "Checking" : "Unavailable"} detail="Manager API status" tone={apiStatus === "connected" ? "green" : "orange"} />
          </section>

          <section className="content-card">
            <div className="card-heading"><div><h2>Managed Sites</h2><p>{devices.length} registered {devices.length === 1 ? "firewall" : "firewalls"}</p></div><button className="text-button" onClick={onRefresh}>Refresh inventory <span>→</span></button></div>
            {devices.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">▦</div><strong>{apiStatus === "loading" ? "Loading site inventory" : "No sites found"}</strong><p>{apiStatus === "loading" ? "Waiting for the manager API to respond." : "No firewall devices are currently returned by the manager API."}</p></div>
            ) : (
              <div className="site-list">
                {devices.map((device) => (
                  <article className="site-row" key={device.id}>
                    <div className="site-symbol">▦</div>
                    <div className="site-main"><strong>{device.name}</strong><span>{device.location || "Location not set"} · pfSense {device.edition.toUpperCase()}</span><small>Device ID: {device.id}</small></div>
                    <span className={device.enabled ? "state-pill enabled" : "state-pill disabled"}><i />{device.enabled ? "Enabled" : "Disabled"}</span>
                    <button className="row-action" onClick={() => onOpenSite(device)}>Open site <span>→</span></button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <div className="info-strip"><span className="info-icon">i</span><p>Enabled indicates the device's manager configuration. It does not confirm that the firewall is currently reachable.</p></div>
        </>
      ) : (
        <section className="content-card placeholder-card">
          <div className="placeholder-icon">{page === "connectivity" ? "⌁" : page === "alerts" ? "♧" : "⚙"}</div>
          <h2>{page === "connectivity" ? "Connectivity view is not integrated yet" : page === "alerts" ? "Alert center is not integrated yet" : "Hub settings are not available yet"}</h2>
          <p>{page === "connectivity" ? "This section will show verified site-to-site relationships and connection health when those data sources are implemented." : page === "alerts" ? "Alerts will appear here once the backend exposes a verified alert feed." : "Hub-level configuration controls will be added in a separate implementation milestone."}</p>
          <span className="coming-label">Not yet implemented</span>
        </section>
      )}
    </>
  );
}

function SiteWorkspace(props: {
  device: Device;
  page: SitePage;
  overview: Record<string, unknown> | null;
  busy: boolean;
  error: string | null;
  onCheck: () => void;
}) {
  const { device, page, overview, busy, error, onCheck } = props;
  const isOverview = page === "overview";
  const pageDescriptions: Record<SitePage, string> = {
    overview: "Health, inventory, and key information returned by this firewall.",
    monitoring: "Performance and health metrics collected from this firewall.",
    interfaces: "Network interface configuration and status.",
    rules: "Read-only view of firewall rules.",
    aliases: "Read-only view of firewall aliases.",
    compatibility: "API capability and compatibility information for this firewall.",
    vpn: "VPN configuration and status for this site.",
    "site-settings": "Connection details and site-specific manager settings.",
  };

  return (
    <>
      <div className="site-page-banner">
        <div className="site-large-symbol">▦</div>
        <div className="site-banner-copy"><div className="eyebrow">SITE WORKSPACE</div><h1>{device.name}</h1><p>{device.location || "Location not set"} <span>·</span> pfSense {device.edition.toUpperCase()}</p></div>
        <span className={device.enabled ? "state-pill enabled" : "state-pill disabled"}><i />{device.enabled ? "Enabled configuration" : "Disabled configuration"}</span>
      </div>

      <div className="page-heading site-section-heading">
        <div><h2>{sitePageLabels[page]}</h2><p>{pageDescriptions[page]}</p></div>
        {isOverview && <button className="primary-button" disabled={busy || !device.enabled} onClick={onCheck}>{busy ? "Checking…" : "Run read-only check"}</button>}
      </div>

      {error && <div className="notice" role="alert"><strong>Collection notice</strong><span>{error}</span></div>}

      {isOverview ? (
        <section className="content-card result-card">
          <div className="card-heading"><div><h2>Read-only inventory result</h2><p>Data is shown only after a live API collection.</p></div></div>
          {overview ? <pre className="result-json">{JSON.stringify(overview, null, 2)}</pre> : <div className="empty-state"><div className="empty-icon">⌁</div><strong>No collection has been run</strong><p>Run a read-only check to request the latest overview from this firewall.</p></div>}
        </section>
      ) : (
        <section className="content-card placeholder-card">
          <div className="placeholder-icon">{siteNavigation.find((item) => item.id === page)?.icon}</div>
          <h2>{sitePageLabels[page]} data is not integrated yet</h2>
          <p>This page is part of the approved site navigation. It will be connected to the corresponding read-only API operation in a later milestone.</p>
          <span className="coming-label">Not yet implemented</span>
        </section>
      )}
    </>
  );
}

function MetricCard(props: { icon: string; label: string; value: string; detail: string; tone: "blue" | "green" | "orange" }) {
  return <article className="metric-card"><div className={`metric-icon ${props.tone}`}>{props.icon}</div><div className="metric-copy"><span>{props.label}</span><strong>{props.value}</strong><small>{props.detail}</small></div></article>;
}
