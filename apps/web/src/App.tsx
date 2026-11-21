import { useEffect, useState, type FormEvent } from "react";

type Role = "admin" | "user";
type User = { id: string; name: string; email: string; role: Role; active?: boolean };
type Device = { id: string; name: string; location: string | null; edition: string; enabled: boolean };
type ApiResponse<T> = { data: T; meta?: { outcome?: string; failedOperations?: number; durationMs?: number }; error?: { message: string } };

async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (HTTP ${response.status})`);
  return body;
}

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
      if (setup.data.setupRequired) {
        setScreen("setup");
        return;
      }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally { setBusy(false); }
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
    return <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">NETWORK OPERATIONS</p>
        <h1>pfSense Hub Manager</h1>
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
      </section>
    </main>;
  }

  const isAdmin = currentUser?.role === "admin";
  return <main className="shell">
    <header>
      <div><p className="eyebrow">NETWORK OPERATIONS</p><h1>pfSense Hub Manager</h1><p className="subtitle">Centralized visibility across your firewall locations</p></div>
      <div className="header-actions"><div className="status"><span className="dot online" />{status}</div><div className="account-chip"><strong>{currentUser?.name}</strong><span>{currentUser?.role.toUpperCase()}</span></div><button onClick={() => void logout()} disabled={busy}>Sign out</button></div>
    </header>
    {error && <div className="notice">{error}</div>}
    <section className="panel">
      <div className="section-heading"><div><p className="eyebrow">INVENTORY</p><h2>Managed firewalls</h2></div><button onClick={() => void refresh()} disabled={busy}>Refresh</button></div>
      {devices.length === 0 ? <p className="muted">No device inventory loaded yet.</p> : devices.map(device =>
        <article className="device" key={device.id}>
          <div><strong>{device.name}</strong><p>{device.location || "Location not set"} · pfSense {device.edition.toUpperCase()}</p></div>
          <span className="pill">Configured</span>
          <button disabled={busy} onClick={() => void runCheck(device.id)}>{busy ? "Checking…" : "Run read-only check"}</button>
        </article>
      )}
    </section>
    {overview && <section className="panel"><p className="eyebrow">LIVE API CHECK</p><h2>Read-only endpoint results</h2><pre>{JSON.stringify(overview, null, 2)}</pre><p className="muted">ARP and firewall-state records are not returned or persisted, only aggregate counts when the API returns a list.</p></section>}
    {isAdmin && <section className="panel">
      <div className="section-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h2>Manager users</h2></div></div>
      <form className="user-form" onSubmit={createUser}>
        <label>Name<input value={newName} onChange={e => setNewName(e.target.value)} minLength={2} maxLength={100} required /></label>
        <label>Email<input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required /></label>
        <label>Temporary password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={12} maxLength={128} required /></label>
        <label>Role<select value={newRole} onChange={e => setNewRole(e.target.value as Role)}><option value="user">User, read-only</option><option value="admin">Admin, full access</option></select></label>
        <button className="primary-button" type="submit" disabled={busy}>Create user</button>
      </form>
      <div className="user-list">
        {users.map(user => <div className="user-row" key={user.id}><div><strong>{user.name}</strong><p>{user.email}</p></div><select aria-label={"Role for " + user.name} value={user.role} disabled={busy || user.id === currentUser?.id} onChange={e => void changeRole(user, e.target.value as Role)}><option value="user">User, read-only</option><option value="admin">Admin, full access</option></select></div>)}
      </div>
    </section>}
    <footer>Authenticated manager · {isAdmin ? "Administrator access" : "Read-only user access"} · Firewall configuration changes are not enabled in this release</footer>
  </main>;
}
