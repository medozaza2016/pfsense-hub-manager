import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

type Role = "admin" | "user";
type User = { id: string; name: string; email: string; role: Role; active?: boolean };
type Device = { id: string; name: string; location: string | null; edition: string; enabled: boolean };
type ApiResponse<T> = { data: T; meta?: { outcome?: string; failedOperations?: number; durationMs?: number }; error?: { message: string } };
type Page = "dashboard" | "firewalls" | "add-firewall" | "monitoring" | "users" | "audit" | "manager-api" | "settings";

async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (HTTP ${response.status})`);
  return body;
}

const pageTitles: Record<Page, string> = {
  dashboard: "Dashboard", firewalls: "Firewall inventory", "add-firewall": "Add firewall", monitoring: "Monitoring",
  users: "User management", audit: "Audit logs", "manager-api": "Manager API", settings: "Settings"
};

export default function App() {
  const [screen, setScreen] = useState<"loading" | "setup" | "login" | "app">("loading");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [firewallSearch, setFirewallSearch] = useState("");
  const [firewallFilter, setFirewallFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("user");
  const [status, setStatus] = useState("Connecting to manager API");
  const [page, setPage] = useState<Page>("dashboard");
  const [firewallsOpen, setFirewallsOpen] = useState(true);
  const [monitoringOpen, setMonitoringOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [firewallName, setFirewallName] = useState("");
  const [firewallLocation, setFirewallLocation] = useState("");
  const [firewallEdition, setFirewallEdition] = useState<"plus" | "ce" | "unknown">("plus");
  const [firewallUrl, setFirewallUrl] = useState("https://");
  const [firewallApiKey, setFirewallApiKey] = useState("");
  const [firewallCa, setFirewallCa] = useState("");
  const [firewallTested, setFirewallTested] = useState(false);
  const [firewallTestResult, setFirewallTestResult] = useState<string | null>(null);

  async function loadAppData(user: User) {
    const deviceResponse = await api<Device[]>("/api/v1/devices");
    setDevices(deviceResponse.data);
    if (user.role === "admin") {
      const userResponse = await api<User[]>("/api/v1/users");
      setUsers(userResponse.data);
    }
  }

  async function initialize() {
    try {
      const setup = await api<{ setupRequired: boolean }>("/api/v1/setup/status");
      if (setup.data.setupRequired) { setScreen("setup"); return; }
      const session = await api<User>("/api/v1/auth/me");
      setCurrentUser(session.data);
      await loadAppData(session.data);
      setStatus("Manager API connected");
      setScreen("app");
    } catch {
      setScreen("login");
      setStatus("Sign in required");
    }
  }
  useEffect(() => { void initialize(); }, []);

  async function completeSignIn(path: string, payload: Record<string, string>) {
    setBusy(true); setError(null);
    try {
      await api<User>(path, { method: "POST", body: JSON.stringify(payload) });
      const session = await api<User>("/api/v1/auth/me");
      setCurrentUser(session.data);
      await loadAppData(session.data);
      setStatus("Manager API connected");
      setPassword("");
      setScreen("app");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  async function submitSetup(event: FormEvent) {
    event.preventDefault();
    await completeSignIn("/api/v1/setup/admin", { name, email, password });
  }
  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    await completeSignIn("/api/v1/auth/login", { email, password });
  }
  async function logout() {
    setBusy(true);
    try { await api("/api/v1/auth/logout", { method: "POST" }); }
    finally { setCurrentUser(null); setOverview(null); setScreen("login"); setBusy(false); }
  }
  async function refresh() {
    if (!currentUser) return;
    setBusy(true); setError(null);
    try { await loadAppData(currentUser); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to refresh."); }
    finally { setBusy(false); }
  }
  async function runCheck(id: string) {
    setBusy(true); setOverview(null); setError(null);
    try {
      const result = await api<Record<string, unknown>>("/api/v1/devices/" + encodeURIComponent(id) + "/overview");
      setOverview(result.data);
      if (result.meta?.outcome !== "success") setError("Collection partially failed. " + (result.meta?.failedOperations ?? 0) + " operations failed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Collection failed."); }
    finally { setBusy(false); }
  }
  function firewallPayload() {
    return { name: firewallName, location: firewallLocation, edition: firewallEdition, apiBaseUrl: firewallUrl, apiKey: firewallApiKey, ...(firewallCa.trim() ? { caCertificatePem: firewallCa } : {}) };
  }
  async function importCaCertificate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 128 * 1024) {
      setError("Certificate file is too large. Choose a PEM certificate file under 128 KB.");
      event.target.value = "";
      return;
    }
    try {
      const pem = await file.text();
      if (!pem.includes("-----BEGIN CERTIFICATE-----") || !pem.includes("-----END CERTIFICATE-----")) {
        throw new Error("This file does not contain a PEM certificate. Choose a .pem, .crt, or .cer certificate file.");
      }
      setFirewallCa(pem.trim());
      setFirewallTested(false);
      setFirewallTestResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read the certificate file.");
      event.target.value = "";
    }
  }

  async function testFirewallConnection() {
    setBusy(true); setError(null); setFirewallTested(false); setFirewallTestResult(null);
    try {
      await api<{ reachable: boolean; version: unknown }>("/api/v1/devices/test-connection", { method: "POST", body: JSON.stringify(firewallPayload()) });
      setFirewallTested(true);
      setFirewallTestResult("Connection successful. pfSense API version endpoint responded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally { setBusy(false); }
  }
  async function addFirewall(event: FormEvent) {
    event.preventDefault();
    if (!firewallTested) { setError("Test the firewall connection successfully before registering it."); return; }
    setBusy(true); setError(null);
    try {
      await api("/api/v1/devices", { method: "POST", body: JSON.stringify(firewallPayload()) });
      setFirewallApiKey(""); setFirewallCa(""); setFirewallTested(false); setFirewallTestResult(null);
      if (currentUser) await loadAppData(currentUser);
      setPage("firewalls");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to register firewall."); }
    finally { setBusy(false); }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api<User>("/api/v1/users", { method: "POST", body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole }) });
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user");
      if (currentUser) await loadAppData(currentUser);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create user."); }
    finally { setBusy(false); }
  }
  async function changeRole(user: User, role: Role) {
    setBusy(true); setError(null);
    try {
      await api("/api/v1/users/" + encodeURIComponent(user.id) + "/role", { method: "PATCH", body: JSON.stringify({ role }) });
      if (currentUser) await loadAppData(currentUser);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update role."); }
    finally { setBusy(false); }
  }

  if (screen === "loading") return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">NETWORK OPERATIONS</p><h1>pfSense Hub Manager</h1><p className="muted">Checking manager setup…</p></section></main>;
  if (screen === "setup" || screen === "login") {
    const isSetup = screen === "setup";
    return <main className="auth-shell"><section className="auth-card">
      <p className="eyebrow">NETWORK OPERATIONS</p><h1>pfSense Hub Manager</h1>
      <h2>{isSetup ? "Create the first administrator" : "Sign in"}</h2>
      <p className="muted">{isSetup ? "This account will control the manager and manage other users." : "Sign in with your manager account to continue."}</p>
      <form onSubmit={isSetup ? submitSetup : submitLogin}>
        {isSetup && <label>Full name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required /></label>}
        <label>Email address<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={isSetup ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={isSetup ? 12 : 1} maxLength={128} required /></label>
        {isSetup && <p className="field-hint">Use at least 12 characters. Store this password securely.</p>}
        {error && <div className="notice">{error}</div>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : isSetup ? "Create administrator" : "Sign in"}</button>
      </form>
      <p className="security-note">Firewall credentials remain on the server and are never sent to this page.</p>
    </section></main>;
  }

  const isAdmin = currentUser?.role === "admin";
  function navigate(next: Page) { setPage(next); setMobileNavOpen(false); setOverview(null); setError(null); }
  const navClass = (sidebarCollapsed ? "app-layout sidebar-collapsed" : "app-layout") + (mobileNavOpen ? " mobile-nav-open" : "");
  const sidebar = <aside className="sidebar">
    <div className="brand">
      <div className="brand-mark">pf</div>
      <div className="brand-copy"><strong>pfSense Hub</strong><span>MANAGER</span></div>
      <button className="icon-button sidebar-toggle desktop-only" aria-label="Collapse sidebar" onClick={() => setSidebarCollapsed(true)}>‹</button>
    </div>
    <nav className="side-nav" aria-label="Main navigation">
      <button className={page === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => navigate("dashboard")}><span className="nav-icon">▦</span><span>Dashboard</span></button>
      <div className="nav-group">
        <button className="nav-link group-toggle" aria-expanded={firewallsOpen} onClick={() => setFirewallsOpen(v => !v)}><span className="nav-icon">◈</span><span>Firewalls</span><span className="nav-chevron">{firewallsOpen ? "⌄" : "›"}</span></button>
        {firewallsOpen && <div className="sub-nav">
          <button className={page === "firewalls" ? "sub-link active" : "sub-link"} onClick={() => navigate("firewalls")}>Inventory</button>
          <button className={page === "add-firewall" ? "sub-link active" : "sub-link"} onClick={() => navigate("add-firewall")}>Add firewall</button>
          <button className="sub-link" onClick={() => navigate("firewalls")}>Locations & groups</button>
        </div>}
      </div>
      <div className="nav-group">
        <button className="nav-link group-toggle" aria-expanded={monitoringOpen} onClick={() => setMonitoringOpen(v => !v)}><span className="nav-icon">⌁</span><span>Monitoring</span><span className="nav-chevron">{monitoringOpen ? "⌄" : "›"}</span></button>
        {monitoringOpen && <div className="sub-nav">
          <button className={page === "monitoring" ? "sub-link active" : "sub-link"} onClick={() => navigate("monitoring")}>System overview</button>
          <button className="sub-link" onClick={() => navigate("monitoring")}>Interfaces</button>
          <button className="sub-link" onClick={() => navigate("monitoring")}>Gateways</button>
          <button className="sub-link" onClick={() => navigate("monitoring")}>Services & logs</button>
        </div>}
      </div>
      <div className="nav-divider"><span>ADMINISTRATION</span></div>
      {isAdmin && <button className={page === "users" ? "nav-link active" : "nav-link"} onClick={() => navigate("users")}><span className="nav-icon">♙</span><span>User management</span></button>}
      {isAdmin && <button className={page === "audit" ? "nav-link active" : "nav-link"} onClick={() => navigate("audit")}><span className="nav-icon">▤</span><span>Audit logs</span></button>}
      <div className="nav-divider"><span>SYSTEM</span></div>
      <button className={page === "manager-api" ? "nav-link active" : "nav-link"} onClick={() => navigate("manager-api")}><span className="nav-icon">⌘</span><span>Manager API</span></button>
      {isAdmin && <button className={page === "settings" ? "nav-link active" : "nav-link"} onClick={() => navigate("settings")}><span className="nav-icon">⚙</span><span>Settings</span></button>}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-user"><div className="avatar">{(currentUser?.name || "U").slice(0,1).toUpperCase()}</div><div className="user-copy"><strong>{currentUser?.name}</strong><span>{isAdmin ? "Administrator" : "Read-only user"}</span></div></div>
      <button className="signout-link" onClick={() => void logout()} disabled={busy}>↪ <span>Sign out</span></button>
    </div>
  </aside>;

  return <div className={navClass}>
    {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    {sidebar}
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-left">
          {sidebarCollapsed && <button className="icon-button expand-sidebar" aria-label="Expand sidebar" onClick={() => setSidebarCollapsed(false)}>☰</button>}
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>☰</button>
          <div><p className="breadcrumb">NETWORK OPERATIONS <span>/</span> {pageTitles[page].toUpperCase()}</p><h1>{pageTitles[page]}</h1></div>
        </div>
        <div className="topbar-right"><div className="api-indicator"><span className="dot online" />{status}</div><div className="topbar-avatar" title={currentUser?.name}>{(currentUser?.name || "U").slice(0,1).toUpperCase()}</div></div>
      </header>
      <main className="page-content">
        {error && <div className="notice">{error}</div>}
        {page === "dashboard" && <div className="dashboard-layout">
          <div className="dashboard-heading">
            <div><p className="dashboard-kicker">NETWORK OPERATIONS</p><h2>Good to see you, {currentUser?.name?.split(" ")[0] || "Administrator"}</h2><p className="muted">Here is the current state of your firewall environment.</p></div>
            <button className="dashboard-refresh" onClick={() => void refresh()} disabled={busy}>↻ Refresh data</button>
          </div>
          <div className="dashboard-metrics">
            <article className="metric-panel metric-firewalls"><div className="metric-icon">◈</div><div><span className="metric-caption">REGISTERED FIREWALLS</span><strong>{devices.length}</strong><small>{devices.length === 1 ? "Appliance in inventory" : "Appliances in inventory"}</small></div><button className="metric-link" onClick={() => navigate("firewalls")}>View inventory <span>→</span></button></article>
            <article className="metric-panel"><div className="metric-icon metric-icon-green">⌁</div><div><span className="metric-caption">MANAGER API</span><strong className="metric-connected"><i className="dot online"/>Connected</strong><small>Application backend</small></div><button className="metric-link" onClick={() => navigate("manager-api")}>View status <span>→</span></button></article>
            <article className="metric-panel"><div className="metric-icon metric-icon-blue">♙</div><div><span className="metric-caption">YOUR ACCESS</span><strong>{isAdmin ? "Administrator" : "Read-only user"}</strong><small>{isAdmin ? "Full manager access" : "Read-only access"}</small></div>{isAdmin && <button className="metric-link" onClick={() => navigate("users")}>Manage users <span>→</span></button>}</article>
          </div>
          <div className="dashboard-main-grid">
            <section className="content-card fleet-panel">
              <div className="dashboard-card-heading"><div><span className="eyebrow">YOUR ENVIRONMENT</span><h2>Managed firewalls</h2><p>Registered appliances and their configuration.</p></div><button className="text-button" onClick={() => navigate("firewalls")}>All firewalls <span>→</span></button></div>
              {devices.length === 0 ? <div className="dashboard-empty"><div className="empty-symbol">◈</div><strong>No firewalls registered</strong><p>Add your first pfSense appliance to start managing your environment.</p>{isAdmin && <button className="primary-button" onClick={() => navigate("add-firewall")}>Add firewall</button>}</div> : <div className="fleet-list">{devices.map(device => <article className="fleet-device" key={device.id}><div className="fleet-device-icon">◈</div><div className="fleet-device-copy"><strong>{device.name}</strong><span>{device.location || "Location not set"} <i>·</i> pfSense {device.edition.toUpperCase()}</span></div><span className="pill">Configured</span><button className="fleet-check" disabled={busy} onClick={() => void runCheck(device.id)}>{busy ? "Checking…" : "Run check"}</button></article>)}</div>}
              <div className="fleet-panel-footer"><span>{devices.length} {devices.length === 1 ? "firewall" : "firewalls"} registered</span><span>Configuration inventory</span></div>
            </section>
            <div className="dashboard-side-stack">
              <section className="content-card quick-actions-panel"><div className="dashboard-card-heading"><div><span className="eyebrow">SHORTCUTS</span><h2>Quick actions</h2></div></div>
                <button className="quick-action" onClick={() => navigate("firewalls")}><span className="quick-action-icon">◈</span><span><strong>Firewall inventory</strong><small>Review registered appliances</small></span><b>→</b></button>
                <button className="quick-action" onClick={() => navigate("monitoring")}><span className="quick-action-icon">⌁</span><span><strong>Monitoring</strong><small>Open network monitoring</small></span><b>→</b></button>
                {isAdmin && <button className="quick-action" onClick={() => navigate("users")}><span className="quick-action-icon">♙</span><span><strong>User management</strong><small>Manage access and roles</small></span><b>→</b></button>}
              </section>
              <section className="content-card operations-panel"><div className="dashboard-card-heading"><div><span className="eyebrow">OPERATIONS</span><h2>Monitoring status</h2></div><span className="status-tag status-planned">In development</span></div><p>Live system metrics, interface traffic, gateway health, and service status are not yet available in this release.</p><button className="text-button" onClick={() => navigate("monitoring")}>Explore monitoring <span>→</span></button></section>
            </div>
          </div>
          {overview && <section className="content-card"><span className="eyebrow">LIVE API CHECK</span><h2>Read-only endpoint results</h2><pre>{JSON.stringify(overview,null,2)}</pre><p className="muted">Only aggregate counts are retained when returned by the API.</p></section>}
        </div>}
        {page === "firewalls" && <div className="page-stack inventory-page">
          <div className="inventory-heading">
            <div><p className="dashboard-kicker">NETWORK OPERATIONS / FLEET</p><h2>Firewall inventory</h2><p className="muted">Manage your registered pfSense appliances and inspect their configuration.</p></div>
            <div className="inventory-heading-actions"><button onClick={() => void refresh()} disabled={busy}>↻ Refresh</button>{isAdmin && <button className="primary-button" onClick={() => navigate("add-firewall")}>＋ Add firewall</button>}</div>
          </div>
          <section className="content-card inventory-toolbar">
            <div className="inventory-count"><strong>{devices.length}</strong><span>{devices.length === 1 ? "Registered firewall" : "Registered firewalls"}</span></div>
            <div className="inventory-controls">
              <label className="inventory-search"><span>⌕</span><input aria-label="Search firewalls" placeholder="Search by name, site, or platform" value={firewallSearch} onChange={e => setFirewallSearch(e.target.value)}/></label>
              <select aria-label="Filter firewalls" value={firewallFilter} onChange={e => setFirewallFilter(e.target.value as "all" | "enabled" | "disabled")}><option value="all">All firewalls</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
            </div>
          </section>
          <section className="content-card inventory-list-card">
            <div className="inventory-section-heading"><div><span className="eyebrow">YOUR ENVIRONMENT</span><h2>Managed appliances</h2></div><span className="inventory-total">{devices.length} total</span></div>
            {devices.filter(device => {
              const query = firewallSearch.trim().toLowerCase();
              const matchesQuery = !query || [device.name, device.location || "", device.edition].some(value => value.toLowerCase().includes(query));
              const matchesFilter = firewallFilter === "all" || (firewallFilter === "enabled" ? device.enabled : !device.enabled);
              return matchesQuery && matchesFilter;
            }).length === 0 ? <div className="inventory-empty"><div className="empty-symbol">⌕</div><strong>{devices.length ? "No matching firewalls" : "No firewalls registered yet"}</strong><p>{devices.length ? "Try changing your search or filter." : "Your registered pfSense appliances will appear here."}</p></div> :
            devices.filter(device => {
              const query = firewallSearch.trim().toLowerCase();
              const matchesQuery = !query || [device.name, device.location || "", device.edition].some(value => value.toLowerCase().includes(query));
              const matchesFilter = firewallFilter === "all" || (firewallFilter === "enabled" ? device.enabled : !device.enabled);
              return matchesQuery && matchesFilter;
            }).map(device => <article className={"inventory-device" + (selectedDeviceId === device.id ? " inventory-device-selected" : "")} key={device.id}>
              <div className="inventory-device-main"><div className="inventory-device-icon">◈</div><div className="inventory-device-copy"><div className="inventory-device-title"><strong>{device.name}</strong><span className={device.enabled ? "config-state state-enabled" : "config-state state-disabled"}>{device.enabled ? "Enabled" : "Disabled"}</span></div><p>{device.location || "Location not set"} <i>·</i> pfSense {device.edition.toUpperCase()}</p><div className="inventory-meta"><span><i className="meta-dot dot-configured"/>Registered configuration</span><span><i className="meta-dot dot-unknown"/>Live connection not checked</span></div></div></div>
              <div className="inventory-device-actions"><button onClick={() => setSelectedDeviceId(selectedDeviceId === device.id ? null : device.id)}>{selectedDeviceId === device.id ? "Hide details" : "Details"}</button><button className="primary-button" disabled={busy || !device.enabled} onClick={() => void runCheck(device.id)}>{busy ? "Checking…" : "Run read-only check"}</button></div>
              {selectedDeviceId === device.id && <div className="inventory-detail"><div><span>Appliance name</span><strong>{device.name}</strong></div><div><span>Site / location</span><strong>{device.location || "Not specified"}</strong></div><div><span>Platform</span><strong>pfSense {device.edition.toUpperCase()}</strong></div><div><span>Configuration</span><strong>{device.enabled ? "Enabled" : "Disabled"}</strong></div><p>A successful read-only check is required before this appliance can be marked as connected. Firewall configuration changes are not available.</p></div>}
            </article>)}
          </section>
          {overview && <section className="content-card inventory-results"><div className="inventory-section-heading"><div><span className="eyebrow">LIVE API CHECK</span><h2>Read-only check results</h2></div></div><pre>{JSON.stringify(overview,null,2)}</pre><p className="muted">The response above contains the data returned by the firewall read-only endpoints.</p></section>}
        </div>}
        {page === "add-firewall" && isAdmin && <div className="page-stack firewall-onboarding">
          <div className="inventory-heading"><div><p className="dashboard-kicker">FIREWALLS / ONBOARDING</p><h2>Register a pfSense appliance</h2><p className="muted">Add a firewall using a dedicated read-only API key. Credentials are encrypted before storage.</p></div><button onClick={() => navigate("firewalls")}>Cancel</button></div>
          <section className="content-card onboarding-card">
            <div className="onboarding-steps"><span className="step-active">1. Connection details</span><span className={firewallTested ? "step-active" : ""}>2. Verify connection</span><span>3. Register appliance</span></div>
            <form className="firewall-form" onSubmit={addFirewall}>
              <div className="form-section-title"><h3>Appliance details</h3><p className="muted">Identify the firewall in your inventory.</p></div>
              <div className="form-grid">
                <label>Display name<input value={firewallName} onChange={e => {setFirewallName(e.target.value);setFirewallTested(false);}} minLength={2} maxLength={120} placeholder="Branch pfSense CE" required /></label>
                <label>Location / site<input value={firewallLocation} onChange={e => {setFirewallLocation(e.target.value);setFirewallTested(false);}} maxLength={120} placeholder="Branch office" /></label>
                <label>pfSense edition<select value={firewallEdition} onChange={e => {setFirewallEdition(e.target.value as "plus" | "ce" | "unknown");setFirewallTested(false);}}><option value="plus">pfSense Plus</option><option value="ce">pfSense CE</option><option value="unknown">Unknown</option></select></label>
                <label>API base URL<input type="url" value={firewallUrl} onChange={e => {setFirewallUrl(e.target.value);setFirewallTested(false);}} placeholder="https://192.168.1.1:10443" required /></label>
              </div>
              <div className="form-section-title"><h3>API authentication</h3><p className="muted">Use a dedicated API key with only the eight required GET permissions.</p></div>
              <label>Read-only API key<input type="password" value={firewallApiKey} onChange={e => {setFirewallApiKey(e.target.value);setFirewallTested(false);}} autoComplete="off" required /></label>
              <div className="ca-certificate-field">
                <label htmlFor="firewall-ca-file">Import certificate file (PEM, CRT, or CER), optional</label>
                <input id="firewall-ca-file" type="file" accept=".pem,.crt,.cer,.txt,application/x-pem-file,application/x-x509-ca-cert" onChange={event => void importCaCertificate(event)} />
                <p className="field-hint">Choose a certificate file from your computer, or paste the PEM text below. The file is read locally in your browser and is not uploaded until you test or register the firewall.</p>
                <label htmlFor="firewall-ca-pem">Or paste certificate text (PEM)</label>
                <textarea id="firewall-ca-pem" value={firewallCa} onChange={e => {setFirewallCa(e.target.value);setFirewallTested(false);setFirewallTestResult(null);}} rows={5} placeholder="-----BEGIN CERTIFICATE-----" />
              </div>
              <details className="certificate-help">
                <summary>How do I obtain the CA certificate?</summary>
                <div>
                  <p>Only provide a certificate here if the firewall uses a self-signed certificate or a certificate issued by a private certificate authority. If its web interface uses a certificate trusted by your system's public certificate authorities, leave this field blank.</p>
                  <ol>
                    <li>On pfSense, open <strong>System → Cert. Manager → CAs</strong>.</li>
                    <li>Find the certificate authority that issued the certificate used by the pfSense web interface.</li>
                    <li>Export the CA certificate, not its private key, and copy the PEM certificate text into this field.</li>
                    <li>The text should begin with <code>-----BEGIN CERTIFICATE-----</code> and end with <code>-----END CERTIFICATE-----</code>.</li>
                  </ol>
                  <p>If the web interface certificate is self-signed, provide that self-signed certificate as the trust certificate. Do not paste or upload a private key.</p>
                </div>
              </details>
              <p className="security-note">TLS certificate verification is always enabled. Provide the issuing CA certificate when the firewall uses a private certificate authority. Do not disable TLS verification.</p>
              {firewallTestResult && <div className="success-notice">{firewallTestResult}</div>}
              <div className="onboarding-actions"><button type="button" onClick={() => void testFirewallConnection()} disabled={busy || !firewallName.trim() || !firewallUrl.startsWith("https://") || !firewallApiKey.trim()}>{busy ? "Testing…" : "Test connection"}</button><button className="primary-button" type="submit" disabled={busy || !firewallTested}>{busy ? "Registering…" : "Register firewall"}</button></div>
            </form>
          </section>
        </div>}
        {page === "monitoring" && <PlaceholderPage eyebrow="NETWORK OPERATIONS" title="Monitoring" description="This area will consolidate live firewall health, CPU and memory utilization, interfaces, gateways, services, and system logs." items={["System overview","Interface status and traffic","Gateway health","Service status","System logs"]} />}
        {page === "audit" && <PlaceholderPage eyebrow="ADMINISTRATION" title="Audit logs" description="A searchable record of administrative activity will be added here. The audit view is a placeholder until event recording and filtering are implemented." items={["User and role changes","Firewall registration events","Authentication events","Administrative actions"]} />}
        {page === "manager-api" && <div className="page-stack"><div><h2>Manager API</h2><p className="muted">Backend service health and application connectivity.</p></div><section className="content-card api-health-card"><span className="eyebrow">CONNECTION STATUS</span><div className="health-line"><i className="dot online"/><strong>{status}</strong></div><p className="muted">The web application is communicating with its manager API. Firewall-specific connectivity is tested separately from this application status.</p></section><PlaceholderPage eyebrow="SYSTEM" title="API diagnostics" description="Version details, service diagnostics, and background job health will be added here." items={["API version","Database connectivity","Background tasks"]} /></div>}
        {page === "settings" && isAdmin && <PlaceholderPage eyebrow="SYSTEM CONFIGURATION" title="Settings" description="Application-wide configuration options will be organized here. Firewall-specific credentials remain managed securely on the server." items={["General application settings","Session and security policy","Notification preferences","Backup and maintenance"]} />}
        {page === "users" && isAdmin && <div className="page-stack user-management-page">
          <div className="welcome-row"><div><p className="dashboard-kicker">ACCESS CONTROL</p><h2>User management</h2><p className="muted">Create manager accounts and control their access level.</p></div></div>
          <div className="user-management-grid">
            <section className="content-card user-create-card"><div className="dashboard-card-heading"><div><span className="eyebrow">NEW ACCOUNT</span><h2>Create user</h2><p>Add an administrator or read-only user.</p></div></div>
              <form className="user-form" onSubmit={createUser}>
                <label>Full name<input value={newName} onChange={e => setNewName(e.target.value)} minLength={2} maxLength={100} autoComplete="name" required /></label>
                <label>Email address<input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} autoComplete="email" required /></label>
                <label>Temporary password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /><small>At least 12 characters. Share it securely with the user.</small></label>
                <label>Access role<select value={newRole} onChange={e => setNewRole(e.target.value as Role)}><option value="user">User, read-only</option><option value="admin">Administrator</option></select></label>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? "Creating…" : "Create user"}</button>
              </form>
            </section>
            <section className="content-card user-list-card"><div className="dashboard-card-heading"><div><span className="eyebrow">MANAGER ACCESS</span><h2>Accounts ({users.length})</h2><p>Manage roles for existing accounts.</p></div></div>
              <div className="managed-user-list">{users.map(user => <article className="managed-user-row" key={user.id}><div className="managed-user-avatar">{user.name.trim().charAt(0).toUpperCase()}</div><div className="managed-user-info"><strong>{user.name}</strong><span>{user.email}</span></div><span className={user.active === false ? "config-state state-disabled" : "config-state state-enabled"}>{user.active === false ? "Inactive" : "Active"}</span><select aria-label={"Role for " + user.email} value={user.role} disabled={busy || user.id === currentUser?.id} onChange={e => void changeRole(user,e.target.value as Role)}><option value="user">User</option><option value="admin">Admin</option></select></article>)}</div>
              <p className="user-list-note">Your own role cannot be changed from this screen.</p>
            </section>
          </div>
        </div>}
                {page === "users" && !isAdmin && <PlaceholderPage eyebrow="ACCESS CONTROL" title="Restricted section" description="Your account has read-only access. User administration is available to administrators only." items={[]} />}
        <footer className="app-footer">pfSense Hub Manager <span>·</span> {isAdmin ? "Administrator access" : "Read-only access"} <span>·</span> Firewall configuration changes are not enabled in this release</footer>
      </main>
    </div>
  </div>;
}

function PlaceholderPage({eyebrow,title,description,items}:{eyebrow:string;title:string;description:string;items:string[]}) {
  return <div className="page-stack"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="muted">{description}</p></div><section className="content-card placeholder-card"><span className="placeholder-icon">✧</span><h3>{title} workspace</h3><p className="muted">This page structure is ready. Functionality will be implemented in a later milestone.</p>{items.length > 0 && <ul className="planned-list">{items.map(item => <li key={item}>{item}</li>)}</ul>}</section></div>;
}
