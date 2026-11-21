import { useEffect, useState, type FormEvent } from "react";

type Role = "admin" | "user";
type User = { id: string; name: string; email: string; role: Role; active?: boolean };
type Device = { id: string; name: string; location: string | null; edition: string; enabled: boolean };
type ApiResponse<T> = { data: T; meta?: { outcome?: string; failedOperations?: number; durationMs?: number }; error?: { message: string } };
type Page = "dashboard" | "firewalls" | "monitoring" | "users" | "audit" | "manager-api" | "settings";

async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (HTTP ${response.status})`);
  return body;
}

const pageTitles: Record<Page, string> = {
  dashboard: "Dashboard", firewalls: "Firewall inventory", monitoring: "Monitoring",
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
          <button className="sub-link" onClick={() => navigate("firewalls")}>Add firewall <span className="coming-soon">Soon</span></button>
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
        {page === "dashboard" && <div className="page-stack">
          <div className="welcome-row"><div><h2>Network overview</h2><p className="muted">A centralized view of your firewall environment.</p></div><button onClick={() => void refresh()} disabled={busy}>↻ Refresh data</button></div>
          <div className="stat-grid">
            <article className="stat-card"><span className="stat-label">REGISTERED FIREWALLS</span><strong>{devices.length}</strong><span className="stat-foot">Configured in inventory</span></article>
            <article className="stat-card"><span className="stat-label">MANAGER API</span><strong className="stat-status"><i className="dot online" />Connected</strong><span className="stat-foot">Application backend</span></article>
            <article className="stat-card"><span className="stat-label">CURRENT ROLE</span><strong className="stat-role">{isAdmin ? "Admin" : "User"}</strong><span className="stat-foot">{isAdmin ? "Full manager access" : "Read-only access"}</span></article>
          </div>
          <section className="content-card"><div className="card-heading"><div><span className="eyebrow">INVENTORY</span><h2>Managed firewalls</h2></div><button className="text-button" onClick={() => navigate("firewalls")}>View inventory →</button></div>
            {devices.length === 0 ? <p className="muted">No firewalls are registered yet.</p> : devices.slice(0,4).map(device => <div className="device-row" key={device.id}><div className="device-symbol">◈</div><div className="device-info"><strong>{device.name}</strong><span>{device.location || "Location not set"} · pfSense {device.edition.toUpperCase()}</span></div><span className="pill">Configured</span></div>)}
          </section>
          <section className="content-card placeholder-card"><span className="eyebrow">OPERATIONS</span><h2>Monitoring overview</h2><p className="muted">Live health metrics, interface status, gateway monitoring, and service information will appear here as monitoring capabilities are added.</p><button onClick={() => navigate("monitoring")}>Open monitoring →</button></section>
        </div>}
        {page === "firewalls" && <div className="page-stack">
          <div className="welcome-row"><div><h2>Firewall inventory</h2><p className="muted">Registered pfSense appliances and connection checks.</p></div><button onClick={() => void refresh()} disabled={busy}>↻ Refresh</button></div>
          <section className="content-card"><div className="card-heading"><div><span className="eyebrow">INVENTORY</span><h2>Managed firewalls ({devices.length})</h2></div>{isAdmin && <button disabled title="Firewall onboarding is the next development milestone">＋ Add firewall · Soon</button>}</div>
            {devices.length === 0 ? <p className="muted">No firewalls registered.</p> : devices.map(device => <div className="device-row firewall-row" key={device.id}><div className="device-symbol">◈</div><div className="device-info"><strong>{device.name}</strong><span>{device.location || "Location not set"} · pfSense {device.edition.toUpperCase()}</span></div><span className="pill">Configured</span><button disabled={busy} onClick={() => void runCheck(device.id)}>{busy ? "Checking…" : "Run read-only check"}</button></div>)}
          </section>
          {overview && <section className="content-card"><span className="eyebrow">LIVE API CHECK</span><h2>Read-only endpoint results</h2><pre>{JSON.stringify(overview,null,2)}</pre><p className="muted">Only aggregate counts are retained when returned by the API.</p></section>}
        </div>}
        {page === "users" && isAdmin && <div className="page-stack"><div><h2>Manager users</h2><p className="muted">Create accounts and assign application access roles.</p></div>
          <section className="content-card"><span className="eyebrow">NEW ACCOUNT</span><h2>Create user</h2><form className="user-form" onSubmit={createUser}>
            <label>Name<input value={newName} onChange={e => setNewName(e.target.value)} minLength={2} maxLength={100} required /></label>
            <label>Email<input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required /></label>
            <label>Temporary password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={12} maxLength={128} required /></label>
            <label>Role<select value={newRole} onChange={e => setNewRole(e.target.value as Role)}><option value="user">User, read-only</option><option value="admin">Admin, full access</option></select></label>
            <button className="primary-button" type="submit" disabled={busy}>Create user</button>
          </form></section>
          <section className="content-card"><span className="eyebrow">ACCESS CONTROL</span><h2>Existing accounts</h2>
            {users.map(user => <div className="user-row" key={user.id}><div><strong>{user.name}</strong><span>{user.email}</span></div><select aria-label={"Role for " + user.name} value={user.role} disabled={busy || user.id === currentUser?.id} onChange={e => void changeRole(user,e.target.value as Role)}><option value="user">User, read-only</option><option value="admin">Admin, full access</option></select></div>)}
          </section>
        </div>}
        {page === "monitoring" && <PlaceholderPage eyebrow="NETWORK OPERATIONS" title="Monitoring" description="This area will consolidate live firewall health, CPU and memory utilization, interfaces, gateways, services, and system logs." items={["System overview","Interface status and traffic","Gateway health","Service status","System logs"]} />}
        {page === "audit" && <PlaceholderPage eyebrow="ADMINISTRATION" title="Audit logs" description="A searchable record of administrative activity will be added here. The audit view is a placeholder until event recording and filtering are implemented." items={["User and role changes","Firewall registration events","Authentication events","Administrative actions"]} />}
        {page === "manager-api" && <div className="page-stack"><div><h2>Manager API</h2><p className="muted">Backend service health and application connectivity.</p></div><section className="content-card api-health-card"><span className="eyebrow">CONNECTION STATUS</span><div className="health-line"><i className="dot online"/><strong>{status}</strong></div><p className="muted">The web application is communicating with its manager API. Firewall-specific connectivity is tested separately from this application status.</p></section><PlaceholderPage eyebrow="SYSTEM" title="API diagnostics" description="Version details, service diagnostics, and background job health will be added here." items={["API version","Database connectivity","Background tasks"]} /></div>}
        {page === "settings" && isAdmin && <PlaceholderPage eyebrow="SYSTEM CONFIGURATION" title="Settings" description="Application-wide configuration options will be organized here. Firewall-specific credentials remain managed securely on the server." items={["General application settings","Session and security policy","Notification preferences","Backup and maintenance"]} />}
        {page === "users" && !isAdmin && <PlaceholderPage eyebrow="ACCESS CONTROL" title="Restricted section" description="Your account has read-only access. User administration is available to administrators only." items={[]} />}
        <footer className="app-footer">pfSense Hub Manager <span>·</span> {isAdmin ? "Administrator access" : "Read-only access"} <span>·</span> Firewall configuration changes are not enabled in this release</footer>
      </main>
    </div>
  </div>;
}

function PlaceholderPage({eyebrow,title,description,items}:{eyebrow:string;title:string;description:string;items:string[]}) {
  return <div className="page-stack"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="muted">{description}</p></div><section className="content-card placeholder-card"><span className="placeholder-icon">✧</span><h3>{title} workspace</h3><p className="muted">This page structure is ready. Functionality will be implemented in a later milestone.</p>{items.length > 0 && <ul className="planned-list">{items.map(item => <li key={item}>{item}</li>)}</ul>}</section></div>;
}
