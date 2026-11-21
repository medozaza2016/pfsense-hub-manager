import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "./components/ToastProvider";

type Role = "admin" | "user";
type User = { id: string; name: string; email: string; role: Role; active?: boolean };
type Device = {
  id: string; name: string; location: string | null; edition: string; enabled: boolean;
  connectionStatus?: "unknown" | "online" | "degraded" | "offline" | "authentication_failed" | "authorization_failed" | "tls_error" | "unsupported" | "error";
  lastCheckedAt?: string | null; lastSuccessAt?: string | null; lastErrorClass?: string | null;
};
function connectionStatusLabel(status: Device["connectionStatus"]): string {
  const labels: Record<NonNullable<Device["connectionStatus"]>, string> = {
    unknown: "Not checked", online: "Online", degraded: "Degraded", offline: "Offline",
    authentication_failed: "Authentication failed", authorization_failed: "Permission denied",
    tls_error: "TLS error", unsupported: "Unsupported", error: "Error"
  };
  return labels[status ?? "unknown"];
}

type DiagnosticRecord = Record<string, unknown>;
function diagnosticRecord(value: unknown): DiagnosticRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as DiagnosticRecord : {};
}
function diagnosticLabel(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").replace(/\\s+/g, " ").trim().replace(/\\b\\w/g, letter => letter.toUpperCase());
}
function diagnosticValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not reported";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? new Intl.NumberFormat().format(value) : "Not reported";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
function redactDiagnosticData(value: unknown): unknown {
  const sensitiveKey = /(serial|netgate|mac|(^|[_\\.])ip($|[_\\.])|address|hostname|host_name|fqdn|token|secret|key|password|credential|uuid|arp|source|destination)/i;
  if (Array.isArray(value)) return value.map(item => redactDiagnosticData(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as DiagnosticRecord).map(([key, child]) =>
      [key, sensitiveKey.test(key) ? "[redacted]" : redactDiagnosticData(child)]
    ));
  }
  return value;
}
function diagnosticJson(value: unknown): string {
  return JSON.stringify(redactDiagnosticData(value), null, 2);
}
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

const pagePaths: Record<Page, string> = {
  dashboard: "/dashboard",
  firewalls: "/firewalls",
  "add-firewall": "/firewalls/add",
  monitoring: "/monitoring",
  users: "/users",
  audit: "/audit-logs",
  "manager-api": "/manager-api",
  settings: "/settings"
};
const pathPages = Object.fromEntries(Object.entries(pagePaths).map(([page, path]) => [path, page])) as Record<string, Page>;

export default function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const page = pathPages[location.pathname] ?? "dashboard";
  const { notify } = useToast();
  function reportError(message: string) { notify(message, "error"); }
  const [screen, setScreen] = useState<"loading" | "setup" | "login" | "app">("loading");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [firewallSearch, setFirewallSearch] = useState("");
  const [firewallFilter, setFirewallFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [checkingDeviceId, setCheckingDeviceId] = useState<string | null>(null);
  const [deviceChecks, setDeviceChecks] = useState<Record<string, { outcome: "success" | "partial" | "failed"; checkedAt: string; failedOperations: number }>>({});
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [credentialApiKey, setCredentialApiKey] = useState("");
  const [credentialCa, setCredentialCa] = useState("");
  const [credentialTlsServername, setCredentialTlsServername] = useState("");
  const [clearCredentialCa, setClearCredentialCa] = useState(false);
  const [clearCredentialTls, setClearCredentialTls] = useState(false);
  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkResultsRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    if (overview && checkModalOpen) {
      checkResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      if (checkResultsRef.current) checkResultsRef.current.scrollTop = checkResultsRef.current.scrollHeight;
    }
  }, [overview, checkModalOpen]);
  const [users, setUsers] = useState<User[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("user");
  const [status, setStatus] = useState("Connecting to manager API");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [firewallName, setFirewallName] = useState("");
  const [firewallLocation, setFirewallLocation] = useState("");
  const [firewallEdition, setFirewallEdition] = useState<"plus" | "ce" | "unknown">("plus");
  const [firewallUrl, setFirewallUrl] = useState("https://");
  const [firewallApiKey, setFirewallApiKey] = useState("");
  const [firewallCa, setFirewallCa] = useState("");
  const [firewallTlsServername, setFirewallTlsServername] = useState("");
  const [certificateDiscovery, setCertificateDiscovery] = useState<{ subjectAltName: string; fingerprint256: string | null; validTo: string | null; suggestedServername: string | null; dnsNames: string[] } | null>(null);
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
      if (setup.data.setupRequired) { setScreen("setup"); routerNavigate("/setup", { replace: true }); return; }
      const session = await api<User>("/api/v1/auth/me");
      setCurrentUser(session.data);
      await loadAppData(session.data);
      setStatus("Manager API connected");
      setScreen("app");
    } catch {
      setScreen("login");
      setStatus("Sign in required");
      routerNavigate("/login", { replace: true });
    }
  }
  useEffect(() => { void initialize(); }, []);
  useEffect(() => {
    if (screen === "app") {
      if (!pathPages[location.pathname] || location.pathname === "/login" || location.pathname === "/setup") {
        routerNavigate("/dashboard", { replace: true });
      } else if (currentUser?.role !== "admin" && ["users", "audit", "settings"].includes(page)) {
        routerNavigate("/dashboard", { replace: true });
      }
    } else if (screen === "setup" && location.pathname !== "/setup") {
      routerNavigate("/setup", { replace: true });
    } else if (screen === "login" && location.pathname !== "/login") {
      routerNavigate("/login", { replace: true });
    }
  }, [screen, location.pathname, currentUser?.role, page, routerNavigate]);

  async function completeSignIn(path: string, payload: Record<string, string>) {
    setBusy(true); 
    try {
      await api<User>(path, { method: "POST", body: JSON.stringify(payload) });
      const session = await api<User>("/api/v1/auth/me");
      setCurrentUser(session.data);
      await loadAppData(session.data);
      setStatus("Manager API connected");
      setPassword("");
      setScreen("app");
      routerNavigate("/dashboard", { replace: true });
      notify(path.includes("/setup/") ? "Administrator account created." : "Signed in successfully.", "success");
    } catch (e) { reportError(e instanceof Error ? e.message : "Unable to sign in."); }
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
    try { await api("/api/v1/auth/logout", { method: "POST" }); notify("Signed out successfully.", "success"); }
    catch (e) { reportError(e instanceof Error ? e.message : "Unable to sign out."); }
    finally { setCurrentUser(null); setOverview(null); setScreen("login"); routerNavigate("/login", { replace: true }); setBusy(false); }
  }
  async function refresh() {
    if (!currentUser) return;
    setBusy(true); 
    try { await loadAppData(currentUser); notify("Application data refreshed.", "success"); }
    catch (e) { reportError(e instanceof Error ? e.message : "Unable to refresh."); }
    finally { setBusy(false); }
  }
  async function runCheck(id: string) {
    setBusy(true); setOverview(null); setCheckError(null); setCheckingDeviceId(id); setCheckModalOpen(true);
    try {
      const result = await api<Record<string, unknown>>("/api/v1/devices/" + encodeURIComponent(id) + "/overview");
      const outcome = result.meta?.outcome === "success" ? "success" : "partial";
      const failedOperations = result.meta?.failedOperations ?? 0;
      setOverview(result.data);
      setDeviceChecks(current => ({ ...current, [id]: { outcome, checkedAt: new Date().toISOString(), failedOperations } }));
      if (outcome !== "success") {
        const message = "Read-only check completed with " + failedOperations + " failed operations.";
        setCheckError(message);
        notify(message, "warning");
      } else {
        notify("Read-only firewall check completed successfully.", "success");
      }
    } catch (e) {
      setDeviceChecks(current => ({ ...current, [id]: { outcome: "failed", checkedAt: new Date().toISOString(), failedOperations: 8 } }));
      const message = e instanceof Error ? e.message : "Read-only check failed.";
      setCheckError(message);
      reportError(message);
    } finally {
      try {
        const latest = await api<Device[]>("/api/v1/devices");
        setDevices(latest.data);
      } catch { /* Keep the last known inventory if the refresh itself fails. */ }
      setBusy(false);
      setCheckingDeviceId(null);
    }
  }
  async function confirmDeleteDevice() {
    if (!deleteDevice) return;
    setBusy(true); 
    try {
      await api<{ id: string; deleted: boolean }>("/api/v1/devices/" + encodeURIComponent(deleteDevice.id), { method: "DELETE" });
      setDevices(current => current.filter(device => device.id !== deleteDevice.id));
      setDeviceChecks(current => { const next = { ...current }; delete next[deleteDevice.id]; return next; });
      if (selectedDeviceId === deleteDevice.id) { setSelectedDeviceId(null); setOverview(null); }
      setDeleteDevice(null);
      setDeleteConfirmation("");
      notify("Firewall removed from inventory.", "success");
    } catch (e) { reportError(e instanceof Error ? e.message : "Unable to remove firewall."); }
    finally { setBusy(false); }
  }
  async function saveDeviceEdit(event: FormEvent) {
    event.preventDefault();
    if (!editDevice) return;
    setBusy(true); 
    try {
      const result = await api<Device>("/api/v1/devices/" + encodeURIComponent(editDevice.id), {
        method: "PATCH",
        body: JSON.stringify({ name: editDevice.name, location: editDevice.location || null, edition: editDevice.edition, enabled: editDevice.enabled })
      });
      setDevices(current => current.map(device => device.id === result.data.id ? result.data : device));
      setEditDevice(null);
      setCredentialApiKey("");
      setCredentialCa("");
      setCredentialTlsServername("");
      setClearCredentialCa(false);
      setClearCredentialTls(false);
      notify("Firewall inventory updated.", "success");
    } catch (e) { reportError(e instanceof Error ? e.message : "Unable to update firewall."); }
    finally { setBusy(false); }
  }
  function openDeviceEditor(device: Device) {
    setCredentialApiKey("");
    setCredentialCa("");
    setCredentialTlsServername("");
    setClearCredentialCa(false);
    setClearCredentialTls(false);
    setEditDevice({ ...device });
  }
  function closeDeviceEditor() {
    if (busy) return;
    setEditDevice(null);
    setCredentialApiKey("");
    setCredentialCa("");
    setCredentialTlsServername("");
    setClearCredentialCa(false);
    setClearCredentialTls(false);
  }

  async function updateDeviceCredentials(event: FormEvent) {
    event.preventDefault();
    if (!editDevice || !credentialApiKey.trim()) return;
    setBusy(true);
    try {
      const payload = {
        apiKey: credentialApiKey,
        ...(clearCredentialCa ? { caCertificatePem: null } : credentialCa.trim() ? { caCertificatePem: credentialCa.trim() } : {}),
        ...(clearCredentialTls ? { tlsServername: null } : credentialTlsServername.trim() ? { tlsServername: credentialTlsServername.trim() } : {})
      };
      await api<{ deviceId: string; connection: { reachable: boolean; version: unknown } }>(
        "/api/v1/devices/" + encodeURIComponent(editDevice.id) + "/credentials",
        { method: "PATCH", body: JSON.stringify(payload) }
      );
      setCredentialApiKey("");
      setCredentialCa("");
      setCredentialTlsServername("");
      setClearCredentialCa(false);
      setClearCredentialTls(false);
      const latest = await api<Device[]>("/api/v1/devices");
      setDevices(latest.data);
      notify("Credentials verified and updated. The firewall passed its read-only connection test.", "success");
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Credential update failed. Existing saved credentials were not changed.");
    } finally { setBusy(false); }
  }
  async function importCredentialCa(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 128 * 1024) {
      notify("Certificate file is too large. Choose a PEM certificate file under 128 KB.", "warning");
      event.target.value = "";
      return;
    }
    try {
      const pem = await file.text();
      if (!pem.includes("-----BEGIN CERTIFICATE-----") || !pem.includes("-----END CERTIFICATE-----")) {
        throw new Error("This file does not contain a PEM certificate. Choose a PEM, CRT, or CER certificate file.");
      }
      setCredentialCa(pem.trim());
      setClearCredentialCa(false);
      event.target.value = "";
      notify("CA certificate loaded locally. It will be saved only after the connection test succeeds.", "success");
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Unable to read the certificate file.");
      event.target.value = "";
    }
  }

  function firewallPayload() {
    return { name: firewallName, location: firewallLocation, edition: firewallEdition, apiBaseUrl: firewallUrl, apiKey: firewallApiKey, ...(firewallCa.trim() ? { caCertificatePem: firewallCa } : {}), ...(firewallTlsServername.trim() ? { tlsServername: firewallTlsServername.trim() } : {}) };
  }
  async function importCaCertificate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 128 * 1024) {
      notify("Certificate file is too large. Choose a PEM certificate file under 128 KB.", "warning");
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
      notify("CA certificate imported successfully.", "success");
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Unable to read the certificate file.");
      event.target.value = "";
    }
  }

  async function discoverFirewallCertificate() {
    setBusy(true);  setCertificateDiscovery(null); setFirewallTested(false); setFirewallTestResult(null);
    try {
      const result = await api<{ subjectAltName: string; fingerprint256: string | null; validTo: string | null; suggestedServername: string | null; dnsNames: string[] }>("/api/v1/devices/discover-certificate", {
        method: "POST", body: JSON.stringify({ apiBaseUrl: firewallUrl })
      });
      setCertificateDiscovery(result.data);
      if (result.data.suggestedServername) {
        setFirewallTlsServername(result.data.suggestedServername);
        setFirewallTestResult("Certificate discovered. TLS hostname was filled in automatically. Verify the fingerprint and provide the trust certificate before testing.");
        notify("TLS certificate discovered. Verify its fingerprint and trust chain before testing.", "success");
      } else {
        setFirewallTlsServername("");
        setFirewallTestResult("Certificate discovered, but it has no single unambiguous DNS name. Select a DNS name from the certificate or use an IP address listed in its SAN.");
        notify("Certificate discovered, but its DNS name is ambiguous. Review the certificate details.", "warning");
      }
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Certificate discovery failed.");
    } finally { setBusy(false); }
  }

  async function testFirewallConnection() {
    setBusy(true);  setFirewallTested(false); setFirewallTestResult(null);
    try {
      await api<{ reachable: boolean; version: unknown }>("/api/v1/devices/test-connection", { method: "POST", body: JSON.stringify(firewallPayload()) });
      setFirewallTested(true);
      setFirewallTestResult("Connection successful. pfSense API version endpoint responded.");
      notify("Firewall connection test passed.", "success");
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Connection test failed.");
    } finally { setBusy(false); }
  }
  async function addFirewall(event: FormEvent) {
    event.preventDefault();
    if (!firewallTested) { notify("Test the firewall connection successfully before registering it.", "warning"); return; }
    setBusy(true); 
    try {
      await api("/api/v1/devices", { method: "POST", body: JSON.stringify(firewallPayload()) });
      setFirewallApiKey(""); setFirewallCa(""); setFirewallTlsServername(""); setCertificateDiscovery(null); setFirewallTested(false); setFirewallTestResult(null);
      if (currentUser) await loadAppData(currentUser);
      navigate("firewalls");
      notify("Firewall registered successfully.", "success");
    } catch (e) { reportError(e instanceof Error ? e.message : "Unable to register firewall."); }
    finally { setBusy(false); }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault(); setBusy(true); 
    try {
      await api<User>("/api/v1/users", { method: "POST", body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole }) });
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user");
      if (currentUser) await loadAppData(currentUser);
      notify("Manager user created successfully.", "success");
    } catch (e) { reportError(e instanceof Error ? e.message : "Unable to create user."); }
    finally { setBusy(false); }
  }
  async function changeRole(user: User, role: Role) {
    setBusy(true); 
    try {
      await api("/api/v1/users/" + encodeURIComponent(user.id) + "/role", { method: "PATCH", body: JSON.stringify({ role }) });
      if (currentUser) await loadAppData(currentUser);
      notify("User role updated successfully.", "success");
    } catch (e) { reportError(e instanceof Error ? e.message : "Unable to update role."); }
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
        
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : isSetup ? "Create administrator" : "Sign in"}</button>
      </form>
      <p className="security-note">Firewall credentials remain on the server and are never sent to this page.</p>
    </section></main>;
  }

  const isAdmin = currentUser?.role === "admin";
  function navigate(next: Page) { routerNavigate(pagePaths[next]); setMobileNavOpen(false); setOverview(null);  }
  const navClass = "app-layout" + (mobileNavOpen ? " mobile-nav-open" : "");
  const visibleDevices = devices.filter(device => {
    const query = firewallSearch.trim().toLowerCase();
    const matchesQuery = !query || [device.name, device.location || "", device.edition].some(value => value.toLowerCase().includes(query));
    const matchesFilter = firewallFilter === "all" || (firewallFilter === "enabled" ? device.enabled : !device.enabled);
    return matchesQuery && matchesFilter;
  });
  const connectedCount = devices.filter(device => device.connectionStatus === "online").length;
  const sidebar = <aside className="sidebar">
    <div className="brand">
      <div className="brand-mark">pf</div>
      <div className="brand-copy"><strong>pfSense Hub</strong><span>MANAGER</span></div>
    </div>
    <nav className="side-nav" aria-label="Main navigation">
      <div className="nav-divider"><span>WORKSPACE</span></div>
      <button className={page === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => navigate("dashboard")}><span className="nav-icon">▦</span><span>Dashboard</span></button>
      <div className="nav-divider"><span>FLEET MANAGEMENT</span></div>
      <button className={page === "firewalls" ? "nav-link active" : "nav-link"} onClick={() => navigate("firewalls")}><span className="nav-icon">◈</span><span>Firewalls</span><span className="nav-count">{devices.length}</span></button>
      {isAdmin && <button className={page === "add-firewall" ? "nav-link active" : "nav-link"} onClick={() => navigate("add-firewall")}><span className="nav-icon">＋</span><span>Add firewall</span></button>}
      <div className="nav-divider"><span>OBSERVABILITY</span></div>
      <button className={page === "monitoring" ? "nav-link active" : "nav-link"} onClick={() => navigate("monitoring")}><span className="nav-icon">⌁</span><span>Monitoring</span></button>
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
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>☰</button>
          <div><p className="breadcrumb">NETWORK OPERATIONS <span>/</span> {pageTitles[page].toUpperCase()}</p><h1>{pageTitles[page]}</h1></div>
        </div>
        <div className="topbar-right"><div className="api-indicator"><span className="dot online" />{status}</div><div className="topbar-avatar" title={currentUser?.name}>{(currentUser?.name || "U").slice(0,1).toUpperCase()}</div></div>
      </header>
      <main className="page-content page-transition" key={location.pathname}>
        
        {page === "dashboard" && <div className="dashboard-layout">
          <div className="dashboard-heading">
            <div><p className="dashboard-kicker">NETWORK OPERATIONS</p><h2>Good to see you, {currentUser?.name?.split(" ")[0] || "Administrator"}</h2><p className="muted">Here is the current state of your firewall environment.</p></div>
            <button className="dashboard-refresh" onClick={() => void refresh()} disabled={busy}>↻ Refresh data</button>
          </div>
          <div className="dashboard-metrics">
            <article className="metric-panel metric-firewalls"><div className="metric-icon">◈</div><div><span className="metric-caption">REGISTERED FIREWALLS</span><strong>{devices.length}</strong><small>{connectedCount} online · {devices.length - connectedCount} not confirmed online</small></div><button className="metric-link" onClick={() => navigate("firewalls")}>View inventory <span>→</span></button></article>
            <article className="metric-panel"><div className="metric-icon metric-icon-green">⌁</div><div><span className="metric-caption">MANAGER API</span><strong className="metric-connected"><i className="dot online"/>Connected</strong><small>Application backend</small></div><button className="metric-link" onClick={() => navigate("manager-api")}>View status <span>→</span></button></article>
            <article className="metric-panel"><div className="metric-icon metric-icon-blue">♙</div><div><span className="metric-caption">YOUR ACCESS</span><strong>{isAdmin ? "Administrator" : "Read-only user"}</strong><small>{isAdmin ? "Full manager access" : "Read-only access"}</small></div>{isAdmin && <button className="metric-link" onClick={() => navigate("users")}>Manage users <span>→</span></button>}</article>
          </div>
          <div className="dashboard-main-grid">
            <section className="content-card fleet-panel">
              <div className="dashboard-card-heading"><div><span className="eyebrow">YOUR ENVIRONMENT</span><h2>Managed firewalls</h2><p>Registered appliances and their configuration.</p></div><button className="text-button" onClick={() => navigate("firewalls")}>All firewalls <span>→</span></button></div>
              {devices.length === 0 ? <div className="dashboard-empty"><div className="empty-symbol">◈</div><strong>No firewalls registered</strong><p>No appliances are currently registered with this manager. Open Firewall Inventory to add one.</p><button className="text-button" onClick={() => navigate("firewalls")}>Open firewall inventory <span>→</span></button></div> : <div className="fleet-list">{devices.map(device => {
                const deviceCheckClass = device.connectionStatus === "online" ? "connectivity-state connectivity-good"
                  : !device.connectionStatus || device.connectionStatus === "unknown" ? "connectivity-state connectivity-unknown"
                    : ["offline", "authentication_failed", "authorization_failed", "tls_error", "error"].includes(device.connectionStatus) ? "connectivity-state connectivity-error"
                      : "connectivity-state connectivity-warning";
                return <article className="fleet-device fleet-device-updated" key={device.id}>
                  <div className="fleet-device-icon">◈</div>
                  <div className="fleet-device-copy">
                    <div className="fleet-device-title"><strong>{device.name}</strong><span className={device.enabled ? "config-state state-enabled" : "config-state state-disabled"}>{device.enabled ? "Enabled" : "Disabled"}</span></div>
                    <span className="fleet-device-location">{device.location || "Location not set"} <i>·</i> <span className="inventory-edition-badge">pfSense {device.edition.toUpperCase()}</span></span>
                    <div className="fleet-device-meta"><span className="inventory-config-meta"><i className="meta-dot dot-configured"/>{device.enabled ? "Configuration enabled" : "Configuration disabled"}</span><span className={deviceCheckClass}><i className="meta-dot"/>Connection {connectionStatusLabel(device.connectionStatus)}</span>{device.lastCheckedAt && <span className="inventory-last-checked"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.1"/><path d="M8 4.5V8l2.4 1.5"/></svg>Checked {new Date(device.lastCheckedAt).toLocaleString()}</span>}</div>
                    <button className="fleet-view-link" onClick={() => { setSelectedDeviceId(device.id); navigate("firewalls"); }}>View firewall <span>→</span></button>
                  </div>
                </article>;
              })}</div>}
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
        </div>}
        {page === "firewalls" && <div className="page-stack inventory-page">
          <div className="inventory-heading">
            <div><p className="dashboard-kicker">FLEET MANAGEMENT / FIREWALLS</p><h2>Firewall inventory</h2><p className="muted">A single view of registered appliances, configuration, and live reachability.</p></div>
            <div className="inventory-heading-actions"><button onClick={() => void refresh()} disabled={busy}>↻ Refresh</button>{isAdmin && <button className="primary-button" onClick={() => navigate("add-firewall")}>＋ Add firewall</button>}</div>
          </div>
          <section className="inventory-overview">
            <article><span className="inventory-kpi-label">REGISTERED</span><strong>{devices.length}</strong><small>Appliances in this manager</small></article>
            <article><span className="inventory-kpi-label">ENABLED</span><strong>{devices.filter(device => device.enabled).length}</strong><small>Configured and available to check</small></article>
            <article><span className="inventory-kpi-label">ONLINE</span><strong>{connectedCount}</strong><small>Currently reachable appliances</small></article>
          </section>
          <section className="content-card inventory-toolbar">
            <div className="inventory-toolbar-copy"><strong>Appliances</strong><span>Search and filter your managed firewall fleet.</span></div>
            <div className="inventory-controls">
              <label className="inventory-search"><span>⌕</span><input aria-label="Search firewalls" placeholder="Search name, site, or platform" value={firewallSearch} onChange={e => setFirewallSearch(e.target.value)}/></label>
              <select aria-label="Filter firewalls" value={firewallFilter} onChange={e => setFirewallFilter(e.target.value as "all" | "enabled" | "disabled")}><option value="all">All appliances</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
            </div>
          </section>
          <section className="content-card inventory-list-card">
            <div className="inventory-section-heading"><div><span className="eyebrow">MANAGED FLEET</span><h2>Registered appliances</h2></div><span className="inventory-total">Showing {visibleDevices.length} of {devices.length}</span></div>
            {visibleDevices.length === 0 ? <div className="inventory-empty"><div className="empty-symbol">⌕</div><strong>{devices.length ? "No matching appliances" : "Your fleet is empty"}</strong><p>{devices.length ? "Adjust the search or filter to find an appliance." : "Register a pfSense appliance to begin monitoring its read-only status."}</p>{devices.length === 0 && isAdmin && <button className="primary-button" onClick={() => navigate("add-firewall")}>＋ Add your first firewall</button>}</div> :
            visibleDevices.map(device => {
              const check = deviceChecks[device.id];
              const checkLabel = connectionStatusLabel(device.connectionStatus);
              const checkClass = device.connectionStatus === "online" ? "connectivity-state connectivity-good"
                : !device.connectionStatus || device.connectionStatus === "unknown" ? "connectivity-state connectivity-unknown"
                  : ["offline", "authentication_failed", "authorization_failed", "tls_error", "error"].includes(device.connectionStatus) ? "connectivity-state connectivity-error"
                    : "connectivity-state connectivity-warning";
              return <article className={"inventory-device" + (selectedDeviceId === device.id ? " inventory-device-selected" : "")} key={device.id}>
                <div className="inventory-device-main"><div className="inventory-device-icon">◈</div><div className="inventory-device-copy">
                  <div className="inventory-device-title"><strong>{device.name}</strong><span className={device.enabled ? "config-state state-enabled" : "config-state state-disabled"}>{device.enabled ? "Enabled" : "Disabled"}</span></div>
                  <p><span>{device.location || "Location not set"}</span><span className="inventory-edition-badge">pfSense {device.edition.toUpperCase()}</span></p>
                  <div className="inventory-meta"><span className="inventory-config-meta"><i className="meta-dot dot-configured"/>{device.enabled ? "Configuration enabled" : "Configuration disabled"}</span><span className={checkClass}><i className="meta-dot"/>Connection {checkLabel}</span>{device.lastCheckedAt && <span className="inventory-last-checked"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.1"/><path d="M8 4.5V8l2.4 1.5"/></svg>Checked {new Date(device.lastCheckedAt).toLocaleString()}</span>}</div>
                </div></div>
                <div className="inventory-device-actions" aria-label={`Actions for ${device.name}`}>
                  {isAdmin && <button className="device-action device-action-edit" title="Edit appliance" aria-label={`Edit ${device.name}`} onClick={() => openDeviceEditor(device)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13.8 3.2 3 3-9.7 9.7-3.8.8.8-3.8 9.7-9.7Z"/><path d="m11.9 5.1 3 3"/></svg><span>Edit</span></button>}
                  {isAdmin && <button className="device-action device-action-remove" title="Remove appliance" aria-label={`Remove ${device.name}`} onClick={() => { setDeleteConfirmation(""); setDeleteDevice(device); }}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M8 5.5V3.8h4v1.7m-6.5 0 .7 11h7.6l.7-11M8.2 8.2v5.7m3.6-5.7v5.7"/></svg><span>Remove</span></button>}
                  <button className="device-action device-action-details" title={selectedDeviceId === device.id ? "Hide appliance details" : "View appliance details"} aria-expanded={selectedDeviceId === device.id} onClick={() => setSelectedDeviceId(selectedDeviceId === device.id ? null : device.id)}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><path d="M10 9v4m0-7h.01"/></svg><span>{selectedDeviceId === device.id ? "Hide" : "Details"}</span></button>
                  <button className="device-action device-action-check primary-button" disabled={busy || !device.enabled} onClick={() => void runCheck(device.id)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8 16 5v4.3c0 3.6-2.4 6.2-6 7.9-3.6-1.7-6-4.3-6-7.9V5l6-2.2Z"/><path d="m7.1 9.8 1.9 1.9 3.9-4"/></svg><span>{busy && checkingDeviceId === device.id ? "Checking…" : "Run check"}</span></button>
                </div>
                {selectedDeviceId === device.id && <div className="inventory-detail">
                  <div><span>Appliance</span><strong>{device.name}</strong></div><div><span>Site / location</span><strong>{device.location || "Not specified"}</strong></div><div><span>Platform</span><strong>pfSense {device.edition.toUpperCase()}</strong></div><div><span>Configuration</span><strong>{device.enabled ? "Enabled" : "Disabled"}</strong></div>
                  <div><span>Connection status</span><strong>{checkLabel}</strong></div>
                  <div><span>Last successful check</span><strong>{device.lastSuccessAt ? new Date(device.lastSuccessAt).toLocaleString() : "Not yet successful"}</strong></div>
                  <div><span>Last error class</span><strong>{device.lastErrorClass || "None"}</strong></div>
                  <div><span>Failed operations in latest check</span><strong>{check ? check.failedOperations : "Not available"}</strong></div>
                  <p>Connection status is stored by the manager and reflects the latest read-only collection. This manager does not change firewall configuration.</p>
                </div>}
              </article>;
            })}
          </section>

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
                <label>API base URL<input type="url" value={firewallUrl} onChange={e => {setFirewallUrl(e.target.value);setFirewallTested(false);setCertificateDiscovery(null);setFirewallTlsServername("");setFirewallTestResult(null);}} placeholder="https://192.168.1.1:10443" required /></label>
                <div className="field-action"><button type="button" onClick={() => void discoverFirewallCertificate()} disabled={busy || !firewallUrl.startsWith("https://")}>{busy ? "Discovering…" : "Discover TLS certificate"}</button><p className="field-hint">Reads the presented certificate without sending your API key. The certificate is not trusted automatically.</p></div>
              </div>
              <div className="form-section-title"><h3>API authentication</h3><p className="muted">Use a dedicated API key with only the eight required GET permissions.</p></div>
              <label>Read-only API key<input type="password" value={firewallApiKey} onChange={e => {setFirewallApiKey(e.target.value);setFirewallTested(false);}} autoComplete="off" required /></label>
              {certificateDiscovery && <section className="certificate-discovery">
                <h4>Discovered TLS certificate</h4>
                <p><strong>DNS names:</strong> {certificateDiscovery.dnsNames.length ? certificateDiscovery.dnsNames.join(", ") : "No DNS Subject Alternative Name found"}</p>
                <p><strong>SHA-256:</strong> <code>{certificateDiscovery.fingerprint256 || "Unavailable"}</code></p>
                <p><strong>Expires:</strong> {certificateDiscovery.validTo || "Unknown"}</p>
                {certificateDiscovery.suggestedServername && <p className="field-hint">TLS hostname automatically selected: <code>{firewallTlsServername}</code></p>}
                <label>TLS server name<input value={firewallTlsServername} onChange={e => {setFirewallTlsServername(e.target.value);setFirewallTested(false);setFirewallTestResult(null);}} placeholder="DNS name from the certificate" /></label>
                <p className="field-hint">The manager connects to the API URL above but verifies the certificate against this DNS name. Leave blank only when the certificate has a matching IP Subject Alternative Name.</p>
              </section>}
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
        {editDevice && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeDeviceEditor(); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-firewall-title">
            <div className="modal-heading"><div><span className="eyebrow">FLEET MANAGEMENT</span><h2 id="edit-firewall-title">Edit firewall</h2><p className="muted">Update the inventory record. API credentials and connection settings are not changed here.</p></div><button type="button" onClick={closeDeviceEditor} disabled={busy} aria-label="Close">×</button></div>
            <div className="modal-content-scroll">
              <form className="modal-form" onSubmit={saveDeviceEdit}>
                <label>Display name<input value={editDevice.name} onChange={e => setEditDevice({ ...editDevice, name: e.target.value })} minLength={2} maxLength={120} required /></label>
                <label>Location / site<input value={editDevice.location ?? ""} onChange={e => setEditDevice({ ...editDevice, location: e.target.value })} maxLength={120} /></label>
                <label>pfSense edition<select value={editDevice.edition} onChange={e => setEditDevice({ ...editDevice, edition: e.target.value })}><option value="plus">pfSense Plus</option><option value="ce">pfSense CE</option><option value="unknown">Unknown</option></select></label>
                <label className="modal-checkbox"><input type="checkbox" checked={editDevice.enabled} onChange={e => setEditDevice({ ...editDevice, enabled: e.target.checked })} /> Enable this appliance for read-only checks</label>
                <div className="modal-actions"><button type="button" onClick={closeDeviceEditor} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save inventory changes"}</button></div>
              </form>
              <section className="credential-editor">
              <div className="credential-editor-heading">
                <span className="eyebrow">CONNECTION SECURITY</span>
                <h3>API credentials and TLS</h3>
                <p>Replace the API key or update the trust settings for this appliance.</p>
              </div>
              <form className="credential-form" onSubmit={updateDeviceCredentials}>
                  <label>New read-only API key<input type="password" value={credentialApiKey} onChange={e => setCredentialApiKey(e.target.value)} autoComplete="new-password" placeholder="Enter replacement API key" required /></label>
                  <p className="field-hint">The replacement key is tested against this firewall before it is encrypted and saved. The current key remains active if the test fails.</p>
                  <label>Replacement CA certificate (PEM, optional)<input type="file" accept=".pem,.crt,.cer,.txt,application/x-pem-file,application/x-x509-ca-cert" onChange={event => void importCredentialCa(event)} /></label>
                  <textarea aria-label="Replacement CA certificate PEM" value={credentialCa} onChange={e => {setCredentialCa(e.target.value);setClearCredentialCa(false);}} rows={4} placeholder="Leave blank to keep the currently saved CA certificate." />
                  <label className="modal-checkbox"><input type="checkbox" checked={clearCredentialCa} onChange={e => {setClearCredentialCa(e.target.checked);if(e.target.checked)setCredentialCa("");}} /> Clear the currently saved CA certificate</label>
                  <label>TLS server name<input value={credentialTlsServername} onChange={e => {setCredentialTlsServername(e.target.value);setClearCredentialTls(false);}} maxLength={253} placeholder="Leave blank to keep the current TLS server name" /></label>
                  <label className="modal-checkbox"><input type="checkbox" checked={clearCredentialTls} onChange={e => {setClearCredentialTls(e.target.checked);if(e.target.checked)setCredentialTlsServername("");}} /> Clear the currently saved TLS server name</label>
                  <div className="credential-submit-row"><button className="primary-button" type="submit" disabled={busy || !credentialApiKey.trim() || clearCredentialCa && Boolean(credentialCa.trim()) || clearCredentialTls && Boolean(credentialTlsServername.trim())}>{busy ? "Testing and saving…" : "Verify and update credentials"}</button></div>
              </form>
              </section>
            </div>
          </section>
        </div>}
        {deleteDevice && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDeleteDevice(null); }}>
          <section className="modal-card delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-firewall-title">
            <div className="modal-heading"><div><span className="eyebrow">FLEET MANAGEMENT</span><h2 id="delete-firewall-title">Remove firewall?</h2><p className="muted">You are about to permanently remove <strong>{deleteDevice.name}</strong> from this manager.</p></div><button type="button" onClick={() => { setDeleteDevice(null); setDeleteConfirmation(""); }} disabled={busy} aria-label="Close">×</button></div>
            <div className="delete-warning"><strong>Danger zone, this action cannot be undone.</strong><p>Removing <strong>{deleteDevice.name}</strong> permanently deletes its stored encrypted API credentials, certificate settings, inventory record, and associated polling history. The pfSense appliance itself will not be changed.</p></div>
            <label className="delete-confirm-label">Type <strong>DELETE</strong> to confirm<input autoFocus value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder="Type DELETE" autoComplete="off" /></label>
            <div className="modal-actions"><button type="button" onClick={() => { setDeleteDevice(null); setDeleteConfirmation(""); }} disabled={busy}>Cancel</button><button type="button" className="danger-button" onClick={() => void confirmDeleteDevice()} disabled={busy || deleteConfirmation !== "DELETE"}>{busy ? "Deleting…" : "Delete firewall"}</button></div>
          </section>
        </div>}
        {checkModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setCheckModalOpen(false); }}>
          <section className="modal-card check-modal" role="dialog" aria-modal="true" aria-labelledby="check-modal-title">
            <div className="modal-heading"><div><span className="eyebrow">DEVICE DIAGNOSTICS</span><h2 id="check-modal-title">Read-only check: {devices.find(device => device.id === selectedDeviceId)?.name ?? "Firewall"}</h2><p className="muted">Queries supported read-only pfSense endpoints. No firewall settings are changed.</p></div><button type="button" onClick={() => setCheckModalOpen(false)} disabled={busy} aria-label="Close">×</button></div>
            <div className="check-modal-body">
              {busy && !overview && <div className="check-loading"><span className="check-spinner"/> <strong>Running read-only checks…</strong><p className="muted">Waiting for the firewall API responses.</p></div>}
              {checkError && <div className="notice">{checkError}</div>}
              {overview && <DiagnosticResults overview={overview} failedOperations={deviceChecks[selectedDeviceId ?? ""]?.failedOperations ?? 0} resultsRef={checkResultsRef} />}
            </div>
            <div className="modal-actions"><button onClick={() => setCheckModalOpen(false)} disabled={busy}>Close</button>{selectedDeviceId && <button className="primary-button" onClick={() => void runCheck(selectedDeviceId)} disabled={busy}>Run again</button>}</div>
          </section>
        </div>}
        <footer className="app-footer">pfSense Hub Manager <span>·</span> {isAdmin ? "Administrator access" : "Read-only access"} <span>·</span> Firewall configuration changes are not enabled in this release</footer>
      </main>
    </div>
  </div>;
}


function DiagnosticResults({overview,failedOperations,resultsRef}:{overview:DiagnosticRecord;failedOperations:number;resultsRef:React.RefObject<HTMLPreElement | null>}) {
  const system = diagnosticRecord(overview.system);
  const version = diagnosticRecord(overview.version);
  const stateSize = diagnosticRecord(overview.firewallStateSize);
  const systemEntries = Object.entries(system).filter(([,value]) => value !== null && ["string","number","boolean"].includes(typeof value)).slice(0,8);
  const recordCount = (key:string) => {
    const value = diagnosticRecord(overview[key]).recordCount;
    return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat().format(value) : "Not reported";
  };
  const numberValue = (value:unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const currentStates = numberValue(stateSize.currentstates);
  const configuredLimit = numberValue(stateSize.maximumstates) ?? numberValue(stateSize.defaultmaximumstates);
  const statePercent = currentStates !== null && configuredLimit !== null && configuredLimit > 0 ? (currentStates / configuredLimit) * 100 : null;
  const versionValue = ["version","product_version","release","version_full"].map(key => version[key]).find(value => typeof value === "string" && value.length > 0);
  const successfulOperations = Math.max(0,8-failedOperations);
  const outcome = failedOperations === 0 ? "success" : "partial";
  return <div className="diagnostic-results">
    <div className={outcome === "success" ? "check-result-summary diagnostic-summary-success" : "check-result-summary diagnostic-summary-warning"}>
      <div><strong>{outcome === "success" ? "All core checks responded" : "Some core checks did not complete"}</strong><span>{successfulOperations} of 8 core operations succeeded</span></div>
      <span>{failedOperations} failed</span>
    </div>
    <section className="diagnostic-section">
      <div className="diagnostic-section-heading"><div><span className="eyebrow">COLLECTION OVERVIEW</span><h3>Firewall services and network</h3></div><span className="diagnostic-section-note">Read-only data</span></div>
      <div className="diagnostic-stat-grid">
        <article className="diagnostic-stat"><span>Gateways</span><strong>{recordCount("gateways")}</strong><small>Records returned</small></article>
        <article className="diagnostic-stat"><span>Interfaces</span><strong>{recordCount("interfaces")}</strong><small>Records returned</small></article>
        <article className="diagnostic-stat"><span>Services</span><strong>{recordCount("services")}</strong><small>Records returned</small></article>
        <article className="diagnostic-stat"><span>ARP entries</span><strong>{diagnosticValue(overview.arpEntryCount)}</strong><small>Count returned</small></article>
        <article className="diagnostic-stat"><span>Firewall states</span><strong>{diagnosticValue(overview.firewallStateEntryCount)}</strong><small>Active state entries</small></article>
        <article className="diagnostic-stat"><span>State table usage</span><strong>{currentStates === null ? "Not reported" : diagnosticValue(currentStates)}</strong><small>{configuredLimit === null ? "Configured limit unavailable" : `of ${diagnosticValue(configuredLimit)} configured default limit`}{statePercent === null ? "" : ` · ${statePercent.toFixed(1)}%`}</small></article>
      </div>
    </section>
    <div className="diagnostic-detail-grid">
      <section className="diagnostic-info-card">
        <span className="eyebrow">SYSTEM INFORMATION</span>
        <h3>System metrics</h3>
        {systemEntries.length ? <dl>{systemEntries.map(([key,value]) => <div key={key}><dt>{diagnosticLabel(key)}</dt><dd>{diagnosticValue(value)}</dd></div>)}</dl> : <p className="diagnostic-empty">No system metrics were returned by this check.</p>}
      </section>
      <section className="diagnostic-info-card">
        <span className="eyebrow">SOFTWARE</span>
        <h3>pfSense version</h3>
        <strong className="diagnostic-version">{versionValue ? diagnosticValue(versionValue) : "Not reported"}</strong>
        <dl>{["base","patch","buildtime"].filter(key => version[key] !== undefined && version[key] !== null).map(key => <div key={key}><dt>{diagnosticLabel(key)}</dt><dd>{diagnosticValue(version[key])}</dd></div>)}</dl>
      </section>
    </div>
    <details className="technical-details">
      <summary><span><strong>Technical details</strong><small>Redacted JSON response from the read-only endpoints</small></span><span className="technical-details-toggle">Expand</span></summary>
      <pre ref={resultsRef}>{diagnosticJson(overview)}</pre>
    </details>
    <p className="muted diagnostic-disclaimer">These figures describe data returned by the available endpoints. A successful collection confirms API responses, not the operational health of every gateway, interface, or service.</p>
  </div>;
}

function PlaceholderPage({eyebrow,title,description,items}:{eyebrow:string;title:string;description:string;items:string[]}) {
  return <div className="page-stack"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="muted">{description}</p></div><section className="content-card placeholder-card"><span className="placeholder-icon">✧</span><h3>{title} workspace</h3><p className="muted">This page structure is ready. Functionality will be implemented in a later milestone.</p>{items.length > 0 && <ul className="planned-list">{items.map(item => <li key={item}>{item}</li>)}</ul>}</section></div>;
}
