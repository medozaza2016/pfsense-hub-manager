import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { DataTable, Feedback, ListToolbar, type DataColumn } from "./components/ui";
import "./components/ui.css";
import { useToast } from "./components/ToastProvider";
import { SystemRecoveryPage } from "./pages/system-recovery";
import { apiRequest } from "./lib/api";
import {
  useSiteSnapshot,
  formatDuration,
  formatNumber,
  formatPercent,
  statusFromBooleans,
  type GatewayView,
  type InterfaceView,
  type ServiceView
} from "./lib/site-snapshot";
import {
  useConfigurationRead,
  useTelemetryRead,
  type PageReadState,
  type AliasView,
  type CertificateAuthorityView,
  type CertificateView,
  type DhcpAddressPoolView,
  type DhcpServerView,
  type DhcpStaticMappingView,
  type DnsDomainOverrideView,
  type DnsHostOverrideView,
  type InterfaceConfigView,
  type IpsecSaView,
  type NatOneToOneView,
  type NatOutboundView,
  type NatPortForwardView,
  type OpenVpnClientView,
  type OpenVpnServerView,
  type RuleView,
  type StaticRouteView,
  type WireGuardPeerView,
  type WireGuardTunnelView
} from "./lib/device-configuration";

type IconName = "grid" | "sites" | "network" | "bell" | "settings" | "monitor" | "layers" | "shield" | "list" | "route" | "server" | "globe" | "key" | "file" | "plus" | "search" | "refresh" | "chevron" | "menu" | "close" | "clock" | "cpu" | "database" | "harddrive" | "check" | "alert" | "wifi" | "building" | "activity" | "more" | "external";
function Icon({name,size=18}:{name:IconName;size?:number}) {
  const paths: Record<IconName,string> = {
    grid:"M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    sites:"M3 21V7l9-4 9 4v14 M8 21v-7h8v7 M7 9h.01 M12 9h.01 M17 9h.01",
    network:"M12 5v6m0 0-6 5m6-5 6 5 M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    bell:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
    settings:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.8.1l-.2.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-3.1-1.8.1-.2a1.7 1.7 0 0 0-.1-1.8l-.1-.2v-3.6l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.8-3.1.2.1a1.7 1.7 0 0 0 1.8-.1l.2-.1h3.6l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 3.1 1.8-.1.2a1.7 1.7 0 0 0 .1 1.8l.1.2v3.6Z",
    monitor:"M3 4h18v13H3z M8 21h8 M12 17v4",
    layers:"M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
    shield:"M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z M9 12l2 2 4-4",
    list:"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    route:"M4 6h.01M20 18h.01M4 6c0 8 16 2 16 12",
    server:"M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01M12 7h4M12 17h4",
    globe:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
    key:"M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1-7.1 5 5 0 0 1 7.1 7.1ZM14 10l7 7-3 3-2-2-2 2-3-3",
    file:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8M8 17h8",
    plus:"M12 5v14M5 12h14",
    search:"m21 21-4.3-4.3M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
    refresh:"M20 7v5h-5M4 17v-5h5 M5.6 9a7 7 0 0 1 12-2L20 12M4 12l2.4 5a7 7 0 0 0 12-2",
    chevron:"m9 18 6-6-6-6",
    menu:"M3 6h18M3 12h18M3 18h18",
    close:"M18 6 6 18M6 6l12 12",
    clock:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
    cpu:"M6 6h12v12H6zM9 9h6v6H9zM9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5",
    database:"M4 5c0-2 16-2 16 0v14c0 2-16 2-16 0zM4 5c0 2 16 2 16 0M4 12c0 2 16 2 16 0",
    harddrive:"M3 6h18v12H3zM7 14h.01M11 14h.01M7 10h10",
    check:"m5 12 4 4L19 6",
    alert:"M12 3 2 21h20L12 3ZM12 9v5m0 3h.01",
    wifi:"M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01",
    building:"M3 21V3h18v18M7 7h3m4 0h3M7 11h3m4 0h3M7 15h3m4 0h3M10 21v-3h4v3",
    activity:"M3 12h4l3-8 4 16 3-8h4",
    more:"M5 12h.01M12 12h.01M19 12h.01",
    external:"M14 3h7v7m0-7L10 14 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

type Page = "overview"|"sites"|"connectivity"|"alerts"|"hub-settings"|"system-recovery"|"monitoring"|"interfaces"|"rules"|"aliases"|"nat"|"routing"|"gateways"|"dhcp"|"dns"|"services"|"certificates"|"vpn"|"compatibility"|"site-settings"|"users"|"audit";
type Device = {id:string;name:string;location:string|null;edition:string;release?:string|null;address:string;state:"online"|"offline"|"unknown";lastSeen:string;isDemo?:boolean;enabled?:boolean};
type ManagedDeviceRecord = {id:string;name:string;location:string|null;edition:string;release:string|null;platform?:string|null;apiPackageVersion?:string|null;compatibility?:"unknown"|"verified"|"mismatch";compatibilityCheckedAt?:string|null;enabled:boolean;isDemo:boolean;connectionState:"unknown"|"reachable"|"unreachable";lastConnectionCheckAt:string|null};
const hubNav:{id:Page;label:string;icon:IconName;section:string}[]=[
 {id:"overview",label:"Hub Overview",icon:"grid",section:"WORKSPACE"},
 {id:"sites",label:"Sites",icon:"sites",section:"WORKSPACE"},
 {id:"connectivity",label:"Connectivity",icon:"network",section:"WORKSPACE"},
 {id:"alerts",label:"Alerts",icon:"bell",section:"WORKSPACE"},
 {id:"hub-settings",label:"Hub Settings",icon:"settings",section:"ADMINISTRATION"}
];
const siteNav:{id:Page;label:string;icon:IconName;section:string}[]=[
 {id:"overview",label:"Overview",icon:"grid",section:"SITE"},
 {id:"monitoring",label:"Monitoring",icon:"activity",section:"SITE"},
 {id:"interfaces",label:"Interfaces",icon:"network",section:"NETWORK"},
 {id:"rules",label:"Firewall Rules",icon:"shield",section:"SECURITY"},
 {id:"aliases",label:"Aliases",icon:"layers",section:"SECURITY"},
 {id:"nat",label:"NAT",icon:"route",section:"NETWORK"},
 {id:"routing",label:"Routing",icon:"route",section:"NETWORK"},
 {id:"gateways",label:"Gateways",icon:"globe",section:"NETWORK"},
 {id:"dhcp",label:"DHCP",icon:"server",section:"SERVICES"},
 {id:"dns",label:"DNS",icon:"globe",section:"SERVICES"},
 {id:"services",label:"Services",icon:"settings",section:"SERVICES"},
 {id:"certificates",label:"Certificates",icon:"key",section:"SERVICES"},
 {id:"vpn",label:"VPN",icon:"shield",section:"SECURITY"},
 {id:"compatibility",label:"Compatibility",icon:"check",section:"MANAGEMENT"},
 {id:"site-settings",label:"Site Settings",icon:"settings",section:"MANAGEMENT"}
];
const adminNav:{id:Page;label:string;icon:IconName}[]=[
 {id:"users",label:"User Management",icon:"sites"},
 {id:"audit",label:"Audit Logs",icon:"file"},
 {id:"system-recovery",label:"System Monitoring & Recovery",icon:"monitor"}
];
const titles:Record<Page,string>=Object.fromEntries([...hubNav,...siteNav,...adminNav].map(x=>[x.id,x.label])) as Record<Page,string>;
const descriptions:Record<string,string>={
 overview:"A centralized view of your managed firewall sites",
 sites:"Review registered firewalls and open an individual site workspace",
 connectivity:"A consolidated view of site reachability and network health",
 alerts:"Review operational events and issues across all managed sites",
 "hub-settings":"Configure global Hub Manager preferences",
 "system-recovery":"Host resources, application service health, logs and recovery controls for this Hub deployment",
 monitoring:"Performance and health metrics collected for this firewall",
 interfaces:"Network interfaces, addressing and link status",
 rules:"Review firewall policy and rule organization",
 aliases:"Manage reusable network and port aliases",
 nat:"Review network address translation mappings",
 routing:"Routing tables, static routes and policy paths",
 gateways:"Gateway health, monitoring and failover configuration",
 dhcp:"DHCP server scopes, leases and reservations",
 dns:"DNS resolver, forwarding and host overrides",
 services:"Firewall services and service health",
 certificates:"Certificate inventory, validity and trust",
 vpn:"VPN tunnels, peers and connection status",
 compatibility:"API package, release and capability compatibility",
 "site-settings":"Connection details and site-specific settings",
 users:"Manage application users and access roles",
 audit:"Review security-relevant activity and administrative events"
};
const mockRows:Record<string,string[][]>={
 interfaces:[["WAN","1.2.3.4","1.0 Gbps","Up"],["LAN","192.168.10.1","1.0 Gbps","Up"],["OPT1","192.168.20.1","1.0 Gbps","Up"]],
 rules:[["100","Allow LAN to Internet","LAN","IPv4 *","Pass","Enabled"],["110","Allow DNS","LAN","UDP 53","Pass","Enabled"],["120","Block guest network","GUEST","IPv4 *","Block","Enabled"]],
 aliases:[["LAN_NETWORK","Network","192.168.10.0/24","12"],["DNS_SERVERS","Host","1.1.1.1, 8.8.8.8","2"],["WEB_PORTS","Port","80, 443","2"]],
 nat:[["WAN HTTPS","Port forward","443","192.168.10.20","Enabled"],["WireGuard","Outbound NAT","Any","Automatic","Enabled"]],
 routing:[["Default route","0.0.0.0/0","192.0.2.1","WAN"],["Internal route","10.20.0.0/16","192.168.10.254","LAN"]],
 gateways:[["WAN_DHCP","192.0.2.1","Online","0.8 ms"],["VPN_GW","10.8.0.1","Online","12 ms"]],
 dhcp:[["LAN","192.168.10.100 - 199","100","Enabled"],["GUEST","192.168.30.100 - 199","100","Enabled"]],
 dns:[["Resolver","Enabled","127.0.0.1","Active"],["Forwarder","Enabled","1.1.1.1","Active"]],
 services:[["DHCP Server","Running","Automatic"],["DNS Resolver","Running","Automatic"],["NTP","Running","Automatic"],["OpenVPN","Stopped","Manual"]],
 certificates:[["webConfigurator","Local CA","2027-08-12","Valid"],["vpn-server","Internal CA","2027-03-04","Valid"]],
 vpn:[["Site-to-site VPN","IPsec","Connected","00:14:32"],["Remote access","OpenVPN","Disconnected","—"]]
};
function Status({state,label}:{state:"online"|"offline"|"warning"|"unknown";label?:string}){const tone=state==="unknown"?"warning":state;return <span className={"status-pill "+tone}><i/>{label??(state==="online"?"Online":state==="offline"?"Offline":state==="unknown"?"Unknown":"Attention")}</span>}
function Metric({icon,label,value,detail,tone}:{icon:IconName;label:string;value:string;detail:string;tone:string}){return <article className="metric-card"><div className={"metric-icon "+tone}><Icon name={icon} size={23}/></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>}
function Panel({title,action,children,className=""}:{title:string;action?:ReactNode;children:React.ReactNode;className?:string}){return <section className={"panel "+className}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>}

export default function App(){
 const location = useLocation();
 const routerNavigate = useNavigate();
 const [authMode,setAuthMode]=useState<"checking"|"setup"|"login"|"ready">("checking");
 const [authUser,setAuthUser]=useState("");
 const [authRole,setAuthRole]=useState<"admin"|"user">("user");
 useEffect(()=>{let active=true;(async()=>{try{const status=await fetch("/api/v1/auth/status",{credentials:"same-origin"});const body=await status.json();if(!active)return;if(body.data?.setupRequired){setAuthMode("setup");return;}const me=await fetch("/api/v1/auth/me",{credentials:"same-origin"});if(!active)return;if(me.ok){const result=await me.json();setAuthUser(result.data?.username??"Administrator");setAuthRole(result.data?.role==="admin"?"admin":"user");setAuthMode("ready");}else setAuthMode("login");}catch{if(active)setAuthMode("login");}})();return()=>{active=false;}},[]);
 const [page,setPage]=useState<Page>("overview");
 const [selected,setSelected]=useState<Device|null>(null);
 const [menuOpen,setMenuOpen]=useState(false);
 const [query,setQuery]=useState("");
 const [dialog,setDialog]=useState<"add-site"|"edit-site"|"archive-site"|"connection-security"|"profile"|"none">("none");
 const {notify}=useToast();
 const [filter,setFilter]=useState("All");
 const [refreshCount,setRefreshCount]=useState(0);
 const [formName,setFormName]=useState("");
 const [formLocation,setFormLocation]=useState("");
 const [formEdition,setFormEdition]=useState<"plus"|"ce"|"unknown">("ce");
 const [formApiBaseUrl,setFormApiBaseUrl]=useState("");
 const [formApiKey,setFormApiKey]=useState("");
 const [formCaBundle,setFormCaBundle]=useState("");
 const [formCaFileName,setFormCaFileName]=useState("");
 const [formCaFileError,setFormCaFileError]=useState("");
 const [formTlsServername,setFormTlsServername]=useState("");
 const [certificateDiscovery,setCertificateDiscovery]=useState<null|{subject:string;issuer:string;subjectAltName:string;dnsNames:string[];ipAddresses:string[];suggestedServername:string|null;fingerprint256:string;validFrom:string;validTo:string;tlsServernameUsed:string|null}>(null);
 const [fingerprintVerified,setFingerprintVerified]=useState(false);
 const [certificateDiscoveryBusy,setCertificateDiscoveryBusy]=useState(false);
 const [registrationVerified,setRegistrationVerified]=useState(false);
 const [formBusy,setFormBusy]=useState(false);
 const [formError,setFormError]=useState("");
 const [createdDeviceId,setCreatedDeviceId]=useState("");
 const [connectionTestBusy,setConnectionTestBusy]=useState(false);
 const [connectionTestResult,setConnectionTestResult]=useState("");
 const [localSites,setLocalSites]=useState<Device[]>([]);
 const [editingSite,setEditingSite]=useState<{id:string;name:string;location:string|null;edition:"plus"|"ce"|"unknown";apiBaseUrl:string;tlsServername:string|null}|null>(null);
 const [editName,setEditName]=useState("");
 const [editLocation,setEditLocation]=useState("");
 const [editEdition,setEditEdition]=useState<"plus"|"ce"|"unknown">("ce");
 const [editApiBaseUrl,setEditApiBaseUrl]=useState("");
 const [editTlsServername,setEditTlsServername]=useState("");
 const [archiveTarget,setArchiveTarget]=useState<Device|null>(null);
 const [archiveConfirmation,setArchiveConfirmation]=useState("");
 const [siteActionBusy,setSiteActionBusy]=useState(false);
 const [siteActionError,setSiteActionError]=useState("");
 const [securityApiKey,setSecurityApiKey]=useState("");
 const [securityCaBundle,setSecurityCaBundle]=useState("");
 const [clearCustomTrust,setClearCustomTrust]=useState(false);
 const [mobileTab,setMobileTab]=useState("Overview");
 useEffect(()=>{if(authMode!=="ready")return;let active=true;apiRequest<ManagedDeviceRecord[]>("/api/v1/devices").then(records=>{if(!active)return;setLocalSites(records.map(record=>({id:record.id,name:record.name,location:record.location,edition:record.edition==="plus"?"Plus":record.edition==="ce"?"CE":"Unknown",release:record.release??null,address:"Not configured",state:record.connectionState==="reachable"?"online":record.connectionState==="unreachable"?"offline":"unknown",lastSeen:record.lastConnectionCheckAt?new Date(record.lastConnectionCheckAt).toLocaleString():"Awaiting verified status",isDemo:record.isDemo,enabled:record.enabled})));}).catch(error=>{if(active)notify(error instanceof Error?error.message:"Unable to load managed sites.","error");});return()=>{active=false;};},[authMode]);
 const filteredSites=useMemo(()=>localSites.filter(s=>filter==="All"||s.state===filter.toLowerCase()),[localSites,filter]);
 const hubPaths:Record<string,string>={overview:"/",sites:"/sites",connectivity:"/connectivity",alerts:"/alerts","hub-settings":"/settings/hub",users:"/settings/users",audit:"/settings/audit","system-recovery":"/settings/system-recovery"};
 const siteSegments:Record<string,string>={overview:"overview",monitoring:"monitoring",interfaces:"interfaces",rules:"rules",aliases:"aliases",nat:"nat",routing:"routing",gateways:"gateways",dhcp:"dhcp",dns:"dns",services:"services",certificates:"certificates",vpn:"vpn",compatibility:"compatibility","site-settings":"settings"};
 const segmentPages:Record<string,Page>=Object.fromEntries(Object.entries(siteSegments).map(([key,value])=>[value,key as Page]));
 function go(id:Page){setPage(id);setMenuOpen(false);setQuery("");routerNavigate(selected?"/sites/"+selected.id+"/"+(siteSegments[id]??"overview"):(hubPaths[id]??"/"));}
 function openSite(d:Device){setSelected(d);setPage("overview");setMenuOpen(false);routerNavigate("/sites/"+d.id+"/overview");}
 function backHub(){setSelected(null);setPage("overview");routerNavigate("/");}
 useEffect(()=>{if(location.pathname==="/settings/application"){routerNavigate("/settings/hub",{replace:true});return;}const parts=location.pathname.split("/").filter(Boolean);if(parts[0]==="sites"&&parts.length>=2){const nextPage=segmentPages[parts[2]??"overview"]??"overview";setPage(nextPage);const found=localSites.find(site=>site.id===parts[1]);if(found)setSelected(found);else if(localSites.length)setSelected(null);return;}const hubPage:Record<string,Page>={"/":"overview","/sites":"sites","/connectivity":"connectivity","/alerts":"alerts","/settings/hub":"hub-settings","/settings/users":"users","/settings/audit":"audit","/settings/system-recovery":"system-recovery"};setPage(hubPage[location.pathname]??"overview");setSelected(null);},[location.pathname,localSites]);
 async function refresh(){try{const records=await apiRequest<ManagedDeviceRecord[]>("/api/v1/devices");setLocalSites(records.map(record=>({id:record.id,name:record.name,location:record.location,edition:record.edition==="plus"?"Plus":record.edition==="ce"?"CE":"Unknown",release:record.release??null,address:"Not configured",state:record.connectionState==="reachable"?"online":record.connectionState==="unreachable"?"offline":"unknown",lastSeen:record.isDemo?"Development sample · not connected":record.lastConnectionCheckAt?new Date(record.lastConnectionCheckAt).toLocaleString():"Awaiting verified status",isDemo:record.isDemo,enabled:record.enabled})));setRefreshCount(x=>x+1);notify("Site inventory and connection status refreshed from the Hub API.","success");}catch(error){notify(error instanceof Error?error.message:"Unable to refresh managed-site inventory.","error");}}
 async function openEditSite(site:Device){setSiteActionError("");setSiteActionBusy(true);try{const profile=await apiRequest<{id:string;name:string;location:string|null;edition:"plus"|"ce"|"unknown";apiBaseUrl:string;tlsServername:string|null}>(`/api/v1/devices/${site.id}/profile`);setEditingSite(profile);setEditName(profile.name);setEditLocation(profile.location??"");setEditEdition(profile.edition);setEditApiBaseUrl(profile.apiBaseUrl);setEditTlsServername(profile.tlsServername??"");setDialog("edit-site");}catch(error){notify(error instanceof Error?error.message:"Unable to load the site profile.","error");}finally{setSiteActionBusy(false);}}
 async function saveSiteProfile(e:React.FormEvent){e.preventDefault();if(!editingSite)return;setSiteActionError("");setSiteActionBusy(true);try{const updated=await apiRequest<{id:string;name:string;location:string|null;edition:"plus"|"ce"|"unknown";enabled:boolean}>(`/api/v1/devices/${editingSite.id}`,{method:"PATCH",body:JSON.stringify({name:editName,location:editLocation||null,edition:editEdition,apiBaseUrl:editApiBaseUrl,tlsServername:editTlsServername||null})});setLocalSites(current=>current.map(site=>site.id===updated.id?{...site,name:updated.name,location:updated.location,edition:updated.edition==="plus"?"Plus":updated.edition==="ce"?"CE":"Unknown"}:site));setSelected(current=>current?.id===updated.id?{...current,name:updated.name,location:updated.location,edition:updated.edition==="plus"?"Plus":updated.edition==="ce"?"CE":"Unknown"}:current);setDialog("none");notify("Site profile updated.","success");}catch(error){setSiteActionError(error instanceof Error?error.message:"Unable to update the site profile.");}finally{setSiteActionBusy(false);}}
 function openConnectionSecurity(site:Device){setArchiveTarget(site);setSecurityApiKey("");setSecurityCaBundle("");setClearCustomTrust(false);setSiteActionError("");setDialog("connection-security");}
 async function saveConnectionSecurity(){if(!archiveTarget)return;if(securityApiKey.trim()&&(securityCaBundle.trim()||clearCustomTrust)){setSiteActionError("Save the API credential and TLS trust separately so each change can be verified independently.");return;}if(!securityApiKey.trim()&&!securityCaBundle.trim()&&!clearCustomTrust){setSiteActionError("Enter a new API key or provide a TLS trust change.");return;}setSiteActionBusy(true);setSiteActionError("");try{if(securityApiKey.trim())await apiRequest(`/api/v1/devices/${archiveTarget.id}/credential`,{method:"PUT",body:JSON.stringify({apiKey:securityApiKey})});if(securityCaBundle.trim()||clearCustomTrust)await apiRequest(`/api/v1/devices/${archiveTarget.id}/tls-trust`,{method:"PUT",body:JSON.stringify({certificateAuthority:clearCustomTrust?null:securityCaBundle})});setSecurityApiKey("");setSecurityCaBundle("");setClearCustomTrust(false);setDialog("none");notify("Site connection security settings updated. Secret material is not returned to the browser.","success");}catch(error){setSiteActionError(error instanceof Error?error.message:"Unable to update connection security settings.");}finally{setSiteActionBusy(false);}}
 function openArchiveSite(site:Device){setArchiveTarget(site);setArchiveConfirmation("");setSiteActionError("");setDialog("archive-site");}
 async function archiveSite(){if(!archiveTarget||archiveConfirmation!=="ARCHIVE")return;setSiteActionBusy(true);setSiteActionError("");try{await apiRequest<{archived:boolean}>(`/api/v1/devices/${archiveTarget.id}`,{method:"DELETE",body:JSON.stringify({confirmation:"ARCHIVE"})});setLocalSites(current=>current.filter(site=>site.id!==archiveTarget.id));if(selected?.id===archiveTarget.id){setSelected(null);setPage("sites");routerNavigate("/sites");}setDialog("none");setArchiveTarget(null);notify("Site archived. Polling history, alerts, and audit records were retained; stored connection secrets were purged.","success");}catch(error){setSiteActionError(error instanceof Error?error.message:"Unable to archive the site.");}finally{setSiteActionBusy(false);}}
 async function setSiteEnabled(site:Device){const next=!site.enabled;setSiteActionBusy(true);try{const updated=await apiRequest<{enabled:boolean}>(`/api/v1/devices/${site.id}/enabled`,{method:"PATCH",body:JSON.stringify({enabled:next})});setLocalSites(current=>current.map(item=>item.id===site.id?{...item,enabled:updated.enabled}:item));setSelected(current=>current?.id===site.id?{...current,enabled:updated.enabled}:current);notify(next?"Site enabled.":"Site disabled.","success");}catch(error){notify(error instanceof Error?error.message:"Unable to change site status.","error");}finally{setSiteActionBusy(false);}}
 function openAddSite(){setFormName("");setFormLocation("");setFormEdition("ce");setFormApiBaseUrl("");setFormApiKey("");setFormCaBundle("");setFormCaFileName("");setFormCaFileError("");setFormTlsServername("");setCertificateDiscovery(null);setFingerprintVerified(false);setRegistrationVerified(false);setFormError("");setCreatedDeviceId("");setConnectionTestResult("");setDialog("add-site");}
 async function importCaFile(file:File|null){setFormCaFileError("");if(!file)return;if(!/\.(pem|crt|cer)$/i.test(file.name)){setFormCaFileError("Choose a .pem, .crt, or .cer certificate file.");return;}if(file.size>60*1024){setFormCaFileError("The certificate file must be 60 KB or smaller.");return;}try{const pem=(await file.text()).trim();if(!pem.includes("-----BEGIN CERTIFICATE-----")){setFormCaFileError("The selected file does not contain a PEM certificate.");return;}setFormCaBundle(pem);setFormCaFileName(file.name);setRegistrationVerified(false);setConnectionTestResult("");}catch{setFormCaFileError("The selected certificate file could not be read.");}}
 async function discoverFirewallCertificate(){setFormError("");setCertificateDiscovery(null);setFingerprintVerified(false);setRegistrationVerified(false);setCertificateDiscoveryBusy(true);try{const first=await apiRequest<NonNullable<typeof certificateDiscovery>>("/api/v1/devices/discover-certificate",{method:"POST",body:JSON.stringify({apiBaseUrl:formApiBaseUrl,...(formTlsServername.trim()?{tlsServername:formTlsServername.trim()}:{})})});if(!formTlsServername.trim()&&first.suggestedServername){setFormTlsServername(first.suggestedServername);const selected=await apiRequest<NonNullable<typeof certificateDiscovery>>("/api/v1/devices/discover-certificate",{method:"POST",body:JSON.stringify({apiBaseUrl:formApiBaseUrl,tlsServername:first.suggestedServername})});setCertificateDiscovery(selected);}else setCertificateDiscovery(first);}catch(error){setFormError(error instanceof Error?error.message:"Unable to discover the firewall TLS certificate.");}finally{setCertificateDiscoveryBusy(false);}}
 async function testRegistrationConnection(){setFormError("");setRegistrationVerified(false);if((certificateDiscovery||formTlsServername.trim())&&(!certificateDiscovery||!fingerprintVerified)){setFormError("Discover the certificate using the selected TLS server name and verify its fingerprint through a trusted channel before testing.");return;}setConnectionTestBusy(true);setConnectionTestResult("");try{await apiRequest<{outcome:"reachable";operation:string}>("/api/v1/devices/registration-test",{method:"POST",body:JSON.stringify({apiBaseUrl:formApiBaseUrl,apiKey:formApiKey,...(formCaBundle.trim()?{certificateAuthority:formCaBundle}:{}),...(formTlsServername.trim()?{tlsServername:formTlsServername.trim()}:{})})});setRegistrationVerified(true);setConnectionTestResult("TLS verification and authenticated pfSense API test succeeded. You can register this firewall.");}catch(error){setConnectionTestResult(error instanceof Error?error.message:"Firewall connection test failed.");}finally{setConnectionTestBusy(false);}}
 async function addSite(e:React.FormEvent){e.preventDefault();setFormError("");if(!registrationVerified){setFormError("Test and verify the firewall connection before registering it.");return;}setFormBusy(true);try{const created=await apiRequest<{id:string;name:string;location:string|null;edition:"plus"|"ce"|"unknown";enabled:boolean;isDemo:boolean}>("/api/v1/devices",{method:"POST",body:JSON.stringify({name:formName,location:formLocation||null,edition:formEdition,apiBaseUrl:formApiBaseUrl,apiKey:formApiKey,...(formCaBundle.trim()?{certificateAuthority:formCaBundle}:{}),...(formTlsServername.trim()?{tlsServername:formTlsServername.trim()}:{})})});setCreatedDeviceId(created.id);setFormApiKey("");setFormCaBundle("");setLocalSites(current=>[{id:created.id,name:created.name,location:created.location,edition:created.edition==="plus"?"Plus":"CE",address:"Not configured",state:"online",lastSeen:"Connection verified during registration",isDemo:false},...current.filter(site=>site.id!==created.id)]);setConnectionTestResult("Connection verified. The firewall was registered with its TLS trust settings.");notify("Firewall connection verified and site registered.","success");}catch(error){setRegistrationVerified(false);setFormError(error instanceof Error?error.message:"Unable to register this firewall.");}finally{setFormBusy(false);}}
 async function signOut(){await fetch("/api/v1/auth/logout",{method:"POST",credentials:"same-origin"});setAuthUser("");setAuthMode("login");setDialog("none");}
 if(authMode==="checking")return <AuthScreen mode="loading" onAuthenticated={()=>{}}/>;
 if(authMode!=="ready")return <AuthScreen mode={authMode} onAuthenticated={username=>{setAuthUser(username);setAuthMode("ready");}}/>;
 const isOverview=page==="overview";
 // Mobile bottom navigation targets are explicit so a label change cannot silently
 // point a tab at the wrong page. In the Hub context the fifth tab opens System
 // Monitoring & Recovery; Hub and application settings stay reachable from the menu.
 const mobileNavItems:Array<[string,IconName,Page|"more"]>=selected
  ?[["Overview","grid","overview"],["Monitoring","activity","monitoring"],["Interfaces","network","interfaces"],["Rules","shield","rules"],["More","more","more"]]
  :[["Overview","grid","overview"],["Sites","sites","sites"],["Connectivity","network","connectivity"],["Alerts","bell","alerts"],["System monitoring","monitor","system-recovery"]];
 return <div className="app-shell">
  <aside className={"sidebar "+(menuOpen?"sidebar-open":"")}>
   <div className="brand"><div className="brand-mark">PF</div><div className="brand-name"><strong>pfSense Hub</strong><span>Manager</span></div></div>
   {selected?<><button className="back-link" onClick={backHub}>← <span>Back to Hub</span></button><div className="nav-caption">SITE: {selected.name.toUpperCase()}</div>{siteNav.map((n,i)=><Fragment key={n.id}>{(i===2||i===3||i===5||i===8||i===12||i===13)&&<div className="nav-divider"/>}<button className={"nav-item "+(page===n.id?"active":"")} onClick={()=>go(n.id)}><Icon name={n.icon}/><span>{n.label}</span></button></Fragment>)}</>:<>
    <div className="nav-caption">WORKSPACE</div>{hubNav.slice(0,4).map(n=><button key={n.id} className={"nav-item "+(page===n.id?"active":"")} onClick={()=>go(n.id)}><Icon name={n.icon}/><span>{n.label}</span></button>)}
    <div className="nav-caption admin-caption">ADMINISTRATION</div>{[hubNav[4],...adminNav].map(n=><button key={n.id} className={"nav-item "+(page===n.id?"active":"")} onClick={()=>go(n.id)}><Icon name={n.icon}/><span>{n.label}</span></button>)}
   </>}
   <div className="sidebar-footer"><span className="status-dot"/><div><strong>{selected?selected.state==="online"?"Site online":selected.state==="offline"?"Site offline":"Site status unknown":"Hub operational"}</strong><span>Preview environment</span></div></div>
  </aside>
  {menuOpen&&<button className="sidebar-scrim" aria-label="Close menu" onClick={()=>setMenuOpen(false)}/>}
  <main className="main-area">
   <header className="topbar">
    <div className="topbar-leading"><button className="mobile-menu" aria-label="Toggle navigation" onClick={()=>setMenuOpen(v=>!v)}><Icon name="menu"/></button><div className="breadcrumb"><span>pfSense Hub Manager</span><strong>{selected?selected.name:"Hub Overview"}</strong></div></div>
    <div className="topbar-actions"><span className="connection-chip"><i/>Hub operational</span><button className="icon-button" title="Refresh preview" aria-label="Refresh preview" onClick={refresh}><Icon name="refresh"/></button><button className="primary-button add-site-top" onClick={openAddSite}><Icon name="plus" size={16}/> Add Site</button><button className="avatar" onClick={()=>setDialog("profile")}>{authUser.slice(0,2).toUpperCase()}</button><button className="top-chevron" onClick={()=>setDialog("profile")}><span>⌄</span></button></div>
   </header>
   <div className="page-content">
    {isOverview&&!selected?<HubOverview sites={localSites} onOpen={openSite} onViewAll={()=>go("sites")} onConnectivity={()=>go("connectivity")} refreshCount={refreshCount}/>:selected&&page==="overview"?<SiteOverview device={selected} onNavigate={go}/>:page==="sites"?<SitesPage sites={filteredSites} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onOpen={openSite} onAdd={openAddSite}/>:page==="connectivity"?<Connectivity sites={localSites} onOpen={openSite} onRefresh={()=>void refresh()}/>:page==="alerts"?<Alerts onNavigate={go}/>:page==="users"?<UserManagement currentUsername={authUser}/>:page==="audit"?<AuditLog/>:page==="hub-settings"?<HubSettingsPage/>:page==="system-recovery"?<SystemRecoveryPage role={authRole}/>:page==="monitoring"?<Monitoring device={selected}/>:page==="compatibility"?<Compatibility device={selected}/>:page==="site-settings"?<SiteSettings device={selected} onEdit={()=>selected&&void openEditSite(selected)} onArchive={()=>selected&&openArchiveSite(selected)} onToggleEnabled={()=>selected&&void setSiteEnabled(selected)} onSecurity={()=>selected&&openConnectionSecurity(selected)}/>:<DataPage page={page} device={selected} query={query} setQuery={setQuery} onAdd={()=>notify("This is a frontend-only preview. No firewall configuration was changed.")} />}
   </div>
   <footer className="app-footer">pfSense Hub Manager</footer>
  </main>
  <nav className="mobile-bottom-nav">{mobileNavItems.map(([label,icon,target])=><button key={label} className={(target!=="more"&&page===target)||mobileTab===label?"selected":""} aria-current={target!=="more"&&page===target?"page":undefined} onClick={()=>{setMobileTab(label);if(target==="more")setMenuOpen(true);else go(target)}}><Icon name={icon} size={18}/><span>{label}</span></button>)}</nav>
  {dialog!=="none"&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!formBusy&&!connectionTestBusy&&!certificateDiscoveryBusy&&!siteActionBusy)setDialog("none")}}><section className="modal">{!createdDeviceId&&<button className="modal-close" disabled={formBusy||connectionTestBusy||certificateDiscoveryBusy||siteActionBusy} onClick={()=>setDialog("none")}><Icon name="close"/></button>}{dialog==="edit-site"&&editingSite?<><span className="eyebrow">SITE MANAGEMENT</span><h2>Edit site profile</h2><p>Update the Hub connection profile. These changes do not modify pfSense configuration.</p><form onSubmit={saveSiteProfile} className="site-onboarding-form"><div className="onboarding-grid"><label>Site name<input required maxLength={120} value={editName} onChange={e=>setEditName(e.target.value)}/></label><label>Location<input maxLength={120} value={editLocation} onChange={e=>setEditLocation(e.target.value)} placeholder="Optional"/></label><label>pfSense edition<select value={editEdition} onChange={e=>setEditEdition(e.target.value as "plus"|"ce"|"unknown")}><option value="ce">pfSense CE</option><option value="plus">pfSense Plus</option><option value="unknown">Unknown</option></select></label><label className="field-wide">HTTPS API origin<input required type="url" value={editApiBaseUrl} onChange={e=>setEditApiBaseUrl(e.target.value)} placeholder="https://192.168.10.1"/><small>HTTPS origin only. The API validates and constrains the destination.</small></label><label className="field-wide">TLS server name (optional)<input maxLength={253} value={editTlsServername} onChange={e=>setEditTlsServername(e.target.value)} placeholder="firewall.example.com"/><small>Used for certificate hostname verification when the API origin is an IP address.</small></label></div>{siteActionError&&<Feedback tone="error">{siteActionError}</Feedback>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={siteActionBusy} onClick={()=>setDialog("none")}>Cancel</button><button className="primary-button" type="submit" disabled={siteActionBusy}>{siteActionBusy?"Saving…":"Save changes"}</button></div></form></>:dialog==="connection-security"&&archiveTarget?<> <span className="eyebrow">SITE MANAGEMENT · CONNECTION SECURITY</span><h2>Credentials and TLS trust</h2><p>Update the manager-side API credential or custom CA trust. These secrets are encrypted by the Hub and are never displayed after saving.</p><label>New pfSense API key<input type="password" autoComplete="new-password" value={securityApiKey} onChange={e=>setSecurityApiKey(e.target.value)} placeholder="Leave blank to keep the current key"/></label><label>Custom CA certificate bundle<textarea rows={4} value={securityCaBundle} onChange={e=>{setSecurityCaBundle(e.target.value);setClearCustomTrust(false);}} placeholder="Paste PEM CA certificate bundle, leave blank to keep current trust"/></label><label className="tls-verify-check"><input type="checkbox" checked={clearCustomTrust} onChange={e=>{setClearCustomTrust(e.target.checked);if(e.target.checked)setSecurityCaBundle("");}}/><span>Remove custom CA trust and return to operating-system trust</span></label><Feedback tone="warning">A credential rotation or trust change can interrupt connectivity if the new value is incorrect. Verify the firewall-side credential and CA before saving.</Feedback>{siteActionError&&<Feedback tone="error">{siteActionError}</Feedback>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={siteActionBusy} onClick={()=>setDialog("none")}>Cancel</button><button type="button" className="primary-button" disabled={siteActionBusy||(!securityApiKey.trim()&&!securityCaBundle.trim()&&!clearCustomTrust)} onClick={()=>void saveConnectionSecurity()}>{siteActionBusy?"Saving…":"Save security settings"}</button></div></>:dialog==="archive-site"&&archiveTarget?<><span className="eyebrow">DANGER ZONE · SITE ARCHIVAL</span><h2>Archive {archiveTarget.name}?</h2><p>This removes the site from active inventory, disables it, and permanently purges its encrypted API credential and custom TLS trust material.</p><Feedback tone="warning">Polling history, existing alerts, and append-only audit records will be retained. This action cannot be reversed through the current interface.</Feedback><label>Type ARCHIVE to confirm<input value={archiveConfirmation} onChange={e=>setArchiveConfirmation(e.target.value)} autoComplete="off" placeholder="ARCHIVE"/></label>{siteActionError&&<Feedback tone="error">{siteActionError}</Feedback>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={siteActionBusy} onClick={()=>setDialog("none")}>Cancel</button><button type="button" className="primary-button danger-button" disabled={siteActionBusy||archiveConfirmation!=="ARCHIVE"} onClick={()=>void archiveSite()}>{siteActionBusy?"Archiving…":"Archive site"}</button></div></>:dialog==="add-site"?createdDeviceId?<><span className="eyebrow">SITE ONBOARDING</span><h2>Site registered</h2><p>{formName} has been saved in the Hub. Credentials are stored encrypted and are not displayed again.</p>{connectionTestResult&&<Feedback tone={(connectionTestResult.startsWith("Connection successful")||connectionTestResult.startsWith("Connection verified")||connectionTestResult.startsWith("Custom CA trust was saved"))?"success":"warning"}>{connectionTestResult}</Feedback>}<div className="modal-actions"><button type="button" className="primary-button" onClick={()=>{setDialog("none");setCreatedDeviceId("");}}>OK</button></div></>:<><span className="eyebrow">SITE ONBOARDING · ADMINISTRATOR</span><h2>Add a firewall site</h2><p>Register the HTTPS API endpoint and credentials for this firewall. The Hub will not change firewall configuration.</p><form onSubmit={addSite} className="site-onboarding-form">
 <section className="onboarding-section">
  <div className="onboarding-section-heading"><span>01</span><div><strong>Site information</strong><small>Identify this firewall in your inventory.</small></div></div>
  <div className="onboarding-grid">
   <label>Site name<input required maxLength={120} value={formName} onChange={e=>setFormName(e.target.value)} placeholder="e.g. Branch Office"/></label>
   <label><span className="field-label-row">Location <span className="field-optional">Optional</span></span><input maxLength={120} value={formLocation} onChange={e=>setFormLocation(e.target.value)} placeholder="City or site description"/></label>
   <label>pfSense edition<span className="onboarding-select-wrap"><select value={formEdition} onChange={e=>setFormEdition(e.target.value as "plus"|"ce")}><option value="ce">pfSense CE</option><option value="plus">pfSense Plus</option></select><span className="onboarding-select-chevron" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span></span></label>
  </div>
 </section>
 <section className="onboarding-section">
  <div className="onboarding-section-heading"><span>02</span><div><strong>API connection</strong><small>Enter the HTTPS endpoint and API credential.</small></div></div>
  <div className="onboarding-grid">
   <label className="field-wide">HTTPS API origin<input required type="url" value={formApiBaseUrl} disabled={certificateDiscoveryBusy||connectionTestBusy||formBusy} onChange={e=>{setFormApiBaseUrl(e.target.value);setCertificateDiscovery(null);setFormTlsServername("");setFingerprintVerified(false);setRegistrationVerified(false);setConnectionTestResult("");}} placeholder="https://192.168.10.1"/><small>Use the firewall's HTTPS API origin, without a path.</small></label>
   <div className="field-wide tls-discovery-action"><button type="button" className="secondary-button" onClick={()=>void discoverFirewallCertificate()} disabled={!formApiBaseUrl.startsWith("https://")||formBusy||connectionTestBusy||certificateDiscoveryBusy}>{certificateDiscoveryBusy?"Discovering…":"Discover TLS certificate"}</button><small>Inspects the certificate presented by the firewall. Discovery does not establish trust or send your API key.</small></div>
   {certificateDiscovery&&<div className="field-wide tls-discovery-card"><strong>Presented TLS certificate</strong><div><span>Subject</span><code>{certificateDiscovery.subject}</code></div><div><span>Issuer</span><code>{certificateDiscovery.issuer}</code></div><div><span>DNS names</span><code>{certificateDiscovery.dnsNames.join(", ")||"None"}</code></div><div><span>IP addresses</span><code>{certificateDiscovery.ipAddresses.join(", ")||"None"}</code></div><div><span>TLS server name used</span><code>{certificateDiscovery.tlsServernameUsed??"IP address identity"}</code></div><div><span>SHA-256 fingerprint</span><code>{certificateDiscovery.fingerprint256}</code></div><div><span>Valid from</span><code>{certificateDiscovery.validFrom}</code></div><div><span>Valid until</span><code>{certificateDiscovery.validTo}</code></div><label className="tls-verify-check"><input type="checkbox" checked={fingerprintVerified} disabled={connectionTestBusy||formBusy} onChange={e=>{setFingerprintVerified(e.target.checked);setRegistrationVerified(false);setConnectionTestResult("");}}/><span>I compared this fingerprint with a trusted source outside this connection.</span></label></div>}
   {certificateDiscovery&&<label className="field-wide">TLS server name (optional)<input value={formTlsServername} disabled={connectionTestBusy||formBusy} onChange={e=>{setFormTlsServername(e.target.value);setCertificateDiscovery(null);setFingerprintVerified(false);setRegistrationVerified(false);setConnectionTestResult("");}} placeholder="DNS name from certificate SAN"/><small>Use the certificate's DNS name when connecting to the firewall by IP address. Leave blank when the certificate matches the API host directly.</small></label>}
   <label className="field-wide">API key<input required type="password" autoComplete="new-password" value={formApiKey} disabled={connectionTestBusy||formBusy} onChange={e=>{setFormApiKey(e.target.value);setRegistrationVerified(false);setConnectionTestResult("");}} placeholder="Paste pfSense API credential"/><small>Stored encrypted by the Hub. It cannot be viewed again after registration.</small></label>
  </div>
 </section>
 <section className="onboarding-section">
  <div className="onboarding-section-heading"><span>03</span><div><strong>TLS certificate trust</strong><small>Only needed when the firewall uses a private certificate authority.</small></div></div>
  <div className="certificate-file-picker">
   <span className="certificate-file-title">Import CA certificate file</span>
   <input id="ca-certificate-file" className="certificate-file-input" type="file" accept=".pem,.crt,.cer,application/x-pem-file,application/pkix-cert" disabled={connectionTestBusy||formBusy} onChange={e=>{void importCaFile(e.target.files?.[0]??null);}}/>
   <div className="certificate-file-picker-row">
    <label className="certificate-file-button" htmlFor="ca-certificate-file"><Icon name="file" size={16}/> Browse files</label>
    <span className={formCaFileName?"certificate-file-name selected":"certificate-file-name"}>{formCaFileName||"No certificate selected"}</span>
   </div>
   <small className="certificate-file-hint">Accepted formats: PEM, CRT, CER. Maximum file size: 60 KB.</small>
  </div>
  <details className="certificate-help"><summary>How do I obtain the CA certificate?</summary><div><p>Only provide a certificate here if the firewall uses a self-signed certificate or a certificate issued by a private certificate authority. If the web interface certificate is trusted by the Hub host's operating system, leave this field blank.</p><ol><li>In pfSense, open <strong>System → Cert. Manager → CAs</strong>.</li><li>Find the certificate authority that issued the certificate used by the pfSense web interface.</li><li>Export the CA certificate, not its private key.</li><li>If the web interface certificate is self-signed, use that self-signed certificate as the trust certificate.</li></ol><p>Never upload or paste a private key.</p></div></details>
  {formCaFileError&&<Feedback tone="error">{formCaFileError}</Feedback>}
  <label>Or paste PEM certificate bundle<textarea rows={3} value={formCaBundle} disabled={connectionTestBusy||formBusy} onChange={e=>{setFormCaBundle(e.target.value);setFormCaFileName("");setRegistrationVerified(false);setConnectionTestResult("");}} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"/></label>
  <p className="onboarding-note">Certificate contents are validated by the API and stored encrypted. Do not upload a private key or a pfSense license file here.</p>
 </section>
 {formError&&<Feedback tone="error">{formError}</Feedback>}
 {connectionTestResult&&<Feedback tone={registrationVerified?"success":"warning"}>{connectionTestResult}</Feedback>}
 <div className="modal-actions onboarding-actions"><button type="button" className="secondary-button" onClick={()=>setDialog("none")} disabled={formBusy||connectionTestBusy||certificateDiscoveryBusy}>Cancel</button><button type="button" className="secondary-button" onClick={()=>void testRegistrationConnection()} disabled={formBusy||connectionTestBusy||certificateDiscoveryBusy||!formApiBaseUrl||!formApiKey}>{connectionTestBusy?"Testing…":"Test connection"}</button><button className="primary-button" type="submit" disabled={formBusy||connectionTestBusy||certificateDiscoveryBusy||!registrationVerified}>{formBusy?"Registering…":"Register firewall"}</button></div>
</form></>:<><span className="eyebrow">ACCOUNT</span><h2>Administrator</h2><p>You are signed in with an authenticated administrator session.</p><div className="profile-line"><span className="avatar">AM</span><div><strong>{authUser}</strong><small>Administrator</small></div></div><button className="secondary-button full-width" onClick={signOut}>Sign out</button></>}</section></div>}
 </div>
}
function HubOverview({sites,onOpen,onViewAll,onConnectivity,refreshCount}:{sites:Device[];onOpen:(d:Device)=>void;onViewAll:()=>void;onConnectivity:()=>void;refreshCount:number}){
 const online=sites.filter(site=>site.state==="online").length;const offline=sites.filter(site=>site.state==="offline").length;const unknown=sites.filter(site=>site.state==="unknown").length;
 return <><div className="page-heading"><div><h1>Network Overview</h1><p>Central inventory of managed firewall sites</p></div><div className="updated">Inventory refresh #{refreshCount}</div></div>
 <div className="metric-grid"><Metric icon="sites" label="Total sites" value={String(sites.length)} detail="Database inventory" tone="blue"/><Metric icon="wifi" label="Online" value={String(online)} detail="Verified reachable" tone="green"/><Metric icon="alert" label="Offline" value={String(offline)} detail="Verified unreachable" tone="orange"/><Metric icon="clock" label="Unknown" value={String(unknown)} detail="Not yet verified" tone="blue"/></div>
 <div className="overview-grid"><Panel title="Managed Sites" action={<button className="text-button" onClick={onViewAll}>View all <Icon name="chevron" size={15}/></button>}>
  {sites.length===0?<div className="empty-state"><strong>No managed sites registered</strong><span>Register a real pfSense firewall to begin building your inventory.</span></div>:<div className="site-rows">{sites.slice(0,3).map(site=><div className="site-row" key={site.id}><div className="site-symbol"><Icon name="building" size={23}/></div><div className="site-main"><strong>{site.name}</strong><span>{site.location??"Location not specified"}</span><small>{site.isDemo?"Development sample":"Managed device"} · {site.edition}</small></div><Status state={site.state} label={site.state==="unknown"?"Not verified":site.state}/><div className="site-last">{site.lastSeen}</div><button className="row-link" disabled={site.isDemo} onClick={()=>onOpen(site)}>{site.isDemo?"Demo record":"Open site"} <Icon name="chevron" size={14}/></button></div>)}</div>}
 </Panel><Panel title="Inventory health"><div className="health-summary"><div className="health-ring"><strong>{sites.length?Math.round((online+offline)/sites.length*100):0}%</strong></div><div><strong>{unknown?"Verification pending":"Inventory checked"}</strong><span>{online+offline} of {sites.length} sites have a verified connection state</span></div></div><div className="health-legend"><div><i className="legend-green"/>Reachable <b>{online}</b></div><div><i className="legend-orange"/>Unreachable <b>{offline}</b></div><div><i className="legend-orange"/>Unverified <b>{unknown}</b></div></div><button className="text-button" onClick={onConnectivity}>View connectivity <Icon name="chevron" size={15}/></button></Panel></div>
 <Feedback tone="info">This dashboard reflects the managed-device database inventory. A site is counted online or offline only after a verified connectivity check. Unverified sites are not assumed to be offline.</Feedback></>;
}
function SiteOverview({device,onNavigate}:{device:Device;onNavigate:(p:Page)=>void}){
 const live=useSiteSnapshot(device.id,!device.isDemo&&device.enabled!==false);
 if(device.isDemo)return <><div className="page-heading"><div><h1>{device.name}</h1><p>{device.location??"Location not specified"}</p></div><Status state="unknown" label="Not connected"/></div><Feedback tone="warning">This site has no verified connection. Configure a real firewall endpoint and credentials before expecting live telemetry.</Feedback><Panel title="Site connection details"><dl className="detail-list"><div><dt>pfSense edition</dt><dd>{device.edition}</dd></div><div><dt>Connection address</dt><dd>Not configured</dd></div><div><dt>Connection state</dt><dd>Unknown, not checked</dd></div><div><dt>Last check</dt><dd>Never</dd></div></dl><button className="secondary-button" onClick={()=>onNavigate("site-settings")}>View site settings</button></Panel></>;
 const snapshot=live.snapshot;
 const system=snapshot?.system??null;
 const compatibility=snapshot?.compatibility??null;
 return <><div className="page-heading"><div><h1>{device.name}</h1><p>{device.location??"Location not specified"}</p></div><Status state={device.state}/></div>
  {device.enabled===false&&<Feedback tone="warning">Polling is disabled for this site. Enable it in Site Settings before requesting live telemetry.</Feedback>}
  {live.error&&<Feedback tone="error">{live.error}</Feedback>}
  {!live.error&&live.loading&&!snapshot&&<Feedback tone="info">Reading the firewall through the approved read-only API…</Feedback>}
  {!live.error&&snapshot?.outcome==="unavailable"&&<Feedback tone="error">No read-only operation succeeded. The firewall, network path, credential, or TLS trust needs attention. Nothing on this page is inferred.</Feedback>}
  {snapshot?.outcome==="partial"&&<Feedback tone="warning">{snapshot.failedOperations} of 8 read-only operations failed ({snapshot.failures.map(item=>item.operation+": "+item.errorClass).join(", ")}). Reported values are from the operations that succeeded.</Feedback>}
  <div className="metric-grid">
   <Metric icon="cpu" label="CPU usage" value={formatPercent(system?.cpuUsagePercent??null)} detail={system?"Current sample":"Not reported"} tone="blue"/>
   <Metric icon="database" label="Memory used" value={formatPercent(system?.memoryUsagePercent??null)} detail={system?"Current sample":"Not reported"} tone="green"/>
   <Metric icon="harddrive" label="Disk used" value={formatPercent(system?.diskUsagePercent??null)} detail={system?"Current sample":"Not reported"} tone="purple"/>
   <Metric icon="clock" label="Uptime" value={formatDuration(system?.uptimeSeconds??null,system?.uptimeText??null)} detail={system?.uptimeText??"Not reported"} tone="green"/>
  </div>
  <div className="site-detail-grid">
   <Panel title="Firewall identity" action={<button className="text-button" onClick={live.refresh} disabled={live.loading}>{live.loading?"Refreshing…":"Refresh"}</button>}><dl className="detail-list"><div><dt>pfSense edition</dt><dd>{device.edition}</dd></div><div><dt>Installed release</dt><dd>{compatibility?.release??"Not reported"}</dd></div><div><dt>Reported platform</dt><dd>{compatibility?.platform??"Not reported"}</dd></div><div><dt>Compatibility</dt><dd>{compatibility?compatibility.verdict==="verified"?"Verified from this firewall":compatibility.verdict==="mismatch"?"Declared edition contradicts the firewall":"Not verified":device.release??"Not verified"}</dd></div><div><dt>REST API package</dt><dd>Not exposed by the eight approved endpoints</dd></div></dl></Panel>
   <Panel title="Read-only collection"><dl className="detail-list"><div><dt>Last collection</dt><dd>{snapshot?new Date(snapshot.collectedAt).toLocaleString():"Not collected"}</dd></div><div><dt>Outcome</dt><dd>{snapshot?snapshot.outcome:"Unknown"}</dd></div><div><dt>ARP entries</dt><dd>{formatNumber(snapshot?.stateSummary.arpEntries??null)}</dd></div><div><dt>Firewall states</dt><dd>{formatNumber(snapshot?.stateSummary.firewallStates??null)}</dd></div><div><dt>State table</dt><dd>{snapshot?.stateSummary.stateTableCurrent!=null&&snapshot?.stateSummary.stateTableLimit!=null?formatNumber(snapshot.stateSummary.stateTableCurrent)+" of "+formatNumber(snapshot.stateSummary.stateTableLimit):"Not reported"}</dd></div></dl><button className="secondary-button" onClick={()=>onNavigate("compatibility")}>View compatibility</button></Panel>
  </div>
  <p className="preview-footnote">Values are read directly from this firewall through the eight approved GET operations. No trend history is stored, and a metric the firewall does not report is shown as unknown rather than estimated.</p>
 </>;
}
function SitesPage({sites,query,setQuery,filter,setFilter,onOpen,onAdd}:{sites:Device[];query:string;setQuery:(v:string)=>void;filter:string;setFilter:(v:string)=>void;onOpen:(d:Device)=>void;onAdd:()=>void}){
 const columns=[{id:"name",header:"Site",sortable:true,value:(s:Device)=>s.name,accessor:(s:Device)=><strong>{s.name}</strong>},{id:"location",header:"Location",sortable:true,value:(s:Device)=>s.location??"",accessor:(s:Device)=>s.location??"Not specified"},{id:"edition",header:"Edition",sortable:true,value:(s:Device)=>s.edition,accessor:(s:Device)=>"pfSense "+s.edition+(s.release?" · "+s.release:"")},{id:"status",header:"Connection",sortable:true,value:(s:Device)=>s.state,accessor:(s:Device)=><Status state={s.state} label={s.state==="unknown"?"Not verified":s.state}/>},{id:"lastSeen",header:"Last check",sortable:true,value:(s:Device)=>s.lastSeen,accessor:(s:Device)=>s.lastSeen}];
 return <><div className="page-heading"><div><h1>Managed Sites</h1><p>Registered firewall locations and their verified manager status</p></div><button className="primary-button" onClick={onAdd}><Icon name="plus"/> Add Site</button></div>
 <ListToolbar search={query} onSearch={setQuery} placeholder="Search sites, locations or edition" filters activeCount={filter==="All"?0:1} onClear={()=>setFilter("All")} chips={filter==="All"?[]:[{label:"Status: "+filter,onRemove:()=>setFilter("All")}]}>
  <label>Connection status<select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option><option>Online</option><option>Offline</option><option>Unknown</option></select></label>
 </ListToolbar>
 <Panel title="Managed site inventory" action={<span className="subtle">{sites.length} sites</span>}>
  <DataTable rows={sites} columns={columns} getRowId={s=>s.id} searchableText={s=>[s.name,s.location??"",s.edition,s.lastSeen].join(" ")} search={query} emptyTitle="No registered firewalls" emptyDescription="Add a real pfSense firewall to begin building your managed-site inventory." pageSize={25} actions={s=><button type="button" className="site-open-button" onClick={()=>onOpen(s)} aria-label={`Open ${s.name}`} title="Open site"><Icon name="external" size={17}/><span>Open</span></button>} mobileCard={s=><><div className="ui-mobile-record-head"><div className="ui-mobile-record-title"><strong>{s.name}</strong><small>{s.location??"Location not specified"}</small></div><Status state={s.state} label={s.state==="unknown"?"Not verified":s.state}/></div><div className="ui-mobile-record-meta"><div><span>Edition</span><strong>pfSense {s.edition}</strong></div><div><span>Last check</span><strong>{s.lastSeen}</strong></div></div><div className="ui-mobile-record-actions"><button type="button" className="site-open-button" onClick={()=>onOpen(s)} aria-label={`Open ${s.name}`}><Icon name="external" size={17}/><span>Open site</span></button></div></>}/>
 </Panel></>;
}
function Connectivity({sites,onOpen,onRefresh}:{sites:Device[];onOpen:(site:Device)=>void;onRefresh:()=>void}){
 const reachable=sites.filter(site=>site.state==="online").length;
 const unreachable=sites.filter(site=>site.state==="offline").length;
 const unverified=sites.filter(site=>site.state==="unknown").length;
 const pollingPaused=sites.filter(site=>site.enabled===false).length;
 const columns=[
  {id:"site",header:"Firewall site",sortable:true,value:(site:Device)=>site.name,accessor:(site:Device)=><strong>{site.name}</strong>},
  {id:"reachability",header:"Reachability",sortable:true,value:(site:Device)=>site.state,accessor:(site:Device)=><Status state={site.state} label={site.state==="unknown"?"Not verified":site.state==="online"?"Reachable":"Unreachable"}/>},
  {id:"polling",header:"Manager polling",sortable:true,value:(site:Device)=>site.enabled===false?"Paused":"Enabled",accessor:(site:Device)=><Status state={site.enabled===false?"warning":"online"} label={site.enabled===false?"Paused":"Enabled"}/>},
  {id:"lastCheck",header:"Last connection check",sortable:true,value:(site:Device)=>site.lastSeen,accessor:(site:Device)=>site.lastSeen}
 ];
 return <><div className="page-heading"><div><h1>Connectivity</h1><p>Operational connection status and monitoring coverage across registered firewalls</p></div><button className="secondary-button" onClick={onRefresh}><Icon name="refresh" size={16}/> Refresh status</button></div>
 <div className="metric-grid"><Metric icon="wifi" label="Reachable" value={String(reachable)} detail="Last verified connection succeeded" tone="green"/><Metric icon="alert" label="Unreachable" value={String(unreachable)} detail="Last verified connection failed" tone="orange"/><Metric icon="clock" label="Not verified" value={String(unverified)} detail="No verified connection result" tone="blue"/><Metric icon="clock" label="Polling paused" value={String(pollingPaused)} detail="Manager polling is disabled" tone="blue"/></div>
 <Panel title="Connection monitoring" action={<span className="subtle">{sites.length} registered sites</span>}><DataTable rows={sites} columns={columns} getRowId={site=>site.id} pageSize={25} emptyTitle="No firewall connections to monitor" emptyDescription="Register a real pfSense firewall in Sites to see its connection status here." actions={site=><button className="secondary-button" onClick={()=>onOpen(site)}>Open monitoring</button>}/></Panel>
 <p className="preview-footnote">This view reports only data currently supplied by the Hub API: reachability, polling enabled state, and last connection check. Latency, TLS diagnostics, and failure streaks are not yet exposed and are not estimated.</p>
 </>;
}
type ApiUser={id:string;username:string;role:"admin"|"user";isActive:boolean;createdAt:string;updatedAt:string};
type ApiAlert={id:string;severity:"critical"|"warning"|"info";title:string;message:string;source:string;resourceType?:string;resourceId?:string;status:"active"|"acknowledged"|"resolved";firstSeenAt:string;lastSeenAt:string;occurrenceCount:number};
type AuditRecord={id:number;occurredAt:string;actorUsername:string|null;actorType:string;action:string;outcome:string;targetType:string|null;targetId:string|null;summary:string;requestId:string|null};
function UserManagement({currentUsername}:{currentUsername:string}){
 const {notify}=useToast();
 const [users,setUsers]=useState<ApiUser[]>([]);
 const [search,setSearch]=useState("");
 const [roleFilter,setRoleFilter]=useState("all");
 const [statusFilter,setStatusFilter]=useState("active");
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [createOpen,setCreateOpen]=useState(false);
 const [createSuccess,setCreateSuccess]=useState(false);
 const [username,setUsername]=useState("");
 const [password,setPassword]=useState("");
 const [role,setRole]=useState<"admin"|"user">("user");
 const [creating,setCreating]=useState(false);
 const [pendingStatusChange,setPendingStatusChange]=useState<ApiUser|null>(null);
 const [statusChanging,setStatusChanging]=useState(false);
 async function load(){
  setBusy(true);setError("");
  try{setUsers(await apiRequest<ApiUser[]>("/api/v1/users?search="+encodeURIComponent(search)));}
  catch(e){setError(e instanceof Error?e.message:"Unable to load users.");}
  finally{setBusy(false);}
 }
 useEffect(()=>{void load();},[search]);
 function openCreate(){setUsername("");setPassword("");setRole("user");setCreateSuccess(false);setCreateOpen(true);}
 function closeCreate(){if(creating)return;setCreateOpen(false);setCreateSuccess(false);}
 async function createUser(e:React.FormEvent){
  e.preventDefault();setCreating(true);setError("");
  try{
   await apiRequest("/api/v1/users",{method:"POST",body:JSON.stringify({username:username.trim(),password,role})});
   setCreateSuccess(true);setMessage("User created successfully.");notify("User created successfully.","success");await load();
  }catch(e){const message=e instanceof Error?e.message:"Unable to create user.";setError(message);notify(message,"error");}
  finally{setCreating(false);}
 }
 async function changeUser(user:ApiUser,patch:Partial<Pick<ApiUser,"role"|"isActive">>):Promise<boolean>{
  setError("");setMessage("");
  try{await apiRequest("/api/v1/users/"+user.id,{method:"PATCH",body:JSON.stringify(patch)});setMessage("User updated successfully. Existing sessions were revoked when access changed.");notify("User updated successfully. Existing sessions were revoked when access changed.","success");await load();return true;}
  catch(e){const message=e instanceof Error?e.message:"Unable to update user.";setError(message);notify(message,"error");return false;}
 }
 async function confirmStatusChange(){
  if(!pendingStatusChange)return;
  setStatusChanging(true);
  const user=pendingStatusChange;
  const updated=await changeUser(user,{isActive:!user.isActive});
  setStatusChanging(false);
  if(updated)setPendingStatusChange(null);
 }
 const isCurrentUser=(u:ApiUser)=>u.username.toLocaleLowerCase()===currentUsername.toLocaleLowerCase();
 const columns=[
  {id:"username",header:"Username",sortable:true,value:(u:ApiUser)=>u.username,accessor:(u:ApiUser)=><div className="user-name-cell"><strong>{u.username}</strong>{isCurrentUser(u)&&<span className="user-self-badge">You · Admin</span>}</div>},
  {id:"role",header:"Role",sortable:true,value:(u:ApiUser)=>u.role,accessor:(u:ApiUser)=><select className="ui-select ui-role-select" aria-label={"Role for "+u.username} value={u.role} disabled={isCurrentUser(u)} title={isCurrentUser(u)?"Your own administrator role is protected":undefined} onChange={e=>void changeUser(u,{role:e.target.value as "admin"|"user"})}><option value="admin">Admin</option><option value="user">User</option></select>},
  {id:"status",header:"Status",sortable:true,value:(u:ApiUser)=>u.isActive?"Active":"Disabled",accessor:(u:ApiUser)=><Status state={u.isActive?"online":"offline"} label={u.isActive?"Active":"Disabled"}/>},
  {id:"created",header:"Created",sortable:true,value:(u:ApiUser)=>new Date(u.createdAt),accessor:(u:ApiUser)=>new Date(u.createdAt).toLocaleDateString()}
 ];
 return <>
  <div className="page-heading"><div><h1>User Management</h1><p>Manage Hub accounts, roles, and account access</p></div><button className="primary-button" onClick={openCreate}><Icon name="plus"/> Add user</button></div>
  <ListToolbar search={search} onSearch={setSearch} placeholder="Search users by username or role" filters activeCount={(roleFilter==="all"?0:1)+(statusFilter==="all"?0:1)} onClear={()=>{setRoleFilter("all");setStatusFilter("active");}} chips={[...(roleFilter!=="all"?[{label:"Role: "+roleFilter,onRemove:()=>setRoleFilter("all")}]:[]),...(statusFilter!=="all"?[{label:"Status: "+(statusFilter==="active"?"Active":statusFilter==="disabled"?"Disabled":"All"),onRemove:()=>setStatusFilter("all")}]:[])]} actions={<button className="secondary-button" onClick={()=>void load()}>Refresh</button>}>
   <label>Role<select className="ui-select" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">All roles</option><option value="admin">Administrator</option><option value="user">User</option></select></label>
   <label>Account status<select className="ui-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
  </ListToolbar>
  {error&&<div className="settings-message error" role="alert">{error}</div>}
    {message&&<div className="settings-message" role="status">{message}</div>}
  <Panel title="Application users" action={<span className="subtle">{users.length} users</span>}>
   <DataTable rows={users.filter(u=>(roleFilter==="all"||u.role===roleFilter)&&(statusFilter==="all"||(statusFilter==="active"?u.isActive:!u.isActive)))} columns={columns} getRowId={u=>u.id} searchableText={u=>u.username+" "+u.role+" "+(u.isActive?"active":"disabled")} search={search} loading={busy} error="" emptyTitle="No users found" emptyDescription="Create a user or adjust the search." pageSize={25} actions={u=>isCurrentUser(u)?<span className="user-protected-label" title="Your own administrator account cannot be changed here">Protected</span>:<button type="button" role="switch" aria-checked={u.isActive} aria-label={(u.isActive?"Disable ":"Enable ")+u.username} className={"switch user-status-toggle "+(u.isActive?"on":"")} onClick={()=>setPendingStatusChange(u)}><i/></button>} mobileCard={u=><><div className="ui-mobile-record-head"><div className="ui-mobile-record-title"><strong>{u.username}</strong>{isCurrentUser(u)&&<span className="user-self-badge">You · Admin</span>}<small>Created {new Date(u.createdAt).toLocaleDateString()}</small></div><Status state={u.isActive?"online":"offline"} label={u.isActive?"Active":"Disabled"}/></div><div className="ui-mobile-record-meta"><div><span>Role</span><strong>{u.role==="admin"?"Administrator":"User"}</strong></div><div><span>Access</span><strong>{u.isActive?"Enabled":"Disabled"}</strong></div></div><div className="ui-mobile-record-actions user-mobile-actions"><label className="ui-mobile-role-field"><span>Change role</span><select className="ui-select ui-role-select" aria-label={"Role for "+u.username} value={u.role} disabled={isCurrentUser(u)} title={isCurrentUser(u)?"Your own administrator role is protected":undefined} onChange={e=>void changeUser(u,{role:e.target.value as "admin"|"user"})}><option value="admin">Admin</option><option value="user">User</option></select></label><div className="ui-user-toggle-wrap">{isCurrentUser(u)?<span className="user-protected-label">Protected</span>:<button type="button" role="switch" aria-checked={u.isActive} aria-label={(u.isActive?"Disable ":"Enable ")+u.username} title={u.isActive?"Disable account":"Enable account"} className={"user-status-toggle "+(u.isActive?"on":"")} onClick={()=>setPendingStatusChange(u)}><i/></button>}</div></div></>}/>
  </Panel>
  <p className="preview-footnote">Only administrators can manage accounts. Passwords are never returned by the API. Changing role or status revokes existing sessions.</p>
  {pendingStatusChange&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!statusChanging)setPendingStatusChange(null);}}>
   <section className="modal user-status-modal" role="dialog" aria-modal="true" aria-labelledby="user-status-title">
    <span className="eyebrow">USER ACCESS</span>
    <h2 id="user-status-title">{pendingStatusChange.isActive?"Disable user?":"Enable user?"}</h2>
    <p>{pendingStatusChange.isActive?<>Disabling <strong>{pendingStatusChange.username}</strong> will prevent the account from signing in. Its existing sessions will be revoked.</>:<>Enabling <strong>{pendingStatusChange.username}</strong> will restore the account's ability to sign in.</>}</p>
    {error&&<div className="settings-message error" role="alert">{error}</div>}
    <div className="modal-actions">
     <button type="button" className="secondary-button" disabled={statusChanging} onClick={()=>setPendingStatusChange(null)}>Cancel</button>
     <button type="button" className="primary-button" disabled={statusChanging} onClick={()=>void confirmStatusChange()}>{statusChanging?"Saving…":pendingStatusChange.isActive?"Disable user":"Enable user"}</button>
    </div>
   </section>
  </div>}
  {createOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeCreate();}}>
   <section className="modal user-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
    {!createSuccess&&<button className="modal-close" aria-label="Close dialog" onClick={closeCreate}><Icon name="close"/></button>}
    {createSuccess?<div className="modal-result" role="status"><span className="modal-result-icon"><Icon name="check" size={24}/></span><span className="eyebrow">USER MANAGEMENT</span><h2 id="create-user-title">User created</h2><p>The account <strong>{username.trim()}</strong> was created successfully with the <strong>{role}</strong> role.</p><button className="primary-button full-width" onClick={()=>{setCreateOpen(false);setCreateSuccess(false);}}>Done</button></div>:<>
     <span className="eyebrow">USER MANAGEMENT</span><h2 id="create-user-title">Add user</h2><p>Create an account and assign its initial access role. The user can sign in after creation.</p>
     <form className="user-create-form" onSubmit={createUser}>
      <label>Username<input required minLength={3} maxLength={64} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="off" placeholder="Enter username"/></label>
      <label>Temporary password<input required type="password" minLength={14} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 14 characters"/><small>Use at least 14 characters. Share it securely with the new user.</small></label>
      <label>Role<select className="ui-select" value={role} onChange={e=>setRole(e.target.value as "admin"|"user")}><option value="user">User</option><option value="admin">Admin</option></select></label>
      {error&&<div className="settings-message error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeCreate} disabled={creating}>Cancel</button><button className="primary-button" disabled={creating}>{creating?"Creating…":"Create user"}</button></div>
     </form>
    </>}
   </section>
  </div>}
 </>;
}
function AuditLog(){const {notify}=useToast();const [records,setRecords]=useState<AuditRecord[]>([]);const [search,setSearch]=useState("");const [outcome,setOutcome]=useState("all");const [busy,setBusy]=useState(true);const [error,setError]=useState("");async function load(){setBusy(true);setError("");try{setRecords(await apiRequest<AuditRecord[]>("/api/v1/audit?limit=200&search="+encodeURIComponent(search)));}catch(e){const message=e instanceof Error?e.message:"Unable to load audit events.";setError(message);notify(message,"error");}finally{setBusy(false);}}useEffect(()=>{void load();},[search]);const columns=[{id:"time",header:"Time (UTC)",sortable:true,value:(r:AuditRecord)=>new Date(r.occurredAt),accessor:(r:AuditRecord)=>new Date(r.occurredAt).toLocaleString(undefined,{timeZone:"UTC"})},{id:"event",header:"Event",sortable:true,value:(r:AuditRecord)=>r.action,accessor:(r:AuditRecord)=><strong>{r.action}</strong>},{id:"actor",header:"Actor",sortable:true,value:(r:AuditRecord)=>r.actorUsername??r.actorType,accessor:(r:AuditRecord)=>r.actorUsername??r.actorType},{id:"target",header:"Target",value:(r:AuditRecord)=>r.targetType??"",accessor:(r:AuditRecord)=>r.targetType?r.targetType+(r.targetId?" · "+r.targetId.slice(0,8):""):"—"},{id:"outcome",header:"Outcome",sortable:true,value:(r:AuditRecord)=>r.outcome,accessor:(r:AuditRecord)=><Status state={r.outcome==="success"?"online":r.outcome==="denied"?"offline":"warning"} label={r.outcome}/>},{id:"summary",header:"Summary",accessor:(r:AuditRecord)=>r.summary}];return <><div className="page-heading"><div><h1>Audit Logs</h1><p>Append-only record of authentication and administrative activity</p></div><button className="secondary-button" onClick={()=>void load()}>Refresh</button></div><ListToolbar search={search} onSearch={setSearch} placeholder="Search actor, event or summary" filters activeCount={outcome==="all"?0:1} onClear={()=>setOutcome("all")} chips={outcome==="all"?[]:[{label:"Outcome: "+outcome,onRemove:()=>setOutcome("all")}]}><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="all">All outcomes</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option></select></label></ListToolbar>{error&&<div className="settings-message error" role="alert">{error}</div>}<Panel title="Recent events" action={<span className="subtle">{records.length} events</span>}><DataTable rows={records.filter(r=>outcome==="all"||r.outcome===outcome)} columns={columns} getRowId={r=>r.id} searchableText={r=>[r.actorUsername??r.actorType,r.action,r.summary,r.outcome,r.targetType??""].join(" ")} search={search} loading={busy} emptyTitle="No audit events recorded" emptyDescription="Events will appear here as users authenticate and perform administrative actions." pageSize={25} mobileCard={r=><><div className="ui-mobile-record-head"><div className="ui-mobile-record-title"><strong>{r.action}</strong><small>{new Date(r.occurredAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})} (UTC)</small></div><Status state={r.outcome==="success"?"online":r.outcome==="denied"?"offline":"warning"} label={r.outcome}/></div><div className="ui-mobile-record-meta"><div><span>Actor</span><strong>{r.actorUsername??r.actorType}</strong></div><div><span>Target</span><strong>{r.targetType?r.targetType+(r.targetId?" · "+r.targetId.slice(0,8):""):"—"}</strong></div></div><div className="ui-audit-mobile-summary">{r.summary}</div></>}/></Panel><p className="preview-footnote">Audit events are append-only. This screen provides no edit or delete controls.</p></>}
function Alerts({onNavigate}:{onNavigate:(p:Page)=>void}){
 const {notify}=useToast();
 const [alerts,setAlerts]=useState<ApiAlert[]>([]);
 const [status,setStatus]=useState<"active"|"acknowledged"|"resolved"|"all">("active");
 const [severity,setSeverity]=useState("all");
 const [search,setSearch]=useState("");
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState<string[]>([]);
 const [pendingBulkAction,setPendingBulkAction]=useState<"acknowledge"|"resolve"|null>(null);
 const [bulkBusy,setBulkBusy]=useState(false);
 async function load(){setBusy(true);setError("");try{const params=new URLSearchParams({status});if(severity!=="all")params.set("severity",severity);setAlerts(await apiRequest<ApiAlert[]>("/api/v1/alerts?"+params));}catch(e){setError(e instanceof Error?e.message:"Unable to load alerts.");}finally{setBusy(false);}}
 useEffect(()=>{void load();},[status,severity]);
 useEffect(()=>{setSelected([]);},[status,severity,search]);
 const matchingAlerts=alerts.filter(a=>[a.title,a.message,a.source,a.severity,a.status].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const selectedAlerts=alerts.filter(a=>selected.includes(a.id));
 const selectableAlerts=matchingAlerts.filter(a=>a.status!=="resolved");
 const selectedPending=selectedAlerts.filter(a=>a.status!=="resolved");
 const selectedActive=selectedAlerts.filter(a=>a.status==="active");
 function toggleSelected(id:string){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);}
 function selectAllMatching(){setSelected(current=>Array.from(new Set([...current,...selectableAlerts.map(a=>a.id)])));}
 async function act(id:string,action:"acknowledge"|"resolve"){setError("");try{await apiRequest("/api/v1/alerts/"+id+"/"+action,{method:"POST"});setSelected(current=>current.filter(item=>item!==id));notify(action==="acknowledge"?"Alert acknowledged.":"Alert resolved.","success");await load();}catch(e){const message=e instanceof Error?e.message:"Unable to update alert.";setError(message);notify(message,"error");}}
 async function confirmBulkAction(){
  if(!pendingBulkAction)return;
  const action=pendingBulkAction;
  const targets=action==="acknowledge"?selectedActive:selectedPending;
  if(!targets.length){setPendingBulkAction(null);return;}
  setBulkBusy(true);setError("");
  let succeeded=0;
  const failures:string[]=[];
  for(const alert of targets){
   try{await apiRequest("/api/v1/alerts/"+alert.id+"/"+action,{method:"POST"});succeeded++;}
   catch(error){failures.push(error instanceof Error?error.message:"Unknown request failure");}
  }
  setSelected([]);setPendingBulkAction(null);setBulkBusy(false);
  await load();
  const failed=targets.length-succeeded;
  if(failed){
   const reason=Array.from(new Set(failures)).slice(0,2).join(" | ");
   const message=`${succeeded} alert(s) updated, ${failed} failed. Reason: ${reason}`;
   setError("");
   notify(message,"error");
  }else{
   notify(`${succeeded} alert(s) ${action==="acknowledge"?"acknowledged":"resolved"}.`,"success");
  }
 }
 const formatAlertTime=(value:string)=><time className="alert-time" dateTime={value}><span>{new Date(value).toLocaleDateString()}</span><small>{new Date(value).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</small></time>;
 const columns=[
  {id:"severity",header:"Severity",sortable:true,className:"alert-col-severity",value:(a:ApiAlert)=>a.severity,accessor:(a:ApiAlert)=><Status state={a.severity==="critical"?"offline":a.severity==="warning"?"warning":"online"} label={a.severity}/>},
  {id:"title",header:"Alert",sortable:true,className:"alert-col-title",value:(a:ApiAlert)=>a.title,accessor:(a:ApiAlert)=><div className="alert-cell"><strong>{a.title}</strong><small>{a.message}</small></div>},
  {id:"source",header:"Source",sortable:true,className:"alert-col-source",value:(a:ApiAlert)=>a.source,accessor:(a:ApiAlert)=><span className="alert-source">{a.source}</span>},
  {id:"firstSeen",header:"First seen",sortable:true,className:"alert-col-time",value:(a:ApiAlert)=>new Date(a.firstSeenAt),accessor:(a:ApiAlert)=>formatAlertTime(a.firstSeenAt)},
  {id:"lastSeen",header:"Last seen",sortable:true,className:"alert-col-time",value:(a:ApiAlert)=>new Date(a.lastSeenAt),accessor:(a:ApiAlert)=>formatAlertTime(a.lastSeenAt)},
  {id:"count",header:"Count",sortable:true,className:"alert-col-count",value:(a:ApiAlert)=>a.occurrenceCount,accessor:(a:ApiAlert)=><span className="alert-count">{a.occurrenceCount}</span>},
  {id:"status",header:"State",sortable:true,className:"alert-col-state",value:(a:ApiAlert)=>a.status,accessor:(a:ApiAlert)=><span className={"alert-state alert-state-"+a.status}>{a.status}</span>}
 ];
 return <>
  <div className="page-heading"><div><h1>Alerts</h1><p>Operational events that may require attention</p></div><button className="secondary-button" onClick={()=>onNavigate("audit")}>View audit log</button></div>
  <ListToolbar search={search} onSearch={setSearch} placeholder="Search alerts, sources or messages" filters activeCount={(status==="active"?0:1)+(severity==="all"?0:1)} onClear={()=>{setStatus("active");setSeverity("all");}} chips={[...(status!=="active"?[{label:"State: "+status,onRemove:()=>setStatus("active" as typeof status)}]:[]),...(severity!=="all"?[{label:"Severity: "+severity,onRemove:()=>setSeverity("all")}]:[])]}>
   <label>State<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="active">Active</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="all">All states</option></select></label>
   <label>Severity<select value={severity} onChange={e=>setSeverity(e.target.value)}><option value="all">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select></label>
  </ListToolbar>
  {error&&<div className="settings-message error" role="alert">{error}</div>}
  <div className="ui-bulk-actions" role="group" aria-label="Bulk alert actions"><label className="ui-select-all"><input type="checkbox" checked={selectableAlerts.length>0&&selectableAlerts.every(a=>selected.includes(a.id))} ref={element=>{if(element)element.indeterminate=selected.length>0&&!selectableAlerts.every(a=>selected.includes(a.id));}} onChange={e=>e.target.checked?selectAllMatching():setSelected([])} disabled={!selectableAlerts.length||busy}/><span>Select all</span></label><strong>{selected.length} selected</strong><div className="ui-bulk-action-buttons"><button type="button" className="secondary-button" disabled={!selectedActive.length||bulkBusy} onClick={()=>setPendingBulkAction("acknowledge")}>Acknowledge</button><button type="button" className="primary-button" disabled={!selectedPending.length||bulkBusy} onClick={()=>setPendingBulkAction("resolve")}>Resolve</button><button type="button" className="secondary-button" disabled={!selected.length||bulkBusy} onClick={()=>setSelected([])}>Clear</button></div></div>
  <Panel title="Alert history" action={<button className="secondary-button" onClick={()=>void load()}>Refresh</button>}>
   <DataTable className="alerts-table" rows={alerts} columns={columns} getRowId={a=>a.id} searchableText={a=>[a.title,a.message,a.source,a.severity,a.status].join(" ")} search={search} loading={busy} emptyTitle="No alerts in this view" emptyDescription="New operational alerts will appear here, or adjust your filters." pageSize={25} selectionHeader={<span className="sr-only">Select record</span>} selection={a=><input className="ui-mobile-record-select" type="checkbox" aria-label={"Select "+a.title} checked={selected.includes(a.id)} onChange={()=>toggleSelected(a.id)} disabled={a.status==="resolved"}/>} actions={a=><div className="ui-desktop-alert-actions">{a.status!=="resolved"&&<><button className="secondary-button" onClick={()=>void act(a.id,"acknowledge")} disabled={a.status==="acknowledged"}>Acknowledge</button><button className="secondary-button" onClick={()=>void act(a.id,"resolve")}>Resolve</button></>}</div>} mobileCard={a=><><div className="ui-mobile-record-head"><label className="ui-mobile-record-check"><input className="ui-mobile-record-select" type="checkbox" checked={selected.includes(a.id)} onChange={()=>toggleSelected(a.id)} disabled={a.status==="resolved"} aria-label={"Select "+a.title}/><span>Select</span></label><Status state={a.severity==="critical"?"offline":a.severity==="warning"?"warning":"online"} label={a.severity}/></div><div className="ui-mobile-record-title" style={{marginTop:9}}><strong>{a.title}</strong><small>{a.message}</small></div><div className="ui-mobile-record-meta"><div><span>State</span><strong>{a.status}</strong></div><div><span>Source</span><strong>{a.source}</strong></div><div><span>First seen</span><strong>{formatAlertTime(a.firstSeenAt)}</strong></div><div><span>Last seen</span><strong>{formatAlertTime(a.lastSeenAt)}</strong></div><div><span>Occurrences</span><strong>{a.occurrenceCount}</strong></div></div><div className="ui-mobile-record-actions">{a.status!=="resolved"&&<>{a.status==="active"&&<button className="secondary-button" onClick={()=>void act(a.id,"acknowledge")}>Acknowledge</button>}<button className="primary-button" onClick={()=>void act(a.id,"resolve")}>Resolve</button></>}</div></>}/>
  </Panel>
  <p className="preview-footnote">Alert history is retained after resolution. Acknowledgement and resolution are audited. Bulk actions are applied individually and each result is audited.</p>
  {pendingBulkAction&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!bulkBusy)setPendingBulkAction(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-alert-title"><span className="eyebrow">ALERT MANAGEMENT</span><h2 id="bulk-alert-title">Confirm bulk {pendingBulkAction}?</h2><p>This will {pendingBulkAction} {pendingBulkAction==="acknowledge"?selectedActive.length:selectedPending.length} selected alert(s). Each alert will be updated separately and recorded in the audit log.</p><div className="modal-actions"><button type="button" className="secondary-button" disabled={bulkBusy} onClick={()=>setPendingBulkAction(null)}>Cancel</button><button type="button" className="primary-button" disabled={bulkBusy} onClick={()=>void confirmBulkAction()}>{bulkBusy?"Applying…":pendingBulkAction==="acknowledge"?"Acknowledge alerts":"Resolve alerts"}</button></div></section></div>}
 </>;
}
function SiteSettings({device,onEdit,onArchive,onToggleEnabled,onSecurity}:{device:Device|null;onEdit:()=>void;onArchive:()=>void;onToggleEnabled:()=>void;onSecurity:()=>void}){return <><div className="page-heading"><div><h1>Site Settings</h1><p>Connection profile and local site preferences</p></div></div><Panel title="Device profile"><dl className="detail-list"><div><dt>Site name</dt><dd>{device?.name}</dd></div><div><dt>Edition</dt><dd>pfSense {device?.edition}</dd></div><div><dt>Connection address</dt><dd>{device?.address}</dd></div><div><dt>Connection state</dt><dd>{device?.state}</dd></div><div><dt>Manager polling</dt><dd>{device?.enabled===false?"Disabled":"Enabled"}</dd></div></dl><div className="modal-actions"><button className="secondary-button" onClick={onEdit} disabled={!device||device.isDemo}>Edit profile</button><button className="secondary-button" onClick={onToggleEnabled} disabled={!device||device.isDemo}>{device?.enabled===false?"Enable site":"Disable site"}</button><button className="secondary-button" onClick={onSecurity} disabled={!device||device.isDemo}>Credentials & TLS</button><button className="secondary-button danger-button" onClick={onArchive} disabled={!device||device.isDemo}>Archive site</button></div></Panel></>}
function Monitoring({device}:{device:Device|null}){
 const live=useSiteSnapshot(device?.id??null,Boolean(device)&&!device?.isDemo&&device?.enabled!==false);
 const snapshot=live.snapshot;
 const system=snapshot?.system??null;
 return <><div className="page-heading"><div><h1>Monitoring</h1><p>Current read-only system health reported by this firewall</p></div><button className="secondary-button" onClick={live.refresh} disabled={!device||device.isDemo||live.loading}>{live.loading?"Refreshing…":"Refresh sample"}</button></div>
  {device?.enabled===false&&<Feedback tone="warning">Polling is disabled for this site. Enable it in Site Settings before requesting telemetry.</Feedback>}
  {device?.isDemo&&<Feedback tone="warning">Demo records are not connected to a firewall, so no monitoring data exists for them.</Feedback>}
  {live.error&&<Feedback tone="error">{live.error}</Feedback>}
  {!live.error&&live.loading&&!snapshot&&<Feedback tone="info">Reading the firewall through the approved read-only API…</Feedback>}
  <div className="metric-grid">
   <Metric icon="cpu" label="CPU usage" value={formatPercent(system?.cpuUsagePercent??null)} detail={system?.cpuCount?system.cpuCount+" logical CPUs":"Current sample"} tone="blue"/>
   <Metric icon="database" label="Memory used" value={formatPercent(system?.memoryUsagePercent??null)} detail="Current sample" tone="green"/>
   <Metric icon="harddrive" label="Disk used" value={formatPercent(system?.diskUsagePercent??null)} detail="Current sample" tone="purple"/>
   <Metric icon="clock" label="Uptime" value={formatDuration(system?.uptimeSeconds??null,system?.uptimeText??null)} detail={system?.uptimeText??"Not reported"} tone="green"/>
  </div>
  <Panel title="System sample" action={<span className="subtle">{snapshot?"Collected "+new Date(snapshot.collectedAt).toLocaleTimeString():"Not collected"}</span>}>
   <dl className="detail-list"><div><dt>Platform</dt><dd>{system?.platform??"Not reported"}</dd></div><div><dt>CPU load average (1 / 5 / 15 min)</dt><dd>{system?.loadAverage?system.loadAverage.join(" / "):"Not reported"}</dd></div><div><dt>Memory used</dt><dd>{formatPercent(system?.memoryUsagePercent??null)}</dd></div><div><dt>Swap used</dt><dd>{formatPercent(system?.swapUsagePercent??null)}</dd></div><div><dt>Disk used</dt><dd>{formatPercent(system?.diskUsagePercent??null)}</dd></div></dl>
  </Panel>
  <Panel title="Collection results"><div className="capability-list">{snapshot?snapshot.capabilities.map(item=><div key={item.key}><span>{item.label}</span><Status state={item.verification==="verified"?"online":item.verification==="failed"?"offline":"warning"} label={item.verification==="verified"?"Verified":item.verification==="failed"?"Failed"+(item.errorClass?": "+item.errorClass:""):"No history"}/></div>):<div><span>No collection has run for this site yet</span><Status state="warning" label="Unverified"/></div>}</div></Panel>
  <p className="preview-footnote">The API returns a point-in-time sample; no CPU or memory history is stored, so there is no trend line to show. A value the firewall omits is displayed as unknown. Utilization alerts have no approved thresholds and are not generated.</p>
 </>;
}
function Compatibility({device}:{device:Device|null}){
 const live=useSiteSnapshot(device?.id??null,Boolean(device)&&!device?.isDemo);
 const packageVersion=useTelemetryRead("restapi-version",device?.id??null,Boolean(device)&&!device?.isDemo&&device?.enabled!==false);
 const restApi=packageVersion.data?.items[0]??null;
 const snapshot=live.snapshot;
 const compatibility=snapshot?.compatibility??null;
 const capabilities=snapshot?.capabilities??[];
 const verdictLabel=compatibility?compatibility.verdict==="verified"?"Verified":compatibility.verdict==="mismatch"?"Edition mismatch":"Not verified":"Not verified";
 return <><div className="page-heading"><div><h1>Compatibility</h1><p>Firewall release, platform, and per-endpoint capability evidence</p></div><button className="secondary-button" onClick={()=>{live.refresh();packageVersion.refresh();}} disabled={!device||device.isDemo||live.loading||packageVersion.loading}>{live.loading||packageVersion.loading?"Checking…":"Check again"}</button></div>
  {device?.isDemo&&<Feedback tone="warning">Demo records have no firewall evidence. Register a real firewall to inspect compatibility.</Feedback>}
  {live.error&&<Feedback tone="error">{live.error}</Feedback>}
  {packageVersion.error&&<Feedback tone={readTone(packageVersion.errorCode)}>{packageVersion.error}</Feedback>}
  {compatibility?.verdict==="mismatch"&&<Feedback tone="error">The site profile declares pfSense {compatibility.declaredEdition.toUpperCase()}, but this firewall reports {compatibility.reportedEdition?.toUpperCase()??"another edition"} ({compatibility.release??"release unknown"}). Correct the profile in Site Settings; the manager does not change firewall configuration.</Feedback>}
  <Panel title="Device compatibility"><dl className="detail-list"><div><dt>Device</dt><dd>{device?.name??"Selected site"}</dd></div><div><dt>Declared edition</dt><dd>pfSense {compatibility?compatibility.declaredEdition.toUpperCase():device?.edition??"Unknown"}</dd></div><div><dt>Reported edition</dt><dd>{compatibility?.reportedEdition?"pfSense "+compatibility.reportedEdition.toUpperCase():"Not conclusive"}</dd></div><div><dt>Installed release</dt><dd>{compatibility?.release??"Not reported"}</dd></div><div><dt>Reported platform</dt><dd>{compatibility?.platform??"Not reported"}</dd></div><div><dt>REST API package version</dt><dd>{restApi?.currentVersion??"Not reported"}{restApi?.updateAvailable&&restApi.latestVersion?" (update "+restApi.latestVersion+" available)":""}</dd></div><div><dt>CPU architecture</dt><dd>Not exposed by any approved endpoint</dd></div><div><dt>Verdict</dt><dd>{verdictLabel}</dd></div><div><dt>Last checked</dt><dd>{compatibility?.checkedAt?new Date(compatibility.checkedAt).toLocaleString():"Not checked"}</dd></div></dl></Panel>
  <Panel title="Capability status" action={<span className="subtle">{capabilities.filter(item=>item.verification==="verified").length} of 8 verified</span>}><div className="capability-list">{capabilities.length===0?<div><span>No device-derived capability evidence yet</span><Status state="warning" label="Unverified"/></div>:capabilities.map(item=><div key={item.key}><span>{item.label} <code>{item.endpoint}</code></span><Status state={item.verification==="verified"?"online":item.verification==="failed"?"offline":"warning"} label={item.verification==="verified"?"Supported":item.verification==="failed"?"Failed"+(item.errorClass?": "+item.errorClass:""):"Unverified"}/></div>)}</div></Panel>
  <p className="preview-footnote">Capability state comes from this device's own recorded poll outcomes, not from the upstream OpenAPI inventory. A transport, TLS, or schema failure is reported as failed with an unknown capability rather than as unsupported, and no endpoint is enabled by appearing in the specification. The REST API package version is a separate on-demand read of <code>/api/v2/system/restapi/version</code>; it is reported as unknown if that read fails, and the notice above names what to check.</p>
 </>;
}
type InterfaceRow=InterfaceView&{key:string};
type GatewayRow=GatewayView&{key:string};
type ServiceRow=ServiceView&{key:string};
function InterfacesLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const live=useSiteSnapshot(device.id,device.enabled!==false);
 const rows:InterfaceRow[]=(live.snapshot?.interfaces??[]).map((row,index)=>({...row,key:String(index)}));
 const config=useConfigurationRead("interfaces",device.id,device.enabled!==false);
 const configRows=withReadKeys<InterfaceConfigView>(config.data?.items??[]);
 const configColumns=[{id:"name",header:"Interface",sortable:true,value:(row:InterfaceConfigView&{key:string})=>row.name??"",accessor:(row:InterfaceConfigView&{key:string})=><strong>{row.name??"—"}</strong>},{id:"description",header:"Description",sortable:true,value:(row:InterfaceConfigView&{key:string})=>row.description??"",accessor:(row:InterfaceConfigView&{key:string})=>row.description??"—"},{id:"ipv4Type",header:"IPv4 type",sortable:true,value:(row:InterfaceConfigView&{key:string})=>row.ipv4Type??"",accessor:(row:InterfaceConfigView&{key:string})=>row.ipv4Type??"—"},{id:"ipv4",header:"IPv4 address",value:(row:InterfaceConfigView&{key:string})=>row.ipv4Address??"",accessor:(row:InterfaceConfigView&{key:string})=>row.ipv4Address?<code>{row.ipv4Address+(row.ipv4Subnet!==null?"/"+row.ipv4Subnet:"")}</code>:"—"},{id:"ipv6Type",header:"IPv6 type",value:(row:InterfaceConfigView&{key:string})=>row.ipv6Type??"",accessor:(row:InterfaceConfigView&{key:string})=>row.ipv6Type??"—"},{id:"ipv6",header:"IPv6 address",value:(row:InterfaceConfigView&{key:string})=>row.ipv6Address??"",accessor:(row:InterfaceConfigView&{key:string})=>row.ipv6Address?<code>{row.ipv6Address}</code>:"—"},{id:"mtu",header:"MTU",sortable:true,value:(row:InterfaceConfigView&{key:string})=>row.mtu??0,accessor:(row:InterfaceConfigView&{key:string})=>row.mtu===null?"—":String(row.mtu)},{id:"enabled",header:"Configured",value:(row:InterfaceConfigView&{key:string})=>row.enabled===null?"":row.enabled?"enabled":"disabled",accessor:(row:InterfaceConfigView&{key:string})=><Status state={row.enabled===null?"unknown":row.enabled?"online":"unknown"} label={row.enabled===null?"Unknown":row.enabled?"Enabled":"Disabled"}/>}];
 const columns=[{id:"name",header:"Interface",sortable:true,value:(row:InterfaceRow)=>row.name??"",accessor:(row:InterfaceRow)=><strong>{row.name??"—"}</strong>},{id:"description",header:"Description",sortable:true,value:(row:InterfaceRow)=>row.description??"",accessor:(row:InterfaceRow)=>row.description??"—"},{id:"address",header:"IPv4 address",sortable:true,value:(row:InterfaceRow)=>row.ipv4??"",accessor:(row:InterfaceRow)=>row.ipv4?(row.ipv4+(row.subnet?"/"+row.subnet:"")):"—"},{id:"ipv6",header:"IPv6 address",value:(row:InterfaceRow)=>row.ipv6??"",accessor:(row:InterfaceRow)=>row.ipv6??"—"},{id:"mtu",header:"MTU",sortable:true,value:(row:InterfaceRow)=>row.mtu??0,accessor:(row:InterfaceRow)=>row.mtu===null?"—":String(row.mtu)},{id:"status",header:"Link",sortable:true,value:(row:InterfaceRow)=>row.status??"",accessor:(row:InterfaceRow)=><Status state={row.enabled===false?"unknown":row.status?.toLowerCase()==="up"?"online":"offline"} label={row.enabled===false?"Disabled":row.status??"Unknown"}/>}];
 return <><div className="page-heading"><div><h1>Interfaces</h1><p>Interface addressing and link state reported by this firewall</p></div><button className="secondary-button" onClick={()=>{live.refresh();config.refresh();}} disabled={live.loading||config.loading}>{live.loading||config.loading?"Refreshing…":"Refresh"}</button></div>
  {live.error&&<Feedback tone="error">{live.error}</Feedback>}
  <ReadNotices states={[config]} device={device} what="this site's interface configuration"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search interfaces"/>
  <Panel title="Interfaces" action={<span className="subtle">{rows.length} reported</span>}><DataTable rows={rows} columns={columns} getRowId={row=>row.key} searchableText={row=>[row.name??"",row.description??"",row.ipv4??"",row.ipv6??"",row.status??""].join(" ")} search={query} loading={live.loading} emptyTitle="No interfaces reported" emptyDescription="The firewall did not return interface records in this collection." pageSize={25}/></Panel>
  <ReadPanel title="Interface configuration" state={config} rows={configRows} columns={configColumns} search={query} searchableText={row=>[row.name??"",row.description??"",row.ipv4Address??"",row.ipv6Address??"",row.ipv4Type??""].join(" ")} emptyTitle="No interface configuration reported" emptyDescription="This firewall returned no interface configuration records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Interface MAC addresses, hardware driver names, DHCP advanced options, and packet or byte counters are deliberately excluded. Link state comes from the health sample; the configuration table is a separate on-demand read.</p>
 </>;
}
function GatewaysLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const live=useSiteSnapshot(device.id,device.enabled!==false);
 const rows:GatewayRow[]=(live.snapshot?.gateways??[]).map((row,index)=>({...row,key:String(index)}));
 const columns=[{id:"name",header:"Gateway",sortable:true,value:(row:GatewayRow)=>row.name??"",accessor:(row:GatewayRow)=><strong>{row.name??"—"}</strong>},{id:"status",header:"Status",sortable:true,value:(row:GatewayRow)=>row.status??"",accessor:(row:GatewayRow)=><Status state={row.status==="online"?"online":row.status?"offline":"unknown"} label={row.status??"Unknown"}/>},{id:"delay",header:"Latency",sortable:true,value:(row:GatewayRow)=>row.delayMs??0,accessor:(row:GatewayRow)=>row.delayMs===null?"—":row.delayMs+" ms"},{id:"loss",header:"Packet loss",sortable:true,value:(row:GatewayRow)=>row.lossPercent??0,accessor:(row:GatewayRow)=>row.lossPercent===null?"—":row.lossPercent+"%"},{id:"substatus",header:"Substatus",value:(row:GatewayRow)=>row.substatus??"",accessor:(row:GatewayRow)=>row.substatus??"—"}];
 return <><div className="page-heading"><div><h1>Gateways</h1><p>Gateway monitoring state reported by this firewall</p></div><button className="secondary-button" onClick={live.refresh} disabled={live.loading}>{live.loading?"Refreshing…":"Refresh"}</button></div>
  {live.error&&<Feedback tone="error">{live.error}</Feedback>}
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search gateways"/>
  <Panel title="Gateways" action={<span className="subtle">{rows.length} reported</span>}><DataTable rows={rows} columns={columns} getRowId={row=>row.key} searchableText={row=>[row.name??"",row.status??"",row.substatus??""].join(" ")} search={query} loading={live.loading} emptyTitle="No gateways reported" emptyDescription="The firewall did not return gateway status records in this collection." pageSize={25}/></Panel>
  <p className="preview-footnote">Monitor and source IP addresses are excluded. Latency and loss are the values the firewall recorded for its own probes; the manager does not run its own probes or keep history.</p>
 </>;
}
function ServicesLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const live=useSiteSnapshot(device.id,device.enabled!==false);
 const rows:ServiceRow[]=(live.snapshot?.services??[]).map((row,index)=>({...row,key:String(index)}));
 const columns=[{id:"name",header:"Service",sortable:true,value:(row:ServiceRow)=>row.name??"",accessor:(row:ServiceRow)=><strong>{row.name??"—"}</strong>},{id:"description",header:"Description",sortable:true,value:(row:ServiceRow)=>row.description??"",accessor:(row:ServiceRow)=>row.description??"—"},{id:"enabled",header:"Enabled",sortable:true,value:(row:ServiceRow)=>row.enabled===null?"":String(row.enabled),accessor:(row:ServiceRow)=>row.enabled===null?"—":row.enabled?"Yes":"No"},{id:"running",header:"State",sortable:true,value:(row:ServiceRow)=>row.running===null?"":String(row.running),accessor:(row:ServiceRow)=><Status state={statusFromBooleans(row.running,row.enabled)} label={row.running===true?"Running":row.running===false?row.enabled===false?"Stopped (disabled)":"Stopped":"Unknown"}/>}];
 return <><div className="page-heading"><div><h1>Services</h1><p>Service state reported by this firewall</p></div><button className="secondary-button" onClick={live.refresh} disabled={live.loading}>{live.loading?"Refreshing…":"Refresh"}</button></div>
  {live.error&&<Feedback tone="error">{live.error}</Feedback>}
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search services"/>
  <Panel title="Services" action={<span className="subtle">{rows.length} reported</span>}><DataTable rows={rows} columns={columns} getRowId={row=>row.key} searchableText={row=>[row.name??"",row.description??"",row.enabled?"enabled":"disabled",row.running?"running":"stopped"].join(" ")} search={query} loading={live.loading} emptyTitle="No services reported" emptyDescription="The firewall did not return service status records in this collection." pageSize={25}/></Panel>
  <p className="preview-footnote">This page reports state only. It has no start, stop, or restart control, and nothing on it changes firewall configuration.</p>
 </>;
}
type AliasRow=AliasView&{key:string};
function aliasTypeLabel(type:AliasView["type"]):string{return type===null?"—":type.charAt(0).toUpperCase()+type.slice(1);}
function aliasContent(row:AliasRow):string{
 const shown=row.entries.slice(0,3).join(", ");
 const hidden=row.entryCount-row.entries.length;
 if(shown.length===0)return hidden>0?"+"+hidden+" more":"—";
 return hidden>0?shown+" +"+hidden+" more":shown;
}
function withReadKeys<T>(items:T[]):Array<T&{key:string}>{return items.map((item,index)=>({...item,key:String(index)}));}
function readTone(code:string|null):"warning"|"error"{return code==="FIREWALL_PERMISSION_DENIED"||code==="FIREWALL_ENDPOINT_UNSUPPORTED"?"warning":"error";}
function portLabel(address:string|null,port:string|null):string{const base=address??"—";return port?base+":"+port:base;}
function booleanLabel(value:boolean|null):string{return value===null?"Unknown":value?"Yes":"No";}
function bytesLabel(value:number|null):string{return value===null?"—":formatNumber(value)+" B";}
function ReadNotices({states,device,what}:{states:Array<PageReadState<unknown>>;device:Device;what:string}){
 if(device.enabled===false)return <Feedback tone="warning">Polling is disabled for this site. Enable it in Site Settings before reading {what}.</Feedback>;
 const seen=new Set<string>();
 const messages:Array<{text:string;code:string|null}>=[];
 for(const state of states){if(!state.error||seen.has(state.error))continue;seen.add(state.error);messages.push({text:state.error,code:state.errorCode});}
 return <>{messages.map((message,index)=><Feedback key={index} tone={readTone(message.code)}>{message.text}</Feedback>)}</>;
}
function ReadPanel<R extends {key:string}>({title,state,rows,columns,search,searchableText,emptyTitle,emptyDescription,disabled,disabledTitle="Configuration read unavailable"}:{title:string;state:PageReadState<unknown>;rows:R[];columns:DataColumn<R>[];search:string;searchableText:(row:R)=>string;emptyTitle:string;emptyDescription:string;disabled:boolean;disabledTitle?:string}){
 return <Panel title={title} action={<span className="subtle">{state.data?state.data.count+" reported"+(state.data.truncated?" (list truncated)":""):""}</span>}>
  <DataTable rows={rows} columns={columns} getRowId={row=>row.key} searchableText={searchableText} search={search} loading={state.loading} emptyTitle={disabled?disabledTitle:emptyTitle} emptyDescription={disabled?"Polling is disabled for this site, so the manager did not read this area.":emptyDescription} pageSize={25}/>
 </Panel>;
}
function AliasesLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const live=useConfigurationRead("aliases",device.id,device.enabled!==false);
 const rows=withReadKeys<AliasView>(live.data?.items??[]);
 const columns=[{id:"name",header:"Name",sortable:true,value:(row:AliasRow)=>row.name??"",accessor:(row:AliasRow)=><strong>{row.name??"—"}</strong>},{id:"type",header:"Type",sortable:true,value:(row:AliasRow)=>row.type??"",accessor:(row:AliasRow)=>aliasTypeLabel(row.type)},{id:"description",header:"Description",value:(row:AliasRow)=>row.description??"",accessor:(row:AliasRow)=>row.description??"—"},{id:"entries",header:"Entries",sortable:true,value:(row:AliasRow)=>row.entryCount,accessor:(row:AliasRow)=><span title={row.entries.join(", ")}>{row.entryCount}{row.entriesTruncated?" ("+row.entries.length+" shown)":""}</span>},{id:"content",header:"Content",value:(row:AliasRow)=>row.entries.join(" "),accessor:(row:AliasRow)=><code title={row.entries.join(", ")}>{aliasContent(row)}</code>}];
 return <><div className="page-heading"><div><h1>Aliases</h1><p>Address and port aliases reported by this firewall</p></div><button className="secondary-button" onClick={live.refresh} disabled={live.loading}>{live.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[live]} device={device} what="this site's aliases"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search aliases"/>
  <ReadPanel title="Aliases" state={live} rows={rows} columns={columns} search={query} searchableText={row=>[row.name??"",row.type??"",row.description??"",row.entries.join(" ")].join(" ")} emptyTitle="No aliases reported" emptyDescription="This firewall returned no alias records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Alias entries are read from this firewall. The manager keeps at most 2,000 aliases and 200 entries per alias, marks anything withheld, and persists none of it. Creating, editing, or deleting aliases is not available because it would change firewall configuration.</p>
 </>;
}
type RuleRow=RuleView&{key:string};

type PortForwardRow=NatPortForwardView&{key:string};
type OutboundNatRow=NatOutboundView&{key:string};
type OneToOneNatRow=NatOneToOneView&{key:string};
function natState(disabled:boolean|null){return <Status state={disabled===null?"unknown":disabled?"unknown":"online"} label={disabled===null?"Unknown":disabled?"Disabled":"Active"}/>;}
function NatLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const enabled=device.enabled!==false;
 const forwards=useConfigurationRead("nat-port-forwards",device.id,enabled);
 const outbound=useConfigurationRead("nat-outbound",device.id,enabled);
 const oneToOne=useConfigurationRead("nat-one-to-one",device.id,enabled);
 const forwardRows=withReadKeys<NatPortForwardView>(forwards.data?.items??[]);
 const outboundRows=withReadKeys<NatOutboundView>(outbound.data?.items??[]);
 const oneToOneRows=withReadKeys<NatOneToOneView>(oneToOne.data?.items??[]);
 const forwardColumns=[{id:"interface",header:"Interface",sortable:true,value:(row:PortForwardRow)=>row.interface??"",accessor:(row:PortForwardRow)=><strong>{row.interface??"—"}</strong>},{id:"protocol",header:"Protocol",sortable:true,value:(row:PortForwardRow)=>row.protocol??"",accessor:(row:PortForwardRow)=>row.protocol??"—"},{id:"destination",header:"External",sortable:true,value:(row:PortForwardRow)=>portLabel(row.destination,row.destinationPort),accessor:(row:PortForwardRow)=><code>{portLabel(row.destination,row.destinationPort)}</code>},{id:"target",header:"Internal",sortable:true,value:(row:PortForwardRow)=>portLabel(row.target,row.localPort),accessor:(row:PortForwardRow)=><code>{portLabel(row.target,row.localPort)}</code>},{id:"reflection",header:"Reflection",value:(row:PortForwardRow)=>row.natReflection??"",accessor:(row:PortForwardRow)=>row.natReflection??"—"},{id:"description",header:"Description",value:(row:PortForwardRow)=>row.description??"",accessor:(row:PortForwardRow)=>row.description??"—"},{id:"state",header:"State",sortable:true,value:(row:PortForwardRow)=>row.disabled===null?"":row.disabled?"disabled":"active",accessor:(row:PortForwardRow)=>natState(row.disabled)}];
 const outboundColumns=[{id:"interface",header:"Interface",sortable:true,value:(row:OutboundNatRow)=>row.interface??"",accessor:(row:OutboundNatRow)=><strong>{row.interface??"—"}</strong>},{id:"protocol",header:"Protocol",sortable:true,value:(row:OutboundNatRow)=>row.protocol??"",accessor:(row:OutboundNatRow)=>row.protocol??"—"},{id:"source",header:"Source",sortable:true,value:(row:OutboundNatRow)=>portLabel(row.source,row.sourcePort),accessor:(row:OutboundNatRow)=><code>{portLabel(row.source,row.sourcePort)}</code>},{id:"target",header:"Translation",sortable:true,value:(row:OutboundNatRow)=>portLabel(row.target,row.natPort),accessor:(row:OutboundNatRow)=><code>{portLabel(row.target,row.natPort)}{row.targetSubnet!==null?"/"+row.targetSubnet:""}</code>},{id:"pool",header:"Pool",value:(row:OutboundNatRow)=>row.poolOptions??"",accessor:(row:OutboundNatRow)=>row.poolOptions??"—"},{id:"description",header:"Description",value:(row:OutboundNatRow)=>row.description??"",accessor:(row:OutboundNatRow)=><div className="alert-cell"><strong>{row.description??"—"}</strong><small>{row.noNat?"No NAT":"NAT applied"}</small></div>},{id:"state",header:"State",sortable:true,value:(row:OutboundNatRow)=>row.disabled===null?"":row.disabled?"disabled":"active",accessor:(row:OutboundNatRow)=>natState(row.disabled)}];

 const oneToOneColumns=[{id:"interface",header:"Interface",sortable:true,value:(row:OneToOneNatRow)=>row.interface??"",accessor:(row:OneToOneNatRow)=><strong>{row.interface??"—"}</strong>},{id:"external",header:"External",sortable:true,value:(row:OneToOneNatRow)=>row.external??"",accessor:(row:OneToOneNatRow)=><code>{row.external??"—"}</code>},{id:"source",header:"Source",sortable:true,value:(row:OneToOneNatRow)=>row.source??"",accessor:(row:OneToOneNatRow)=><code>{row.source??"—"}</code>},{id:"destination",header:"Destination",sortable:true,value:(row:OneToOneNatRow)=>row.destination??"",accessor:(row:OneToOneNatRow)=><code>{row.destination??"—"}</code>},{id:"description",header:"Description",value:(row:OneToOneNatRow)=>row.description??"",accessor:(row:OneToOneNatRow)=>row.description??"—"},{id:"state",header:"State",sortable:true,value:(row:OneToOneNatRow)=>row.disabled===null?"":row.disabled?"disabled":"active",accessor:(row:OneToOneNatRow)=>natState(row.disabled)}];
 const refresh=()=>{forwards.refresh();outbound.refresh();oneToOne.refresh();};
 return <><div className="page-heading"><div><h1>NAT</h1><p>Port forwarding and NAT mappings reported by this firewall</p></div><button className="secondary-button" onClick={refresh} disabled={forwards.loading||outbound.loading||oneToOne.loading}>{forwards.loading||outbound.loading||oneToOne.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[forwards,outbound,oneToOne]} device={device} what="this site's NAT configuration"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search NAT mappings"/>
  <ReadPanel title="Port forwards" state={forwards} rows={forwardRows} columns={forwardColumns} search={query} searchableText={row=>[row.interface??"",row.protocol??"",row.destination??"",row.destinationPort??"",row.target??"",row.localPort??"",row.description??""].join(" ")} emptyTitle="No port forwards reported" emptyDescription="This firewall returned no port forward records in this read." disabled={device.enabled===false}/>
  <ReadPanel title="Outbound NAT" state={outbound} rows={outboundRows} columns={outboundColumns} search={query} searchableText={row=>[row.interface??"",row.protocol??"",row.source??"",row.target??"",row.description??""].join(" ")} emptyTitle="No outbound NAT mappings reported" emptyDescription="This firewall returned no outbound NAT records in this read." disabled={device.enabled===false}/>
  <ReadPanel title="1:1 NAT" state={oneToOne} rows={oneToOneRows} columns={oneToOneColumns} search={query} searchableText={row=>[row.interface??"",row.external??"",row.source??"",row.destination??"",row.description??""].join(" ")} emptyTitle="No 1:1 NAT mappings reported" emptyDescription="This firewall returned no 1:1 NAT records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Each NAT mode is a separate approved read. Disabled mappings stay visible and are labelled, because hiding them would misrepresent the firewall. Nothing on this page creates, edits, or applies a mapping.</p>
 </>;
}
function RulesLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const live=useConfigurationRead("rules",device.id,device.enabled!==false);
 const rows=withReadKeys<RuleView>(live.data?.items??[]);
 const columns=[{id:"action",header:"Action",sortable:true,value:(row:RuleRow)=>row.action??"",accessor:(row:RuleRow)=><Status state={row.action==="pass"?"online":row.action==="block"?"offline":row.action==="reject"?"warning":"unknown"} label={row.action??"Unknown"}/>},{id:"interface",header:"Interface",sortable:true,value:(row:RuleRow)=>row.interfaces.join(","),accessor:(row:RuleRow)=>row.interfaces.length>0?row.interfaces.join(", "):"—"},{id:"ipprotocol",header:"IP version",sortable:true,value:(row:RuleRow)=>row.ipProtocol??"",accessor:(row:RuleRow)=>row.ipProtocol==="inet46"?"IPv4+IPv6":row.ipProtocol==="inet6"?"IPv6":row.ipProtocol==="inet"?"IPv4":"—"},{id:"protocol",header:"Protocol",sortable:true,value:(row:RuleRow)=>row.protocol??"",accessor:(row:RuleRow)=>row.protocol??"—"},{id:"source",header:"Source",sortable:true,value:(row:RuleRow)=>portLabel(row.source,row.sourcePort),accessor:(row:RuleRow)=><code>{portLabel(row.source,row.sourcePort)}</code>},{id:"destination",header:"Destination",sortable:true,value:(row:RuleRow)=>portLabel(row.destination,row.destinationPort),accessor:(row:RuleRow)=><code>{portLabel(row.destination,row.destinationPort)}</code>},{id:"description",header:"Description",value:(row:RuleRow)=>row.description??"",accessor:(row:RuleRow)=><div className="alert-cell"><strong>{row.description??"—"}</strong><small>{row.disabled?"Disabled":row.floating?"Floating rule":"Interface rule"}</small></div>}];
 return <><div className="page-heading"><div><h1>Firewall Rules</h1><p>Rules reported by this firewall, in the order the firewall returned them</p></div><button className="secondary-button" onClick={live.refresh} disabled={live.loading}>{live.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[live]} device={device} what="this site's firewall rules"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search rules"/>
  <ReadPanel title="Firewall rules" state={live} rows={rows} columns={columns} search={query} searchableText={row=>[row.action??"",row.interfaces.join(" "),row.protocol??"",row.source??"",row.sourcePort??"",row.destination??"",row.destinationPort??"",row.description??""].join(" ")} emptyTitle="No firewall rules reported" emptyDescription="This firewall returned no rule records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Rules are read from this firewall in the firewall's own order; the manager does not reorder, evaluate, or simulate them. Rule trackers, internal application identifiers, and change-history fields are excluded. Adding, editing, deleting, or applying a rule is not available because it would change firewall configuration.</p>
 </>;
}
type StaticRouteRow=StaticRouteView&{key:string};
function RoutingLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const live=useConfigurationRead("static-routes",device.id,device.enabled!==false);
 const rows=withReadKeys<StaticRouteView>(live.data?.items??[]);
 const columns=[{id:"network",header:"Destination network",sortable:true,value:(row:StaticRouteRow)=>row.network??"",accessor:(row:StaticRouteRow)=><strong><code>{row.network??"—"}</code></strong>},{id:"gateway",header:"Gateway",sortable:true,value:(row:StaticRouteRow)=>row.gateway??"",accessor:(row:StaticRouteRow)=><code>{row.gateway??"—"}</code>},{id:"description",header:"Description",value:(row:StaticRouteRow)=>row.description??"",accessor:(row:StaticRouteRow)=>row.description??"—"},{id:"state",header:"State",sortable:true,value:(row:StaticRouteRow)=>row.disabled===null?"":row.disabled?"disabled":"active",accessor:(row:StaticRouteRow)=>natState(row.disabled)}];
 return <><div className="page-heading"><div><h1>Routing</h1><p>Static routes reported by this firewall</p></div><button className="secondary-button" onClick={live.refresh} disabled={live.loading}>{live.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[live]} device={device} what="this site's static routes"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search static routes"/>
  <ReadPanel title="Static routes" state={live} rows={rows} columns={columns} search={query} searchableText={row=>[row.network??"",row.gateway??"",row.description??""].join(" ")} emptyTitle="No static routes reported" emptyDescription="This firewall returned no static route records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Static routes are read as configured. The manager does not resolve gateways, check reachability, or apply routing changes. Gateway monitoring state lives on the Gateways page and comes from the health sample instead.</p>
 </>;
}
type DhcpServerRow=DhcpServerView&{key:string};
type DhcpPoolRow=DhcpAddressPoolView&{key:string};
type DhcpMappingRow=DhcpStaticMappingView&{key:string};
function leaseLabel(seconds:number|null):string{return seconds===null?"Default":Math.round(seconds/60)+" min";}
function DhcpLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const enabled=device.enabled!==false;
 const servers=useConfigurationRead("dhcp-servers",device.id,enabled);
 const pools=useConfigurationRead("dhcp-address-pools",device.id,enabled);
 const mappings=useConfigurationRead("dhcp-static-mappings",device.id,enabled);
 const serverRows=withReadKeys<DhcpServerView>(servers.data?.items??[]);
 const poolRows=withReadKeys<DhcpAddressPoolView>(pools.data?.items??[]);
 const mappingRows=withReadKeys<DhcpStaticMappingView>(mappings.data?.items??[]);
 const serverColumns=[{id:"interface",header:"Interface",sortable:true,value:(row:DhcpServerRow)=>row.interface??"",accessor:(row:DhcpServerRow)=><strong>{row.interface??"—"}</strong>},{id:"range",header:"Range",sortable:true,value:(row:DhcpServerRow)=>(row.rangeFrom??"")+"-"+(row.rangeTo??""),accessor:(row:DhcpServerRow)=><code>{row.rangeFrom??"—"}{row.rangeTo?" – "+row.rangeTo:""}</code>},{id:"domain",header:"Domain",value:(row:DhcpServerRow)=>row.domain??"",accessor:(row:DhcpServerRow)=>row.domain??"—"},{id:"dns",header:"DNS servers",value:(row:DhcpServerRow)=>row.dnsServers.join(" "),accessor:(row:DhcpServerRow)=>row.dnsServers.length>0?row.dnsServers.join(", "):"Inherited"},{id:"lease",header:"Lease",sortable:true,value:(row:DhcpServerRow)=>row.defaultLeaseTime??-1,accessor:(row:DhcpServerRow)=>leaseLabel(row.defaultLeaseTime)},{id:"state",header:"State",sortable:true,value:(row:DhcpServerRow)=>row.enabled===null?"":row.enabled?"enabled":"disabled",accessor:(row:DhcpServerRow)=><Status state={row.enabled===null?"unknown":row.enabled?"online":"unknown"} label={row.enabled===null?"Unknown":row.enabled?"Enabled":"Disabled"}/>}];
 const poolColumns=[{id:"interface",header:"Interface",sortable:true,value:(row:DhcpPoolRow)=>row.parentId??"",accessor:(row:DhcpPoolRow)=><strong>{row.parentId??"—"}</strong>},{id:"range",header:"Pool range",sortable:true,value:(row:DhcpPoolRow)=>(row.rangeFrom??"")+"-"+(row.rangeTo??""),accessor:(row:DhcpPoolRow)=><code>{row.rangeFrom??"—"}{row.rangeTo?" – "+row.rangeTo:""}</code>},{id:"gateway",header:"Gateway",value:(row:DhcpPoolRow)=>row.gateway??"",accessor:(row:DhcpPoolRow)=>row.gateway??"—"},{id:"domain",header:"Domain",value:(row:DhcpPoolRow)=>row.domain??"",accessor:(row:DhcpPoolRow)=>row.domain??"—"}];
 const mappingColumns=[{id:"interface",header:"Interface",sortable:true,value:(row:DhcpMappingRow)=>row.parentId??"",accessor:(row:DhcpMappingRow)=><strong>{row.parentId??"—"}</strong>},{id:"hostname",header:"Hostname",sortable:true,value:(row:DhcpMappingRow)=>row.hostname??"",accessor:(row:DhcpMappingRow)=>row.hostname??"—"},{id:"address",header:"Address",sortable:true,value:(row:DhcpMappingRow)=>row.ipAddress??"",accessor:(row:DhcpMappingRow)=><code>{row.ipAddress??"—"}</code>},{id:"mac",header:"MAC address",sortable:true,value:(row:DhcpMappingRow)=>row.mac??"",accessor:(row:DhcpMappingRow)=><code>{row.mac??"—"}</code>},{id:"description",header:"Description",value:(row:DhcpMappingRow)=>row.description??"",accessor:(row:DhcpMappingRow)=>row.description??"—"},{id:"arp",header:"Static ARP",value:(row:DhcpMappingRow)=>row.staticArp===null?"":row.staticArp?"yes":"no",accessor:(row:DhcpMappingRow)=>booleanLabel(row.staticArp)}];
 const refresh=()=>{servers.refresh();pools.refresh();mappings.refresh();};
 return <><div className="page-heading"><div><h1>DHCP</h1><p>DHCP servers, address pools, and static mappings reported by this firewall</p></div><button className="secondary-button" onClick={refresh} disabled={servers.loading||pools.loading||mappings.loading}>{servers.loading||pools.loading||mappings.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[servers,pools,mappings]} device={device} what="this site's DHCP configuration"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search DHCP records"/>
  <ReadPanel title="DHCP servers" state={servers} rows={serverRows} columns={serverColumns} search={query} searchableText={row=>[row.interface??"",row.rangeFrom??"",row.rangeTo??"",row.domain??"",row.dnsServers.join(" ")].join(" ")} emptyTitle="No DHCP servers reported" emptyDescription="This firewall returned no DHCP server records in this read." disabled={device.enabled===false}/>
  <ReadPanel title="Address pools" state={pools} rows={poolRows} columns={poolColumns} search={query} searchableText={row=>[row.parentId??"",row.rangeFrom??"",row.rangeTo??"",row.gateway??"",row.domain??""].join(" ")} emptyTitle="No address pools reported" emptyDescription="This firewall returned no additional address pool records in this read." disabled={device.enabled===false}/>
  <ReadPanel title="Static mappings" state={mappings} rows={mappingRows} columns={mappingColumns} search={query} searchableText={row=>[row.parentId??"",row.hostname??"",row.ipAddress??"",row.mac??"",row.description??""].join(" ")} emptyTitle="No static mappings reported" emptyDescription="This firewall returned no static mapping records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Leases currently issued to clients are not read: no approved endpoint exposes them, and the manager does not infer them from static mappings. Client identifiers are excluded from this view.</p>
 </>;
}
type DnsHostRow=DnsHostOverrideView&{key:string};
type DnsDomainRow=DnsDomainOverrideView&{key:string};
function flagLabel(value:boolean|null):string{return value===null?"Unknown":value?"Yes":"No";}
function DnsLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const enabled=device.enabled!==false;
 const settings=useConfigurationRead("dns-settings",device.id,enabled);
 const hosts=useConfigurationRead("dns-host-overrides",device.id,enabled);
 const domains=useConfigurationRead("dns-domain-overrides",device.id,enabled);
 const setting=settings.data?.items[0]??null;
 const hostRows=withReadKeys<DnsHostOverrideView>(hosts.data?.items??[]);
 const domainRows=withReadKeys<DnsDomainOverrideView>(domains.data?.items??[]);
 const hostColumns=[{id:"host",header:"Host",sortable:true,value:(row:DnsHostRow)=>(row.host??"")+"."+(row.domain??""),accessor:(row:DnsHostRow)=><strong>{row.host??"—"}{row.domain?"."+row.domain:""}</strong>},{id:"addresses",header:"Addresses",sortable:true,value:(row:DnsHostRow)=>row.addresses.join(" "),accessor:(row:DnsHostRow)=><code>{row.addresses.length>0?row.addresses.join(", "):"—"}</code>},{id:"description",header:"Description",value:(row:DnsHostRow)=>row.description??"",accessor:(row:DnsHostRow)=>row.description??"—"},{id:"aliases",header:"Aliases",sortable:true,value:(row:DnsHostRow)=>row.aliasCount,accessor:(row:DnsHostRow)=>String(row.aliasCount)}];
 const domainColumns=[{id:"domain",header:"Domain",sortable:true,value:(row:DnsDomainRow)=>row.domain??"",accessor:(row:DnsDomainRow)=><strong>{row.domain??"—"}</strong>},{id:"address",header:"Forward to",sortable:true,value:(row:DnsDomainRow)=>row.address??"",accessor:(row:DnsDomainRow)=><code>{row.address??"—"}</code>},{id:"tls",header:"TLS upstream",value:(row:DnsDomainRow)=>row.forwardTlsUpstream===null?"":row.forwardTlsUpstream?"yes":"no",accessor:(row:DnsDomainRow)=>row.forwardTlsUpstream===null?"—":row.forwardTlsUpstream?(row.tlsHostname??"Enabled"):"Disabled"},{id:"description",header:"Description",value:(row:DnsDomainRow)=>row.description??"",accessor:(row:DnsDomainRow)=>row.description??"—"}];
 const refresh=()=>{settings.refresh();hosts.refresh();domains.refresh();};
 return <><div className="page-heading"><div><h1>DNS</h1><p>DNS resolver settings and overrides reported by this firewall</p></div><button className="secondary-button" onClick={refresh} disabled={settings.loading||hosts.loading||domains.loading}>{settings.loading||hosts.loading||domains.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[settings,hosts,domains]} device={device} what="this site's DNS configuration"/>
  <Panel title="Resolver settings" action={<span className="subtle">{settings.data?"Collected "+new Date(settings.data.collectedAt).toLocaleTimeString():"Not collected"}</span>}>
   <dl className="detail-list">
    <div><dt>Resolver enabled</dt><dd>{flagLabel(setting?.enabled??null)}</dd></div>
    <div><dt>Listen port</dt><dd>{setting?.port??"—"}</dd></div>
    <div><dt>DNS over TLS</dt><dd>{setting?.enableSsl===null||setting?.enableSsl===undefined?"—":setting.enableSsl?"Enabled on port "+(setting.tlsPort??"853"):"Disabled"}</dd></div>
    <div><dt>DNSSEC</dt><dd>{flagLabel(setting?.dnssec??null)}</dd></div>
    <div><dt>Forwarding mode</dt><dd>{flagLabel(setting?.forwarding??null)}</dd></div>
    <div><dt>Strict outbound</dt><dd>{flagLabel(setting?.strictOut??null)}</dd></div>
    <div><dt>Active interfaces</dt><dd>{setting&&setting.activeInterfaces.length>0?setting.activeInterfaces.join(", "):"—"}</dd></div>
    <div><dt>Outgoing interfaces</dt><dd>{setting&&setting.outgoingInterfaces.length>0?setting.outgoingInterfaces.join(", "):"Any"}</dd></div>
    <div><dt>Register DHCP leases</dt><dd>{flagLabel(setting?.regDhcp??null)}</dd></div>
    <div><dt>Register static mappings</dt><dd>{flagLabel(setting?.regDhcpStatic??null)}</dd></div>
    <div><dt>Register OpenVPN clients</dt><dd>{flagLabel(setting?.regOpenVpnClients??null)}</dd></div>
   </dl>
  </Panel>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search DNS overrides"/>
  <ReadPanel title="Host overrides" state={hosts} rows={hostRows} columns={hostColumns} search={query} searchableText={row=>[row.host??"",row.domain??"",row.addresses.join(" "),row.description??""].join(" ")} emptyTitle="No host overrides reported" emptyDescription="This firewall returned no host override records in this read." disabled={device.enabled===false}/>
  <ReadPanel title="Domain overrides" state={domains} rows={domainRows} columns={domainColumns} search={query} searchableText={row=>[row.domain??"",row.address??"",row.description??""].join(" ")} emptyTitle="No domain overrides reported" emptyDescription="This firewall returned no domain override records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Custom resolver directives and Python integration settings are not displayed: they are free-form configuration text that can contain operator-specific details the manager has no approved reason to read. Nothing on this page changes DNS configuration.</p>
 </>;
}
type CertificateRow=CertificateView&{key:string};
type CertificateAuthorityRow=CertificateAuthorityView&{key:string};
function certificateState(days:number|null){
 if(days===null)return <Status state="unknown" label="Unknown"/>;
 if(days<0)return <Status state="offline" label="Expired"/>;
 if(days<=30)return <Status state="warning" label={days+" days left"}/>;
 return <Status state="online" label={days+" days left"}/>;
}
function CertificatesLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const enabled=device.enabled!==false;
 const certificates=useConfigurationRead("certificates",device.id,enabled);
 const authorities=useConfigurationRead("certificate-authorities",device.id,enabled);
 const certificateRows=withReadKeys<CertificateView>(certificates.data?.items??[]);
 const authorityRows=withReadKeys<CertificateAuthorityView>(authorities.data?.items??[]);
 const certificateColumns=[{id:"description",header:"Certificate",sortable:true,value:(row:CertificateRow)=>row.description??"",accessor:(row:CertificateRow)=><strong>{row.description??"—"}</strong>},{id:"type",header:"Type",sortable:true,value:(row:CertificateRow)=>row.type??"",accessor:(row:CertificateRow)=>row.type??"—"},{id:"validFrom",header:"Valid from",sortable:true,value:(row:CertificateRow)=>row.validFrom??"",accessor:(row:CertificateRow)=>row.validFrom??"—"},{id:"validUntil",header:"Expires",sortable:true,value:(row:CertificateRow)=>row.validUntil??"",accessor:(row:CertificateRow)=>row.validUntil??"—"},{id:"state",header:"State",sortable:true,value:(row:CertificateRow)=>row.validDaysLeft??-99999,accessor:(row:CertificateRow)=>certificateState(row.validDaysLeft)}];
 const authorityColumns=[{id:"description",header:"Certificate authority",sortable:true,value:(row:CertificateAuthorityRow)=>row.description??"",accessor:(row:CertificateAuthorityRow)=><strong>{row.description??"—"}</strong>},{id:"trust",header:"Trusted for TLS",value:(row:CertificateAuthorityRow)=>row.trust===null?"":row.trust?"yes":"no",accessor:(row:CertificateAuthorityRow)=>row.trust===null?<Status state="unknown" label="Unknown"/>:row.trust?<Status state="online" label="Trusted"/>:<Status state="unknown" label="Not trusted"/>}];
 const refresh=()=>{certificates.refresh();authorities.refresh();};
 return <><div className="page-heading"><div><h1>Certificates</h1><p>Certificate and certificate authority inventory reported by this firewall</p></div><button className="secondary-button" onClick={refresh} disabled={certificates.loading||authorities.loading}>{certificates.loading||authorities.loading?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[certificates,authorities]} device={device} what="this site's certificate inventory"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search certificates"/>
  <ReadPanel title="Certificates" state={certificates} rows={certificateRows} columns={certificateColumns} search={query} searchableText={row=>[row.description??"",row.type??"",row.validFrom??"",row.validUntil??""].join(" ")} emptyTitle="No certificates reported" emptyDescription="This firewall returned no certificate records in this read." disabled={device.enabled===false}/>
  <ReadPanel title="Certificate authorities" state={authorities} rows={authorityRows} columns={authorityColumns} search={query} searchableText={row=>[row.description??""].join(" ")} emptyTitle="No certificate authorities reported" emptyDescription="This firewall returned no certificate authority records in this read." disabled={device.enabled===false}/>
  <p className="preview-footnote">Certificates and private keys are deliberately excluded from this view. The manager reads only the description, type, and validity window, so no key material, PEM body, or internal reference identifier reaches the browser or a log. Importing, exporting, renewing, or revoking a certificate is not available.</p>
 </>;
}
type IpsecRow=IpsecSaView&{key:string};
type VpnServerRow=OpenVpnServerView&{key:string};
type VpnClientRow=OpenVpnClientView&{key:string};
type WgTunnelRow=WireGuardTunnelView&{key:string};
type WgPeerRow=WireGuardPeerView&{key:string};
function timeLabel(value:string|null):string{return value===null?"—":new Date(value).toLocaleString();}
function VpnLive({device,query,setQuery}:{device:Device;query:string;setQuery:(s:string)=>void}){
 const enabled=device.enabled!==false;
 const ipsec=useTelemetryRead("ipsec-sas",device.id,enabled);
 const servers=useTelemetryRead("openvpn-servers",device.id,enabled);
 const clients=useTelemetryRead("openvpn-clients",device.id,enabled);
 const tunnels=useTelemetryRead("wireguard-tunnels",device.id,enabled);
 const peers=useTelemetryRead("wireguard-peers",device.id,enabled);
 const ipsecRows=withReadKeys<IpsecSaView>(ipsec.data?.items??[]);
 const serverRows=withReadKeys<OpenVpnServerView>(servers.data?.items??[]);
 const clientRows=withReadKeys<OpenVpnClientView>(clients.data?.items??[]);
 const tunnelRows=withReadKeys<WireGuardTunnelView>(tunnels.data?.items??[]);
 const peerRows=withReadKeys<WireGuardPeerView>(peers.data?.items??[]);
 const ipsecColumns=[{id:"peer",header:"Peer",sortable:true,value:(row:IpsecRow)=>row.remoteId??row.remoteHost??"",accessor:(row:IpsecRow)=><div className="alert-cell"><strong>{row.remoteId??row.remoteHost??"—"}</strong><small>{row.remoteHost??""}</small></div>},{id:"local",header:"Local",value:(row:IpsecRow)=>row.localId??row.localHost??"",accessor:(row:IpsecRow)=>row.localId??row.localHost??"—"},{id:"encryption",header:"Encryption",sortable:true,value:(row:IpsecRow)=>row.encryption??"",accessor:(row:IpsecRow)=>row.encryption??"—"},{id:"integrity",header:"Integrity",value:(row:IpsecRow)=>row.integrity??"",accessor:(row:IpsecRow)=>row.integrity??"—"},{id:"dhgroup",header:"DH group",value:(row:IpsecRow)=>row.dhGroup??"",accessor:(row:IpsecRow)=>row.dhGroup??"—"},{id:"established",header:"Established",sortable:true,value:(row:IpsecRow)=>row.establishedAt??"",accessor:(row:IpsecRow)=>timeLabel(row.establishedAt)},{id:"state",header:"State",sortable:true,value:(row:IpsecRow)=>row.state??"",accessor:(row:IpsecRow)=><Status state={row.state==="established"?"online":row.state?"warning":"unknown"} label={row.state??"Unknown"}/>}];
 const serverColumns=[{id:"name",header:"Server",sortable:true,value:(row:VpnServerRow)=>row.name??"",accessor:(row:VpnServerRow)=><strong>{row.name??"—"}</strong>},{id:"mode",header:"Mode",sortable:true,value:(row:VpnServerRow)=>row.mode??"",accessor:(row:VpnServerRow)=>row.mode??"—"},{id:"port",header:"Port",sortable:true,value:(row:VpnServerRow)=>row.port??"",accessor:(row:VpnServerRow)=><code>{row.port??"—"}</code>},{id:"connections",header:"Connections",sortable:true,value:(row:VpnServerRow)=>row.connectionCount,accessor:(row:VpnServerRow)=>String(row.connectionCount)}];
 const clientColumns=[{id:"name",header:"Client",sortable:true,value:(row:VpnClientRow)=>row.name??"",accessor:(row:VpnClientRow)=><strong>{row.name??"—"}</strong>},{id:"state",header:"State",sortable:true,value:(row:VpnClientRow)=>row.state??row.status??"",accessor:(row:VpnClientRow)=><Status state={row.status==="connected"?"online":row.status?"warning":"unknown"} label={row.state??row.status??"Unknown"}/>},{id:"address",header:"Virtual address",sortable:true,value:(row:VpnClientRow)=>row.virtualAddress??"",accessor:(row:VpnClientRow)=><code>{row.virtualAddress??row.virtualAddress6??"—"}</code>},{id:"remote",header:"Remote",value:(row:VpnClientRow)=>row.remoteHost??"",accessor:(row:VpnClientRow)=>row.remoteHost?(row.remoteHost+(row.remotePort?":"+row.remotePort:"")):"—"},{id:"since",header:"Connected since",sortable:true,value:(row:VpnClientRow)=>row.connectTime??"",accessor:(row:VpnClientRow)=>row.connectTime??"—"}];

 const tunnelColumns=[{id:"name",header:"Tunnel",sortable:true,value:(row:WgTunnelRow)=>row.name??"",accessor:(row:WgTunnelRow)=><div className="alert-cell"><strong>{row.name??"—"}</strong><small>{row.description??""}</small></div>},{id:"state",header:"State",sortable:true,value:(row:WgTunnelRow)=>row.status??"",accessor:(row:WgTunnelRow)=><Status state={row.status==="up"?"online":row.status==="down"?"offline":"unknown"} label={row.status??"Unknown"}/>},{id:"port",header:"Listen port",sortable:true,value:(row:WgTunnelRow)=>row.listenPort??"",accessor:(row:WgTunnelRow)=><code>{row.listenPort??"—"}</code>},{id:"peers",header:"Peers",sortable:true,value:(row:WgTunnelRow)=>row.peerCount??-1,accessor:(row:WgTunnelRow)=>row.peerCount===null?"—":String(row.peerCount)},{id:"rx",header:"Received",sortable:true,value:(row:WgTunnelRow)=>row.transferRx??-1,accessor:(row:WgTunnelRow)=>bytesLabel(row.transferRx)},{id:"tx",header:"Sent",sortable:true,value:(row:WgTunnelRow)=>row.transferTx??-1,accessor:(row:WgTunnelRow)=>bytesLabel(row.transferTx)}];
 const peerColumns=[{id:"tunnel",header:"Tunnel",sortable:true,value:(row:WgPeerRow)=>row.tunnel??"",accessor:(row:WgPeerRow)=><strong>{row.tunnel??"—"}</strong>},{id:"endpoint",header:"Endpoint",sortable:true,value:(row:WgPeerRow)=>row.endpoint??"",accessor:(row:WgPeerRow)=><code>{row.endpoint??"—"}</code>},{id:"allowed",header:"Allowed IPs",value:(row:WgPeerRow)=>row.allowedIps.join(" "),accessor:(row:WgPeerRow)=>row.allowedIps.length>0?<code>{row.allowedIps.join(", ")}</code>:"—"},{id:"handshake",header:"Latest handshake",sortable:true,value:(row:WgPeerRow)=>row.latestHandshakeAt??"",accessor:(row:WgPeerRow)=>timeLabel(row.latestHandshakeAt)},{id:"rx",header:"Received",sortable:true,value:(row:WgPeerRow)=>row.transferRx??-1,accessor:(row:WgPeerRow)=>bytesLabel(row.transferRx)},{id:"tx",header:"Sent",sortable:true,value:(row:WgPeerRow)=>row.transferTx??-1,accessor:(row:WgPeerRow)=>bytesLabel(row.transferTx)},{id:"description",header:"Description",value:(row:WgPeerRow)=>row.description??"",accessor:(row:WgPeerRow)=>row.description??"—"}];
 const refresh=()=>{ipsec.refresh();servers.refresh();clients.refresh();tunnels.refresh();peers.refresh();};
 const busy=ipsec.loading||servers.loading||clients.loading||tunnels.loading||peers.loading;
 return <><div className="page-heading"><div><h1>VPN</h1><p>Tunnel and peer state reported by this firewall</p></div><button className="secondary-button" onClick={refresh} disabled={busy}>{busy?"Refreshing…":"Refresh"}</button></div>
  <ReadNotices states={[ipsec,servers,clients,tunnels,peers]} device={device} what="this site's VPN status"/>
  <ListToolbar search={query} onSearch={setQuery} placeholder="Search VPN status"/>
  <ReadPanel title="IPsec security associations" state={ipsec} rows={ipsecRows} columns={ipsecColumns} search={query} searchableText={row=>[row.remoteId??"",row.remoteHost??"",row.localId??"",row.encryption??"",row.integrity??"",row.state??""].join(" ")} emptyTitle="No IPsec associations reported" emptyDescription="This firewall returned no IPsec security association records in this read." disabled={device.enabled===false} disabledTitle="Status read unavailable"/>
  <ReadPanel title="OpenVPN servers" state={servers} rows={serverRows} columns={serverColumns} search={query} searchableText={row=>[row.name??"",row.mode??"",row.port??""].join(" ")} emptyTitle="No OpenVPN servers reported" emptyDescription="This firewall returned no OpenVPN server records in this read." disabled={device.enabled===false} disabledTitle="Status read unavailable"/>
  <ReadPanel title="OpenVPN clients" state={clients} rows={clientRows} columns={clientColumns} search={query} searchableText={row=>[row.name??"",row.state??"",row.status??"",row.virtualAddress??"",row.remoteHost??""].join(" ")} emptyTitle="No OpenVPN clients reported" emptyDescription="This firewall returned no OpenVPN client records in this read." disabled={device.enabled===false} disabledTitle="Status read unavailable"/>
  <ReadPanel title="WireGuard tunnels" state={tunnels} rows={tunnelRows} columns={tunnelColumns} search={query} searchableText={row=>[row.name??"",row.description??"",row.status??"",row.listenPort??""].join(" ")} emptyTitle="No WireGuard tunnels reported" emptyDescription="This firewall returned no WireGuard tunnel records in this read." disabled={device.enabled===false} disabledTitle="Status read unavailable"/>
  <ReadPanel title="WireGuard peers" state={peers} rows={peerRows} columns={peerColumns} search={query} searchableText={row=>[row.tunnel??"",row.endpoint??"",row.allowedIps.join(" "),row.description??""].join(" ")} emptyTitle="No WireGuard peers reported" emptyDescription="This firewall returned no WireGuard peer records in this read." disabled={device.enabled===false} disabledTitle="Status read unavailable"/>
  <p className="preview-footnote">VPN status is read on demand and is available to any signed-in operator, unlike configuration pages. Public keys, preshared keys, management-socket paths, and IPsec Security Parameter Indexes are excluded: they are not needed to display tunnel state. Nothing on this page connects, disconnects, restarts, or reconfigures a tunnel.</p>
 </>;
}
function LiveDevicePage({page,device,query,setQuery}:{page:Page;device:Device;query:string;setQuery:(s:string)=>void}){
 if(page==="interfaces")return <InterfacesLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="gateways")return <GatewaysLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="rules")return <RulesLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="aliases")return <AliasesLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="nat")return <NatLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="routing")return <RoutingLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="dhcp")return <DhcpLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="dns")return <DnsLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="certificates")return <CertificatesLive device={device} query={query} setQuery={setQuery}/>;
 if(page==="vpn")return <VpnLive device={device} query={query} setQuery={setQuery}/>;
 return <ServicesLive device={device} query={query} setQuery={setQuery}/>;
}
function DataPage({page,query,setQuery,onAdd,device}:{page:Page;query:string;setQuery:(s:string)=>void;onAdd:()=>void;device:Device|null}){
 const livePage=page==="interfaces"||page==="gateways"||page==="services"||page==="rules"||page==="aliases"||page==="nat"||page==="routing"||page==="dhcp"||page==="dns"||page==="certificates"||page==="vpn";
 if(device&&!device.isDemo&&livePage)return <LiveDevicePage page={page} device={device} query={query} setQuery={setQuery}/>;
 const rows=mockRows[page]??[];
 const [statusFilter,setStatusFilter]=useState("all");
 const statusOptions=Array.from(new Set(rows.map(row=>row[row.length-1]??"").filter(Boolean)));
 const filteredRows=statusFilter==="all"?rows:rows.filter(row=>row[row.length-1]===statusFilter);
 const headers:Record<string,string[]>={interfaces:["Interface","Address","Link speed","Status"],rules:["ID","Description","Interface","Protocol","Action","Status"],aliases:["Name","Type","Content","Entries"],nat:["Name","Type","External","Internal","Status"],routing:["Name","Destination","Gateway","Interface"],gateways:["Gateway","Address","Status","Latency"],dhcp:["Scope","Range","Leases","Status"],dns:["Service","Status","Listen address","Health"],services:["Service","State","Startup"],certificates:["Certificate","Issuer","Expires","Status"],vpn:["Tunnel","Type","State","Uptime"],users:["Name","Email","Role","Status"],audit:["Time","Event","Actor","Result"]};
 const cols=headers[page]??["Name","Type","Status"];
 const tableRows=filteredRows.map((values,index)=>({id:index,values}));
 const columns=cols.map((header,index)=>({id:String(index),header,sortable:true,value:(row:{id:number;values:string[]})=>row.values[index]??"",accessor:(row:{id:number;values:string[]})=>{
  const value=row.values[index]??"";
  if(index===row.values.length-1&&(value==="Enabled"||value==="Up"||value==="Online"||value==="Valid"||value==="Active"||value==="Success"||value==="Connected"))return <Status state="online" label={value}/>;
  if(index===row.values.length-1&&(value==="Stopped"||value==="Disconnected"||value==="Warning"))return <Status state="warning" label={value}/>;
  return value;
 }}));
 return <><div className="page-heading"><div><h1>{titles[page]}</h1><p>{descriptions[page]}</p></div><button className="primary-button" onClick={onAdd}><Icon name="plus"/> {page==="rules"?"Add rule":page==="aliases"?"Add alias":page==="nat"?"Add mapping":"Add new"}</button></div><ListToolbar search={query} onSearch={setQuery} placeholder={"Search "+titles[page].toLowerCase()} filters activeCount={statusFilter==="all"?0:1} onClear={()=>setStatusFilter("all")} chips={statusFilter==="all"?[]:[{label:"Status: "+statusFilter,onRemove:()=>setStatusFilter("all")}]}><label>Record status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{statusOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label></ListToolbar><Panel title={titles[page]} action={<span className="subtle">{tableRows.length} preview records</span>}><DataTable rows={tableRows} columns={columns} getRowId={row=>row.id} searchableText={row=>row.values.join(" ")} search={query} emptyTitle="No matching records" emptyDescription="Try another search term or clear the search." pageSize={25}/></Panel><p className="preview-footnote">Rows are illustrative UI fixtures. Create, edit, delete and apply operations are not connected to a firewall.</p></>
}


function AuthScreen({mode,onAuthenticated}:{mode:"loading"|"setup"|"login";onAuthenticated:(username:string)=>void}){
 const [username,setUsername]=useState("");const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setError("");if(mode==="setup"&&password!==confirm){setError("The passwords do not match.");return;}setBusy(true);try{const response=await fetch(mode==="setup"?"/api/v1/auth/setup":"/api/v1/auth/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const result=await response.json();if(!response.ok)throw new Error(result.error?.message??"Authentication failed.");onAuthenticated(result.data?.username??username);}catch(err){setError(err instanceof Error?err.message:"Unable to connect to the Hub API.");}finally{setBusy(false);}}
 return <main className="auth-screen"><section className="auth-card"><div className="brand auth-brand"><div className="brand-mark">PF</div><div className="brand-name"><strong>pfSense Hub</strong><span>Manager</span></div></div>{mode==="loading"?<><h1>Checking administrator session</h1><p>Connecting to the local Hub service.</p></>:<><span className="eyebrow">{mode==="setup"?"FIRST-RUN SETUP":"SECURE ACCESS"}</span><h1>{mode==="setup"?"Create administrator":"Sign in to Hub Manager"}</h1><p>{mode==="setup"?"Create the first administrator account. There are no default credentials.":"Use your Hub Manager administrator credentials to continue."}</p><form onSubmit={submit}><label>Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={64} required/></label><label>Password<input type="password" autoComplete={mode==="setup"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode==="setup"?14:1} maxLength={128} required/></label>{mode==="setup"&&<><label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={14} maxLength={128} required/></label><small className="auth-hint">Use at least 14 characters. Keep this password in a secure password manager.</small></>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="primary-button full-width" disabled={busy}>{busy?(mode==="setup"?"Creating account…":"Signing in…"):(mode==="setup"?"Create administrator":"Sign in")}</button></form></>}</section></main>;
}
type HubAccessMethod = "local" | "tailscale" | "hostname";
type HubDeploymentHistoryItem = {id:string;desiredRevision:number;requestedMethod:HubAccessMethod;state:string;errorCode:string|null;createdAt:string};
type HubAccessEndpoint = {
 method: HubAccessMethod;
 addressType: "magic_dns" | "tailscale_ip" | "hostname" | "ip" | null;
 address: string | null;
 httpsPort: number;
 enabled: boolean;
};
const deploymentErrorCopy:Record<string,string> = {
 HOST_AGENT_NOT_CONFIGURED:"The Linux host deployment agent is not installed or connected.",
 HOST_AGENT_ORIGIN_MISMATCH:"The agent reported an HTTPS origin that does not match the selected endpoint. The API rejected it.",
 TLS_METHOD_NOT_SUPPORTED_YET:"This access method still needs a trusted TLS certificate and deployment configuration.",
 TAILSCALE_HTTPS_NOT_ENABLED:"Enable HTTPS certificates for this tailnet before using Tailscale Serve.",
 TAILSCALE_SERVE_NOT_CONFIGURED:"Configure a private Tailscale Serve route to the Hub loopback service before saving this method.",
 TAILSCALE_LOOPBACK_BINDING_REQUIRED:"Tailscale Serve requires the Hub web service to remain bound to 127.0.0.1. The host agent could not restore that binding.",
 HOST_BIND_ADDRESS_NOT_ASSIGNED:"The selected address does not resolve to an IP assigned to this Hub host.",
 HOST_BIND_ENDPOINT_UNSUPPORTED:"Select a LAN or Custom hostname/IP address before deploying.",
 HOST_BIND_HOSTNAME_RESOLUTION_FAILED:"The selected hostname could not be resolved by the Hub host.",
 HOST_BIND_LOOPBACK_NOT_ALLOWED:"A Custom hostname cannot bind to a loopback address.",
 HOST_BIND_PUBLIC_ADDRESS_NOT_ALLOWED:"Publicly routable host addresses are blocked. Use a private LAN address.",
 PREVIOUS_BIND_ADDRESS_UNSAFE:"The existing web bind is unsafe for automatic rollback. Restore a private or loopback bind before continuing.",
 PREVIOUS_BIND_ADDRESS_INVALID:"The existing web bind is not a valid IP address. Restore a valid private or loopback bind before continuing.",
 TLS_OR_ENDPOINT_VERIFICATION_FAILED:"The HTTPS certificate or application health check failed. The agent attempted to restore the previous bind.",
 ENV_FILE_PERMISSIONS_INVALID:"The production .env file must be owned by root:root and not be group/world writable.",
 TAILSCALE_NOT_CONNECTED:"Tailscale is not connected on the Hub host.",
 TAILSCALE_ADDRESS_MISMATCH:"The selected MagicDNS name does not belong to this Hub host.",
 TAILSCALE_FUNNEL_ALREADY_CONFIGURED:"The host already has a Tailscale Funnel configuration. It was left unchanged.",
};
const defaultHubEndpoints: HubAccessEndpoint[] = [
 {method:"local",addressType:null,address:null,httpsPort:443,enabled:true},
 {method:"tailscale",addressType:null,address:null,httpsPort:443,enabled:false},
 {method:"hostname",addressType:null,address:null,httpsPort:443,enabled:false}
];
type PollingDraft = {intervalSeconds:number;concurrency:number;jitterSeconds:number;retentionDays:number};
type PollingMeta = {source:"hub"|"install";pollingEnabled:boolean;updatedAt:string|null;updatedBy:string|null};
type PollingResponse = {intervalMs:number;concurrency:number;jitterMs:number;retentionDays:number;source?:string;pollingEnabled?:boolean;updatedAt?:string|null;updatedBy?:string|null};
type CollectionDraft = {requestTimeoutMs:number;successCacheTtlMs:number;failureCacheTtlMs:number};
type CollectionMeta = {source:"hub"|"install";updatedAt:string|null;updatedBy:string|null};
type CollectionResponse = CollectionDraft & CollectionMeta;
function HubSettingsPage(){
 const {notify}=useToast();
 const [endpoints,setEndpoints]=useState<HubAccessEndpoint[]>(defaultHubEndpoints);
 const [activeMethod,setActiveMethod]=useState<HubAccessMethod>("local");
 const [deployment,setDeployment]=useState<{status:string;desiredRevision:number;appliedRevision:number;deploymentId?:string;appliedOrigin?:string;previousAppliedOrigin?:string;errorCode?:string}>({status:"pending",desiredRevision:1,appliedRevision:0});
 const [history,setHistory]=useState<HubDeploymentHistoryItem[]>([]);
 const [deploymentEnabled,setDeploymentEnabled]=useState(false);
 const [busy,setBusy]=useState(true);
 const [loadFailed,setLoadFailed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const [polling,setPolling]=useState<PollingDraft>({intervalSeconds:60,concurrency:2,jitterSeconds:15,retentionDays:30});
 const [pollingLoaded,setPollingLoaded]=useState(false);
 const [pollingMeta,setPollingMeta]=useState<PollingMeta>({source:"install",pollingEnabled:false,updatedAt:null,updatedBy:null});
 const [pollingSaving,setPollingSaving]=useState(false);
 const [collection,setCollection]=useState<CollectionDraft>({requestTimeoutMs:10000,successCacheTtlMs:10000,failureCacheTtlMs:2000});
 const [collectionMeta,setCollectionMeta]=useState<CollectionMeta>({source:"install",updatedAt:null,updatedBy:null});
 const [collectionLoaded,setCollectionLoaded]=useState(false);
 const [collectionSaving,setCollectionSaving]=useState(false);
 useEffect(()=>{
  let active=true;
  fetch("/api/v1/hub-settings",{credentials:"same-origin"}).then(async response=>{
   if(!response.ok)throw new Error("Unable to load Hub access settings.");
   return response.json();
  }).then(result=>{
   if(!active)return;
   setDeploymentEnabled(result.data?.deploymentEnabled===true);
   const saved:HubAccessEndpoint[] = result.data?.endpoints ?? [];
   const merged=defaultHubEndpoints.map(fallback=>saved.find(item=>item.method===fallback.method)??fallback);
   const selected=merged.find(endpoint=>endpoint.enabled)?.method??"local";
   setActiveMethod(selected);
   setEndpoints(merged.map(endpoint=>({...endpoint,enabled:endpoint.method===selected})));
   if(result.data?.deployment){
    const current=result.data.deployment;
    setDeployment({
     status:current.latest?.state??current.status,
     desiredRevision:Number(current.desiredRevision),
     appliedRevision:Number(current.appliedRevision),
     deploymentId:current.latest?.id,
     appliedOrigin:current.latest?.appliedOrigin??undefined,
     previousAppliedOrigin:current.previousAppliedOrigin??undefined,
     errorCode:current.latest?.errorCode??undefined
    });
   }
  }).catch(error=>{if(active){setLoadFailed(true);setMessage(error instanceof Error?error.message:"Unable to load Hub access settings.");}})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  const deploymentId=deployment.deploymentId;
  if(!deploymentId||["succeeded","failed","rolled_back"].includes(deployment.status))return;
  let active=true;
  const poll=async()=>{
   try{
    const response=await fetch(`/api/v1/hub-settings/deployments/${deploymentId}`,{credentials:"same-origin"});
    if(!response.ok)throw new Error("Unable to retrieve deployment status.");
    const result=await response.json();
    if(!active)return;
    const current=result.data;
    setDeployment(value=>({...value,status:current.state,appliedOrigin:current.appliedOrigin??undefined,errorCode:current.errorCode??undefined}));
    if(current.state==="succeeded"){
     const success="Hub access endpoint verified successfully.";
     setMessage(success);notify(success,"success");
     if(typeof current.appliedOrigin==="string"){
      const target=new URL(current.appliedOrigin,window.location.href);
      if(target.protocol==="https:")window.location.assign(target.toString());
     }
    }
    if(["failed","rolled_back"].includes(current.state)){
     const failure=current.errorCode??"Deployment did not complete.";
     setMessage(failure);notify(failure,"error");
    }
   }catch(error){
    if(active)setMessage(error instanceof Error?error.message:"Unable to retrieve deployment status.");
   }
  };
  void poll();
  const timer=window.setInterval(()=>void poll(),1500);
  return()=>{active=false;window.clearInterval(timer);};
 },[deployment.deploymentId,deployment.status,notify]);
 useEffect(()=>{
  let active=true;
  fetch("/api/v1/hub-settings/deployments?limit=10",{credentials:"same-origin"})
   .then(async response=>{if(!response.ok)throw new Error("Unable to load deployment history.");return response.json();})
   .then(result=>{if(active)setHistory(Array.isArray(result.data)?result.data:[]);})
   .catch(()=>{if(active)setHistory([]);});
  return()=>{active=false;};
 },[deployment.status,deployment.desiredRevision]);
 useEffect(()=>{
  let active=true;
  fetch("/api/v1/hub-settings/polling",{credentials:"same-origin"})
   .then(async response=>{if(!response.ok)throw new Error("Unable to load polling settings.");return response.json();})
   .then(result=>{if(!active)return;applyPollingResponse(result.data);setPollingLoaded(true);})
   .catch(()=>{if(active)setPollingLoaded(false);});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  let active=true;
  fetch("/api/v1/hub-settings/collection",{credentials:"same-origin"})
   .then(async response=>{if(!response.ok)throw new Error("Unable to load collection limits.");return response.json();})
   .then(result=>{if(!active)return;applyCollectionResponse(result.data);setCollectionLoaded(true);})
   .catch(()=>{if(active)setCollectionLoaded(false);});
  return()=>{active=false;};
 },[]);
 function applyCollectionResponse(data:CollectionResponse){
  setCollection({
   requestTimeoutMs:Number(data.requestTimeoutMs),
   successCacheTtlMs:Number(data.successCacheTtlMs),
   failureCacheTtlMs:Number(data.failureCacheTtlMs)
  });
  setCollectionMeta({
   source:data.source==="hub"?"hub":"install",
   updatedAt:data.updatedAt??null,
   updatedBy:data.updatedBy??null
  });
 }
 function applyPollingResponse(data:PollingResponse){
  setPolling({
   intervalSeconds:Math.round(Number(data.intervalMs)/1000),
   concurrency:Number(data.concurrency),
   jitterSeconds:Math.round(Number(data.jitterMs)/1000),
   retentionDays:Number(data.retentionDays)
  });
  setPollingMeta({
   source:data.source==="hub"?"hub":"install",
   pollingEnabled:data.pollingEnabled===true,
   updatedAt:data.updatedAt??null,
   updatedBy:data.updatedBy??null
  });
 }
 function selectMethod(method:HubAccessMethod){
  setActiveMethod(method);
  setEndpoints(current=>current.map(endpoint=>({...endpoint,enabled:endpoint.method===method})));
 }
 function updateEndpoint(method:HubAccessMethod,patch:Partial<HubAccessEndpoint>){
  setEndpoints(current=>current.map(endpoint=>endpoint.method===method?{...endpoint,...patch}:endpoint));
 }
 function addressTypeOptions(method:HubAccessMethod){
  if(method==="local")return <><option value="">Select address type</option><option value="hostname">LAN hostname</option><option value="ip">LAN IP address</option></>;
  if(method==="tailscale")return <><option value="">Select address type</option><option value="magic_dns">Tailscale MagicDNS hostname</option><option value="tailscale_ip" disabled>Tailscale IPv4, not valid for HTTPS</option></>;
  return <><option value="">Select address type</option><option value="hostname">Hostname</option><option value="ip">IP address</option></>;
 }
 const pollingValid=polling.intervalSeconds>=15&&polling.intervalSeconds<=3600&&polling.jitterSeconds>=0&&polling.jitterSeconds<=60&&polling.jitterSeconds<polling.intervalSeconds&&polling.concurrency>=1&&polling.concurrency<=8&&polling.retentionDays>=1&&polling.retentionDays<=365;
 async function savePolling(){
  if(pollingSaving||!pollingValid)return;
  setPollingSaving(true);setMessage("");
  try{
   const response=await fetch("/api/v1/hub-settings/polling",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({intervalMs:polling.intervalSeconds*1000,concurrency:polling.concurrency,jitterMs:polling.jitterSeconds*1000,retentionDays:polling.retentionDays})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error?.message??"Unable to save polling settings.");
   applyPollingResponse(result.data);setPollingLoaded(true);
   const note=result.data.applied?"Polling settings applied. The next collection uses the new cadence.":"Polling settings saved. Background scheduling is disabled for this deployment, so the cadence is stored but not running.";
   setMessage(note);notify(note,"success");
  }catch(error){
   const failure=error instanceof Error?error.message:"Unable to save polling settings.";
   setMessage(failure);notify(failure,"error");
  }finally{setPollingSaving(false);}
 }
 const collectionValid=Number.isInteger(collection.requestTimeoutMs)&&collection.requestTimeoutMs>=1000&&collection.requestTimeoutMs<=60000
  &&Number.isInteger(collection.successCacheTtlMs)&&collection.successCacheTtlMs>=1000&&collection.successCacheTtlMs<=60000
  &&Number.isInteger(collection.failureCacheTtlMs)&&collection.failureCacheTtlMs>=0&&collection.failureCacheTtlMs<=60000
  &&collection.failureCacheTtlMs<=collection.successCacheTtlMs;
 async function saveCollection(){
  if(collectionSaving||!collectionValid)return;
  setCollectionSaving(true);setMessage("");
  try{
   const response=await fetch("/api/v1/hub-settings/collection",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(collection)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error?.message??"Unable to save collection limits.");
   applyCollectionResponse(result.data);setCollectionLoaded(true);
   const note=result.data.applied?"Collection limits applied. The next collection uses them.":"Collection limits saved.";
   setMessage(note);notify(note,"success");
  }catch(error){
   const failure=error instanceof Error?error.message:"Unable to save collection limits.";
   setMessage(failure);notify(failure,"error");
  }finally{setCollectionSaving(false);}
 }
 const deploymentInProgress=saving||(Boolean(deployment.deploymentId)&&["pending","queued","applying","validating","verifying","rolling_back"].includes(deployment.status));
 const saveButtonLabel=saving?"Saving settings…":deployment.status==="queued"?"Starting deployment…":deployment.status==="applying"?"Applying settings…":deployment.status==="validating"?"Validating configuration…":deployment.status==="verifying"?"Verifying endpoint…":deployment.status==="rolling_back"?"Restoring previous access…":"Applying settings…";
 async function save(event:React.FormEvent){
  event.preventDefault();
  if(deploymentInProgress)return;
  setSaving(true);setMessage("");
  try{
   const payload=endpoints.map(({method,addressType,address,httpsPort})=>({method,addressType,address:address?.trim()||null,httpsPort,enabled:method===activeMethod}));
   const response=await fetch("/api/v1/hub-settings/access-endpoints",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoints:payload})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error?.message??"Unable to save Hub access settings.");
   setDeployment(value=>({...value,status:"queued",desiredRevision:result.data.desiredRevision,appliedRevision:result.data.appliedRevision,deploymentId:result.data.deploymentId,appliedOrigin:undefined,errorCode:undefined}));
   setMessage("Access settings saved. The Host Agent is applying and verifying the endpoint.");
  }catch(error){
   const failure=error instanceof Error?error.message:"Unable to save Hub access settings.";
   setMessage(failure);notify(failure,"error");
  }finally{setSaving(false);}
 }
 const methodCopy:Record<HubAccessMethod,{title:string;description:string;placeholder:string}> = {
  local:{title:"LAN",description:"Select a LAN hostname or IP assigned to this host. A trusted HTTPS reverse proxy must already forward to this address on port 8080.",placeholder:"192.168.1.20"},
  tailscale:{title:"Tailscale",description:"Use this Hub host's MagicDNS name. The Linux Host Agent verifies the host identity and HTTPS eligibility, then creates the fixed private Serve route to the Hub loopback service if it is missing. It will not replace a conflicting route or configure Funnel.",placeholder:"hub.example-tailnet.ts.net"},
  hostname:{title:"Custom",description:"Use a hostname or IP assigned to this host. DNS and a trusted HTTPS reverse proxy must already be configured to forward to this address on port 8080.",placeholder:"hub.example.com"}
 };
 const endpoint=endpoints.find(item=>item.method===activeMethod)??defaultHubEndpoints[0];
 const addressLabel=endpoint.addressType==="magic_dns"?"Tailscale MagicDNS hostname":endpoint.addressType==="tailscale_ip"?"Tailscale IPv4 address":endpoint.addressType==="ip"?"IP address":activeMethod==="local"?"LAN hostname":"Hostname";
 const hasEndpointAddress=Boolean(endpoint.address?.trim());
 const tailscaleMethodSupported=activeMethod==="tailscale"&&endpoint.addressType==="magic_dns";
 const hostBindMethodSupported=(activeMethod==="local"||activeMethod==="hostname")&&(endpoint.addressType==="hostname"||endpoint.addressType==="ip");
 const methodDeploymentSupported=deploymentEnabled&&hasEndpointAddress&&(tailscaleMethodSupported||hostBindMethodSupported)&&endpoint.httpsPort>=1&&endpoint.httpsPort<=65535;
 return <><div className="page-heading"><div><h1>Hub Settings</h1><p>Choose one access method for administrators to reach this Hub installation.</p></div></div>
  <form onSubmit={save} className="hub-settings-layout">
   <Panel title="Hub access">
    <p className="hub-settings-intro">Select one active access method. Each tab keeps its own address type, address, and port when you switch between tabs.</p>
    <div className="hub-access-tabs" role="tablist" aria-label="Hub access method">
     {(["local","tailscale","hostname"] as HubAccessMethod[]).map(method=><button key={method} type="button" role="tab" aria-selected={activeMethod===method} className={activeMethod===method?"hub-access-tab active":"hub-access-tab"} onClick={()=>selectMethod(method)} disabled={busy||deploymentInProgress}>{methodCopy[method].title}{activeMethod===method&&<span>Active</span>}</button>)}
    </div>
    <section className="hub-endpoint-card" role="tabpanel">
     <div className="hub-endpoint-heading"><div><strong>{methodCopy[activeMethod].title} access</strong><small>{methodCopy[activeMethod].description}</small></div><span className="hub-active-indicator">Selected method</span></div>
     <div className="hub-endpoint-fields">
      <label>Address type<select value={endpoint.addressType??""} onChange={event=>updateEndpoint(activeMethod,{addressType:event.target.value?event.target.value as HubAccessEndpoint["addressType"]:null,address:null})} disabled={busy||deploymentInProgress}>
       {addressTypeOptions(activeMethod)}
      </select></label>
      <label>{addressLabel}<input value={endpoint.address??""} onChange={event=>updateEndpoint(activeMethod,{address:event.target.value||null})} placeholder={methodCopy[activeMethod].placeholder} disabled={busy||deploymentInProgress||!endpoint.addressType}/></label>
      <label>Port<input type="number" min="1" max="65535" value={endpoint.httpsPort} onChange={event=>updateEndpoint(activeMethod,{httpsPort:Number(event.target.value)})} disabled={busy||deploymentInProgress}/></label>
     </div>
    </section>
    {!deploymentEnabled?<p className="hub-settings-note">Automatic access verification is disabled until the Linux host integration tests pass. Do not enable this feature on the production host yet.</p>:!methodDeploymentSupported&&<p className="hub-settings-note">LAN and Custom require a hostname/IP assigned to this host plus an already-configured trusted HTTPS reverse proxy to the host address on port 8080. Tailscale requires the host to be connected and tailnet HTTPS certificates to be enabled. The Host Agent creates the fixed private Serve route if it is missing. Hub Manager does not configure DNS, issue certificates, or change tailnet ACLs.</p>}
    {message&&<div className="settings-message" role="status">{message}</div>}
    <div className="hub-settings-actions"><button type="submit" className="primary-button hub-save-button" disabled={busy||deploymentInProgress||loadFailed||!methodDeploymentSupported} aria-busy={deploymentInProgress}>{deploymentInProgress&&<span className="hub-save-spinner" aria-hidden="true"/>}<span>{deploymentInProgress?saveButtonLabel:"Save access method"}</span></button></div>
   </Panel>
   <Panel title="Deployment status">
    <div className={["failed","rolled_back"].includes(deployment.status)?"hub-deployment-state pending":deployment.status==="succeeded"?"hub-deployment-state applied":"hub-deployment-state pending"}>
     <strong>{deployment.status==="succeeded"?"Endpoint verified":deployment.status==="failed"?"Deployment failed":deployment.status==="rolled_back"?"Previous binding restored":deployment.status==="queued"?"Deployment queued":deployment.status==="applying"?"Applying host configuration":deployment.status==="validating"?"Validating configuration":deployment.status==="verifying"?"Verifying endpoint":deployment.status==="rolling_back"?"Restoring previous binding":"Deployment status"}</strong>
     <span>Configuration revision {deployment.desiredRevision}, applied revision {deployment.appliedRevision}</span>
     {deployment.errorCode&&<><span>Safe error code: {deployment.errorCode}</span><span>{deploymentErrorCopy[deployment.errorCode]??"The host agent could not complete this deployment. Review the agent service logs."}</span></>}
    </div>
    <p className="hub-settings-note">Saving automatically requests the restricted host agent to apply and verify the selected HTTPS endpoint. For Tailscale, the agent checks the Hub host identity and HTTPS certificate eligibility, restores the loopback binding when needed, and creates the fixed private Serve route if missing. It refuses conflicting Serve routes and does not configure Funnel, ACLs, DNS, or tailnet certificates. For LAN/Custom, the agent binds the web service to the selected private host address and verifies the operator-managed HTTPS reverse proxy. The browser redirects only after the host agent verifies the endpoint. DNS, Tailscale connectivity, and client routing must still be valid from the device you are using.</p>
    {deployment.previousAppliedOrigin&&<p className="hub-settings-note">Last verified access: <a href={deployment.previousAppliedOrigin} target="_blank" rel="noreferrer">{deployment.previousAppliedOrigin}</a>. Keep this recovery address available while changing access settings.</p>}
   </Panel>
   <Panel title="Recent deployments">
    {history.length===0?<p className="hub-settings-note">No deployment history is available yet.</p>:<div className="hub-deployment-history">
     {history.map(item=><div key={item.id} className="hub-deployment-history-row">
      <strong>Revision {item.desiredRevision}</strong>
      <span>{item.requestedMethod==="local"?"LAN":item.requestedMethod==="tailscale"?"Tailscale":"Custom"}</span>
      <span>{item.state.replaceAll("_"," ")}</span>
      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
      {item.errorCode&&<small>{item.errorCode}</small>}
     </div>)}
    </div>}
   </Panel>
   <Panel title="Polling cadence">
    <p className="hub-settings-intro">Background polling runs inside this API process and uses the same read-only collection as the site pages. These values are stored in the Hub, apply immediately, and survive restarts and upgrades.</p>
    {pollingLoaded&&!pollingMeta.pollingEnabled?<p className="hub-settings-note">Background scheduling is disabled for this deployment (<code>PFSENSE_POLLING_ENABLED</code>). Changes are stored, but nothing is polled until the deployment enables it.</p>:null}
    <div className="hub-polling-fields">
     <label>Interval (seconds)<input type="number" min="15" max="3600" step="1" value={polling.intervalSeconds} onChange={event=>setPolling(current=>({...current,intervalSeconds:Number(event.target.value)}))} disabled={busy||pollingSaving}/></label>
     <label>Devices at once<input type="number" min="1" max="8" step="1" value={polling.concurrency} onChange={event=>setPolling(current=>({...current,concurrency:Number(event.target.value)}))} disabled={busy||pollingSaving}/></label>
     <label>Jitter (seconds)<input type="number" min="0" max="60" step="1" value={polling.jitterSeconds} onChange={event=>setPolling(current=>({...current,jitterSeconds:Number(event.target.value)}))} disabled={busy||pollingSaving}/></label>
     <label>History retention (days)<input type="number" min="1" max="365" step="1" value={polling.retentionDays} onChange={event=>setPolling(current=>({...current,retentionDays:Number(event.target.value)}))} disabled={busy||pollingSaving}/></label>
    </div>
    {!pollingValid&&<p className="hub-settings-note">Use a 15-3600 s interval, 1-8 devices at once, 0-60 s jitter shorter than the interval, and 1-365 days of history.</p>}
    <p className="hub-settings-note">{pollingMeta.source==="install"?"Still at the install defaults.":`Saved in Hub Settings${pollingMeta.updatedBy?` by ${pollingMeta.updatedBy}`:""}${pollingMeta.updatedAt?` on ${new Date(pollingMeta.updatedAt).toLocaleString()}`:""}.`} The scheduler refuses jitter at or above the interval.</p>
    <div className="hub-settings-actions"><button type="button" className="primary-button hub-save-button" onClick={()=>void savePolling()} disabled={busy||pollingSaving||!pollingValid} aria-busy={pollingSaving}>{pollingSaving?"Saving…":"Save polling settings"}</button></div>
   </Panel>
   <Panel title="Collection limits">
    <p className="hub-settings-intro">These values replace the former <code>PFSENSE_API_TIMEOUT_MS</code>, <code>PFSENSE_OBSERVATION_CACHE_MS</code>, and <code>PFSENSE_OBSERVATION_ERROR_CACHE_MS</code> environment variables. They are stored in the Hub and apply to the next collection; no restart is needed.</p>
    <div className="hub-polling-fields">
     <label>Upstream request timeout (ms)<input type="number" min="1000" max="60000" step="500" value={collection.requestTimeoutMs} onChange={event=>setCollection(current=>({...current,requestTimeoutMs:Number(event.target.value)}))} disabled={busy||collectionSaving}/></label>
     <label>Successful observation reuse (ms)<input type="number" min="1000" max="60000" step="500" value={collection.successCacheTtlMs} onChange={event=>setCollection(current=>({...current,successCacheTtlMs:Number(event.target.value)}))} disabled={busy||collectionSaving}/></label>
     <label>Failed observation reuse (ms)<input type="number" min="0" max="60000" step="500" value={collection.failureCacheTtlMs} onChange={event=>setCollection(current=>({...current,failureCacheTtlMs:Number(event.target.value)}))} disabled={busy||collectionSaving}/></label>
    </div>
    {!collectionValid&&<p className="hub-settings-note">Use a 1000-60000 ms timeout, a 1000-60000 ms success reuse, and a 0-60000 ms failure reuse that is not longer than the success reuse.</p>}
    <p className="hub-settings-note">{collectionLoaded?(collectionMeta.source==="install"?"Still at the install defaults.":`Saved in Hub Settings${collectionMeta.updatedBy?` by ${collectionMeta.updatedBy}`:""}${collectionMeta.updatedAt?` on ${new Date(collectionMeta.updatedAt).toLocaleString()}`:""}.`):"Loading stored limits…"} A failed observation is reused for the shorter failure window so a recovering firewall is noticed quickly.</p>
    <div className="hub-settings-actions"><button type="button" className="primary-button hub-save-button" onClick={()=>void saveCollection()} disabled={busy||collectionSaving||!collectionLoaded||!collectionValid} aria-busy={collectionSaving}>{collectionSaving?"Saving…":"Save collection limits"}</button></div>
   </Panel>
  </form>
 </>;
}
