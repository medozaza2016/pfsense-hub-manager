import { Fragment, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router";
import { DataTable, Feedback, ListToolbar } from "./components/ui";
import "./components/ui.css";
import { useToast } from "./components/ToastProvider";

type IconName = "grid" | "sites" | "network" | "bell" | "settings" | "monitor" | "layers" | "shield" | "list" | "route" | "server" | "globe" | "key" | "file" | "plus" | "search" | "refresh" | "chevron" | "menu" | "close" | "clock" | "cpu" | "database" | "harddrive" | "check" | "alert" | "wifi" | "building" | "activity" | "more";
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
    more:"M5 12h.01M12 12h.01M19 12h.01"
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

type Page = "overview"|"sites"|"connectivity"|"alerts"|"hub-settings"|"monitoring"|"interfaces"|"rules"|"aliases"|"nat"|"routing"|"gateways"|"dhcp"|"dns"|"services"|"certificates"|"vpn"|"compatibility"|"site-settings"|"users"|"audit"|"app-settings";
type Device = {id:string;name:string;location:string|null;edition:string;address:string;state:"online"|"offline"|"unknown";lastSeen:string;isDemo?:boolean;enabled?:boolean};
type ManagedDeviceRecord = {id:string;name:string;location:string|null;edition:string;enabled:boolean;isDemo:boolean;connectionState:"unknown"|"reachable"|"unreachable";lastConnectionCheckAt:string|null};
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
 {id:"app-settings",label:"Application Settings",icon:"settings"}
];
const titles:Record<Page,string>=Object.fromEntries([...hubNav,...siteNav,...adminNav].map(x=>[x.id,x.label])) as Record<Page,string>;
const descriptions:Record<string,string>={
 overview:"A centralized view of your managed firewall sites",
 sites:"Review registered firewalls and open an individual site workspace",
 connectivity:"A consolidated view of site reachability and network health",
 alerts:"Review operational events and issues across all managed sites",
 "hub-settings":"Configure global Hub Manager preferences",
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
 audit:"Review security-relevant activity and administrative events",
 "app-settings":"Application preferences, security and system configuration"
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
 useEffect(()=>{let active=true;(async()=>{try{const status=await fetch("/api/v1/auth/status",{credentials:"same-origin"});const body=await status.json();if(!active)return;if(body.data?.setupRequired){setAuthMode("setup");return;}const me=await fetch("/api/v1/auth/me",{credentials:"same-origin"});if(!active)return;if(me.ok){const result=await me.json();setAuthUser(result.data?.username??"Administrator");setAuthMode("ready");}else setAuthMode("login");}catch{if(active)setAuthMode("login");}})();return()=>{active=false;}},[]);
 const [page,setPage]=useState<Page>("overview");
 const [selected,setSelected]=useState<Device|null>(null);
 const [menuOpen,setMenuOpen]=useState(false);
 const [query,setQuery]=useState("");
 const [dialog,setDialog]=useState<"add-site"|"edit-site"|"archive-site"|"profile"|"none">("none");
 const {notify}=useToast();
 const [toggleStates,setToggleStates]=useState<Record<string,boolean>>({"Automatic polling":true,"Email notifications":false,"Require confirmation":true});
 const [filter,setFilter]=useState("All");
 const [refreshCount,setRefreshCount]=useState(0);
 const [formName,setFormName]=useState("");
 const [formLocation,setFormLocation]=useState("");
 const [formEdition,setFormEdition]=useState<"plus"|"ce">("ce");
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
 const [editingSite,setEditingSite]=useState<{id:string;name:string;location:string|null;edition:"plus"|"ce";apiBaseUrl:string}|null>(null);
 const [editName,setEditName]=useState("");
 const [editLocation,setEditLocation]=useState("");
 const [editEdition,setEditEdition]=useState<"plus"|"ce">("ce");
 const [editApiBaseUrl,setEditApiBaseUrl]=useState("");
 const [archiveTarget,setArchiveTarget]=useState<Device|null>(null);
 const [archiveConfirmation,setArchiveConfirmation]=useState("");
 const [siteActionBusy,setSiteActionBusy]=useState(false);
 const [siteActionError,setSiteActionError]=useState("");
 const [mobileTab,setMobileTab]=useState("Overview");
 useEffect(()=>{if(authMode!=="ready")return;let active=true;apiRequest<ManagedDeviceRecord[]>("/api/v1/devices").then(records=>{if(!active)return;setLocalSites(records.map(record=>({id:record.id,name:record.name,location:record.location,edition:record.edition==="plus"?"Plus":record.edition==="ce"?"CE":"Unknown",address:"Not configured",state:record.connectionState==="reachable"?"online":record.connectionState==="unreachable"?"offline":"unknown",lastSeen:record.isDemo?"Development sample · not connected":record.lastConnectionCheckAt?new Date(record.lastConnectionCheckAt).toLocaleString():"Awaiting verified status",isDemo:record.isDemo,enabled:record.enabled})));}).catch(error=>{if(active)notify(error instanceof Error?error.message:"Unable to load managed sites.","error");});return()=>{active=false;};},[authMode]);
 const filteredSites=useMemo(()=>localSites.filter(s=>filter==="All"||s.state===filter.toLowerCase()),[localSites,filter]);
 const hubPaths:Record<string,string>={overview:"/",sites:"/sites",connectivity:"/connectivity",alerts:"/alerts","hub-settings":"/settings/hub",users:"/settings/users",audit:"/settings/audit","app-settings":"/settings/application"};
 const siteSegments:Record<string,string>={overview:"overview",monitoring:"monitoring",interfaces:"interfaces",rules:"rules",aliases:"aliases",nat:"nat",routing:"routing",gateways:"gateways",dhcp:"dhcp",dns:"dns",services:"services",certificates:"certificates",vpn:"vpn",compatibility:"compatibility","site-settings":"settings"};
 const segmentPages:Record<string,Page>=Object.fromEntries(Object.entries(siteSegments).map(([key,value])=>[value,key as Page]));
 function go(id:Page){setPage(id);setMenuOpen(false);setQuery("");routerNavigate(selected?"/sites/"+selected.id+"/"+(siteSegments[id]??"overview"):(hubPaths[id]??"/"));}
 function openSite(d:Device){setSelected(d);setPage("overview");setMenuOpen(false);routerNavigate("/sites/"+d.id+"/overview");}
 function backHub(){setSelected(null);setPage("overview");routerNavigate("/");}
 useEffect(()=>{const parts=location.pathname.split("/").filter(Boolean);if(parts[0]==="sites"&&parts.length>=2){const nextPage=segmentPages[parts[2]??"overview"]??"overview";setPage(nextPage);const found=localSites.find(site=>site.id===parts[1]);if(found)setSelected(found);else if(localSites.length)setSelected(null);return;}const hubPage:Record<string,Page>={"/":"overview","/sites":"sites","/connectivity":"connectivity","/alerts":"alerts","/settings/hub":"hub-settings","/settings/users":"users","/settings/audit":"audit","/settings/application":"app-settings"};setPage(hubPage[location.pathname]??"overview");setSelected(null);},[location.pathname,localSites]);
 async function refresh(){try{const records=await apiRequest<ManagedDeviceRecord[]>("/api/v1/devices");setLocalSites(records.map(record=>({id:record.id,name:record.name,location:record.location,edition:record.edition==="plus"?"Plus":record.edition==="ce"?"CE":"Unknown",address:"Not configured",state:record.connectionState==="reachable"?"online":record.connectionState==="unreachable"?"offline":"unknown",lastSeen:record.isDemo?"Development sample · not connected":record.lastConnectionCheckAt?new Date(record.lastConnectionCheckAt).toLocaleString():"Awaiting verified status",isDemo:record.isDemo,enabled:record.enabled})));setRefreshCount(x=>x+1);notify("Managed-site inventory refreshed from the Hub API.","success");}catch(error){notify(error instanceof Error?error.message:"Unable to refresh managed-site inventory.","error");}}
 async function openEditSite(site:Device){setSiteActionError("");setSiteActionBusy(true);try{const profile=await apiRequest<{id:string;name:string;location:string|null;edition:"plus"|"ce";apiBaseUrl:string}>(`/api/v1/devices/${site.id}/profile`);setEditingSite(profile);setEditName(profile.name);setEditLocation(profile.location??"");setEditEdition(profile.edition);setEditApiBaseUrl(profile.apiBaseUrl);setDialog("edit-site");}catch(error){notify(error instanceof Error?error.message:"Unable to load the site profile.","error");}finally{setSiteActionBusy(false);}}
 async function saveSiteProfile(e:React.FormEvent){e.preventDefault();if(!editingSite)return;setSiteActionError("");setSiteActionBusy(true);try{const updated=await apiRequest<{id:string;name:string;location:string|null;edition:"plus"|"ce";enabled:boolean}>(`/api/v1/devices/${editingSite.id}`,{method:"PATCH",body:JSON.stringify({name:editName,location:editLocation||null,edition:editEdition,apiBaseUrl:editApiBaseUrl})});setLocalSites(current=>current.map(site=>site.id===updated.id?{...site,name:updated.name,location:updated.location,edition:updated.edition==="plus"?"Plus":"CE"}:site));setSelected(current=>current?.id===updated.id?{...current,name:updated.name,location:updated.location,edition:updated.edition==="plus"?"Plus":"CE"}:current);setDialog("none");notify("Site profile updated.","success");}catch(error){setSiteActionError(error instanceof Error?error.message:"Unable to update the site profile.");}finally{setSiteActionBusy(false);}}
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
 const pageTitle=titles[page]??"Hub Overview";
 const isOverview=page==="overview";
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
    <div className="preview-banner"><span className="preview-dot"/> DEVELOPMENT ENVIRONMENT · DATABASE-BACKED SITE INVENTORY · READ-ONLY FIREWALL API</div>
    {isOverview&&!selected?<HubOverview sites={localSites} onOpen={openSite} onViewAll={()=>go("sites")} onConnectivity={()=>go("connectivity")} refreshCount={refreshCount}/>:selected&&page==="overview"?<SiteOverview device={selected} onNavigate={go}/>:page==="sites"?<SitesPage sites={filteredSites} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onOpen={openSite} onAdd={openAddSite} onEdit={openEditSite} onArchive={openArchiveSite}/>:page==="connectivity"?<Connectivity sites={localSites}/>:page==="alerts"?<Alerts onNavigate={go}/>:page==="users"?<UserManagement currentUsername={authUser}/>:page==="audit"?<AuditLog/>:page==="hub-settings"?<HubSettingsPage/>:page==="app-settings"?<SettingsPage title={pageTitle} toggles={toggleStates} setToggles={setToggleStates}/>:page==="monitoring"?<Monitoring/>:page==="compatibility"?<Compatibility device={selected}/>:page==="site-settings"?<SiteSettings device={selected} toggles={toggleStates} setToggles={setToggleStates} onEdit={()=>selected&&void openEditSite(selected)} onArchive={()=>selected&&openArchiveSite(selected)} onToggleEnabled={()=>selected&&void setSiteEnabled(selected)}/>:<DataPage page={page} query={query} setQuery={setQuery} onAdd={()=>notify("This is a frontend-only preview. No firewall configuration was changed.")} />}
   </div>
   <footer className="app-footer">pfSense Hub Manager <span>·</span> Development build <span>·</span> Read-only multi-site firewall onboarding</footer>
  </main>
  <nav className="mobile-bottom-nav">{(selected?[["Overview","grid"],["Monitoring","activity"],["Interfaces","network"],["Rules","shield"],["More","more"]]:[["Overview","grid"],["Sites","sites"],["Connectivity","network"],["Alerts","bell"],["Settings","settings"]]).map(([label,icon])=><button key={label} className={mobileTab===label?"selected":""} onClick={()=>{setMobileTab(label);const match=[...hubNav,...siteNav].find(x=>x.label.toLowerCase().startsWith(label.toLowerCase()));if(label==="More")setMenuOpen(true);else if(match)go(match.id)}}><Icon name={icon as IconName} size={18}/><span>{label}</span></button>)}</nav>
  {dialog!=="none"&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog("none")}}><section className="modal">{!createdDeviceId&&<button className="modal-close" disabled={formBusy||connectionTestBusy||certificateDiscoveryBusy} onClick={()=>setDialog("none")}><Icon name="close"/></button>}{dialog==="edit-site"&&editingSite?<><span className="eyebrow">SITE MANAGEMENT</span><h2>Edit site profile</h2><p>Update the Hub connection profile. These changes do not modify pfSense configuration.</p><form onSubmit={saveSiteProfile} className="site-onboarding-form"><div className="onboarding-grid"><label>Site name<input required maxLength={120} value={editName} onChange={e=>setEditName(e.target.value)}/></label><label>Location<input maxLength={120} value={editLocation} onChange={e=>setEditLocation(e.target.value)} placeholder="Optional"/></label><label>pfSense edition<select value={editEdition} onChange={e=>setEditEdition(e.target.value as "plus"|"ce")}><option value="ce">pfSense CE</option><option value="plus">pfSense Plus</option></select></label><label className="field-wide">HTTPS API origin<input required type="url" value={editApiBaseUrl} onChange={e=>setEditApiBaseUrl(e.target.value)} placeholder="https://192.168.10.1"/><small>HTTPS origin only. The API validates and constrains the destination.</small></label></div>{siteActionError&&<Feedback tone="error">{siteActionError}</Feedback>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={siteActionBusy} onClick={()=>setDialog("none")}>Cancel</button><button className="primary-button" type="submit" disabled={siteActionBusy}>{siteActionBusy?"Saving…":"Save changes"}</button></div></form></>:dialog==="archive-site"&&archiveTarget?<><span className="eyebrow">DANGER ZONE · SITE ARCHIVAL</span><h2>Archive {archiveTarget.name}?</h2><p>This removes the site from active inventory, disables it, and permanently purges its encrypted API credential and custom TLS trust material.</p><Feedback tone="warning">Polling history, existing alerts, and append-only audit records will be retained. This action cannot be reversed through the current interface.</Feedback><label>Type ARCHIVE to confirm<input value={archiveConfirmation} onChange={e=>setArchiveConfirmation(e.target.value)} autoComplete="off" placeholder="ARCHIVE"/></label>{siteActionError&&<Feedback tone="error">{siteActionError}</Feedback>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={siteActionBusy} onClick={()=>setDialog("none")}>Cancel</button><button type="button" className="primary-button danger-button" disabled={siteActionBusy||archiveConfirmation!=="ARCHIVE"} onClick={()=>void archiveSite()}>{siteActionBusy?"Archiving…":"Archive site"}</button></div></>:dialog==="add-site"?createdDeviceId?<><span className="eyebrow">SITE ONBOARDING</span><h2>Site registered</h2><p>{formName} has been saved in the Hub. Credentials are stored encrypted and are not displayed again.</p>{connectionTestResult&&<Feedback tone={(connectionTestResult.startsWith("Connection successful")||connectionTestResult.startsWith("Connection verified")||connectionTestResult.startsWith("Custom CA trust was saved"))?"success":"warning"}>{connectionTestResult}</Feedback>}<div className="modal-actions"><button type="button" className="primary-button" onClick={()=>{setDialog("none");setCreatedDeviceId("");}}>OK</button></div></>:<><span className="eyebrow">SITE ONBOARDING · ADMINISTRATOR</span><h2>Add a firewall site</h2><p>Register the HTTPS API endpoint and credentials for this firewall. The Hub will not change firewall configuration.</p><form onSubmit={addSite} className="site-onboarding-form">
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
  {sites.length===0?<div className="empty-state"><strong>No managed sites registered</strong><span>Seed development sample sites or register a real firewall.</span></div>:<div className="site-rows">{sites.slice(0,3).map(site=><div className="site-row" key={site.id}><div className="site-symbol"><Icon name="building" size={23}/></div><div className="site-main"><strong>{site.name}</strong><span>{site.location??"Location not specified"}</span><small>{site.isDemo?"Development sample":"Managed device"} · {site.edition}</small></div><Status state={site.state} label={site.state==="unknown"?"Not verified":site.state}/><div className="site-last">{site.lastSeen}</div><button className="row-link" disabled={site.isDemo} onClick={()=>onOpen(site)}>{site.isDemo?"Demo record":"Open site"} <Icon name="chevron" size={14}/></button></div>)}</div>}
 </Panel><Panel title="Inventory health"><div className="health-summary"><div className="health-ring"><strong>{sites.length?Math.round((online+offline)/sites.length*100):0}%</strong></div><div><strong>{unknown?"Verification pending":"Inventory checked"}</strong><span>{online+offline} of {sites.length} sites have a verified connection state</span></div></div><div className="health-legend"><div><i className="legend-green"/>Reachable <b>{online}</b></div><div><i className="legend-orange"/>Unreachable <b>{offline}</b></div><div><i className="legend-orange"/>Unverified <b>{unknown}</b></div></div><button className="text-button" onClick={onConnectivity}>View connectivity <Icon name="chevron" size={15}/></button></Panel></div>
 <Feedback tone="info">This dashboard reflects the managed-device database inventory. A site is counted online or offline only after a verified connectivity check. Seeded demonstration records remain unknown.</Feedback></>;
}
function SiteOverview({device,onNavigate}:{device:Device;onNavigate:(p:Page)=>void}){
 if(device.isDemo)return <><div className="page-heading"><div><h1>{device.name}</h1><p>{device.location??"Location not specified"} · Development sample</p></div><Status state="unknown" label="Not connected"/></div><Feedback tone="warning">This is a seeded demonstration record. It has no firewall credentials, no reachable endpoint, and no live telemetry. Configure a real connection before opening monitoring or firewall management.</Feedback><Panel title="Sample site details"><dl className="detail-list"><div><dt>pfSense edition</dt><dd>{device.edition}</dd></div><div><dt>Connection address</dt><dd>Not configured</dd></div><div><dt>Connection state</dt><dd>Unknown, not checked</dd></div><div><dt>Last check</dt><dd>Never</dd></div></dl><button className="secondary-button" onClick={()=>onNavigate("site-settings")}>View site settings</button></Panel></>;
 return <><div className="page-heading"><div><h1>{device.name}</h1><p>{device.location??"Location not specified"}</p></div><Status state={device.state}/></div><Feedback tone="info">Live device detail integration is not yet available for this record. No telemetry is displayed on this page.</Feedback><Panel title="Device profile"><dl className="detail-list"><div><dt>pfSense edition</dt><dd>{device.edition}</dd></div><div><dt>Connection address</dt><dd>{device.address}</dd></div><div><dt>Connection state</dt><dd>{device.state}</dd></div><div><dt>Last check</dt><dd>{device.lastSeen}</dd></div></dl><button className="secondary-button" onClick={()=>onNavigate("compatibility")}>View compatibility</button></Panel></>;
}
function SitesPage({sites,query,setQuery,filter,setFilter,onOpen,onAdd,onEdit,onArchive}:{sites:Device[];query:string;setQuery:(v:string)=>void;filter:string;setFilter:(v:string)=>void;onOpen:(d:Device)=>void;onAdd:()=>void;onEdit:(d:Device)=>void;onArchive:(d:Device)=>void}){
 const columns=[{id:"name",header:"Site",sortable:true,value:(s:Device)=>s.name,accessor:(s:Device)=><strong>{s.name}</strong>},{id:"location",header:"Location",sortable:true,value:(s:Device)=>s.location??"",accessor:(s:Device)=>s.location??"Not specified"},{id:"edition",header:"Edition",sortable:true,value:(s:Device)=>s.edition,accessor:(s:Device)=>"pfSense "+s.edition},{id:"status",header:"Connection",sortable:true,value:(s:Device)=>s.state,accessor:(s:Device)=><Status state={s.state} label={s.state==="unknown"?"Not verified":s.state}/>},{id:"lastSeen",header:"Last check",sortable:true,value:(s:Device)=>s.lastSeen,accessor:(s:Device)=>s.lastSeen}];
 return <><div className="page-heading"><div><h1>Managed Sites</h1><p>Registered firewall locations and their verified manager status</p></div><button className="primary-button" onClick={onAdd}><Icon name="plus"/> Add Site</button></div>
 <ListToolbar search={query} onSearch={setQuery} placeholder="Search sites, locations or edition" filters activeCount={filter==="All"?0:1} onClear={()=>setFilter("All")} chips={filter==="All"?[]:[{label:"Status: "+filter,onRemove:()=>setFilter("All")}]}>
  <label>Connection status<select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option><option>Online</option><option>Offline</option><option>Unknown</option></select></label>
 </ListToolbar>
 <Panel title="Managed site inventory" action={<span className="subtle">{sites.length} sites</span>}>
  <DataTable rows={sites} columns={columns} getRowId={s=>s.id} searchableText={s=>[s.name,s.location??"",s.edition,s.lastSeen].join(" ")} search={query} emptyTitle="No sites match these filters" emptyDescription="Change the search or clear the selected filters." pageSize={25} actions={s=><div className="ui-mobile-record-actions"><button className="secondary-button" onClick={()=>onOpen(s)} disabled={s.isDemo}>Open</button><button className="secondary-button" onClick={()=>onEdit(s)} disabled={s.isDemo}>Edit</button><button className="secondary-button danger-button" onClick={()=>onArchive(s)} disabled={s.isDemo}>Archive</button></div>} mobileCard={s=><><div className="ui-mobile-record-head"><div className="ui-mobile-record-title"><strong>{s.name}</strong><small>{s.location??"Location not specified"}</small></div><Status state={s.state} label={s.state==="unknown"?"Not verified":s.state}/></div><div className="ui-mobile-record-meta"><div><span>Edition</span><strong>pfSense {s.edition}</strong></div><div><span>Last check</span><strong>{s.lastSeen}</strong></div></div><div className="ui-mobile-record-actions"><button className="secondary-button" onClick={()=>onOpen(s)} disabled={s.isDemo}>Open</button><button className="secondary-button" onClick={()=>onEdit(s)} disabled={s.isDemo}>Edit</button><button className="secondary-button danger-button" onClick={()=>onArchive(s)} disabled={s.isDemo}>Archive</button></div></>}/>
 </Panel><p className="preview-footnote">Demo sites are disabled sample records. Their connection state remains unverified until real credentials and connectivity checks are configured.</p></>;
}
function Connectivity({sites}:{sites:Device[]}){
 const [search,setSearch]=useState("");const [stateFilter,setStateFilter]=useState("all");
 const online=sites.filter(s=>s.state==="online").length;const offline=sites.filter(s=>s.state==="offline").length;const unknown=sites.filter(s=>s.state==="unknown").length;
 const visible=sites.filter(s=>(stateFilter==="all"||s.state===stateFilter)&&[s.name,s.location??"",s.edition,s.lastSeen].join(" ").toLowerCase().includes(search.toLowerCase()));
 const columns=[{id:"site",header:"Site",sortable:true,value:(s:Device)=>s.name,accessor:(s:Device)=><strong>{s.name}</strong>},{id:"location",header:"Location",sortable:true,value:(s:Device)=>s.location??"",accessor:(s:Device)=>s.location??"Not specified"},{id:"edition",header:"Edition",sortable:true,value:(s:Device)=>s.edition,accessor:(s:Device)=>s.edition},{id:"state",header:"Connection",sortable:true,value:(s:Device)=>s.state,accessor:(s:Device)=><Status state={s.state} label={s.state==="unknown"?"Not verified":s.state}/>},{id:"check",header:"Last check",sortable:true,value:(s:Device)=>s.lastSeen,accessor:(s:Device)=>s.lastSeen}];
 return <><div className="page-heading"><div><h1>Connectivity</h1><p>Verified reachability state for registered sites</p></div></div><div className="metric-grid"><Metric icon="wifi" label="Connected sites" value={String(online)} detail="Verified reachable" tone="green"/><Metric icon="alert" label="Disconnected" value={String(offline)} detail="Verified unreachable" tone="orange"/><Metric icon="clock" label="Unknown" value={String(unknown)} detail="No verified check yet" tone="blue"/></div>
 <ListToolbar search={search} onSearch={setSearch} placeholder="Search sites or locations" filters activeCount={stateFilter==="all"?0:1} onClear={()=>setStateFilter("all")} chips={stateFilter==="all"?[]:[{label:"Connection: "+stateFilter,onRemove:()=>setStateFilter("all")}]}>
  <label>Connection state<select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}><option value="all">All states</option><option value="online">Online</option><option value="offline">Offline</option><option value="unknown">Unknown</option></select></label>
 </ListToolbar><Panel title="Site connectivity" action={<span className="subtle">{visible.length} sites</span>}><DataTable rows={visible} columns={columns} getRowId={s=>s.id} pageSize={25} emptyTitle="No sites match these filters" emptyDescription="Change the search or clear the selected filter."/></Panel><Feedback tone="info">Unknown means the connection has not been verified, not that the firewall is offline. Seeded demo records are never probed.</Feedback></>;
}
type ApiUser={id:string;username:string;role:"admin"|"user";isActive:boolean;createdAt:string;updatedAt:string};
type ApiAlert={id:string;severity:"critical"|"warning"|"info";title:string;message:string;source:string;resourceType?:string;resourceId?:string;status:"active"|"acknowledged"|"resolved";firstSeenAt:string;lastSeenAt:string;occurrenceCount:number};
type AuditRecord={id:number;occurredAt:string;actorUsername:string|null;actorType:string;action:string;outcome:string;targetType:string|null;targetId:string|null;summary:string;requestId:string|null};
async function apiRequest<T>(url:string,init?:RequestInit):Promise<T>{const headers=new Headers(init?.headers);if(init?.body!==undefined&&init.body!==null&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");const response=await fetch(url,{credentials:"same-origin",...init,headers});const body=await response.json().catch(()=>({}));if(!response.ok){const message=body.error?.message??"The request could not be completed.";const diagnosticCode=body.error?.diagnosticCode;throw new Error(typeof diagnosticCode==="string"?`${message} (${diagnosticCode})`:message);}return body.data as T;}
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
function SettingsPage({title,toggles,setToggles}:{title:string;toggles:Record<string,boolean>;setToggles:Dispatch<SetStateAction<Record<string,boolean>>>}){return <><div className="page-heading"><div><h1>{title}</h1><p>Application preferences and operational defaults</p></div></div><div className="settings-grid"><Panel title="General"><div className="settings-row"><div><strong>Application name</strong><span>pfSense Hub Manager</span></div><button className="secondary-button" onClick={()=>alert("Name editing will be added during settings integration.")}>Edit</button></div><div className="settings-row"><div><strong>Display timezone</strong><span>Browser local timezone</span></div><button className="secondary-button" onClick={()=>alert("Timezone selection is a preview interaction.")}>Change</button></div></Panel><Panel title="Preferences">{Object.entries(toggles).map(([name,value])=><div className="settings-row" key={name}><div><strong>{name}</strong><span>{name==="Automatic polling"?"Refresh site status on a schedule":name==="Email notifications"?"Send notifications for important events":"Ask before consequential actions"}</span></div><button role="switch" aria-checked={value} className={"switch "+(value?"on":"")} onClick={()=>setToggles(s=>({...s,[name]:!s[name]}))}><i/></button></div>)}</Panel></div></>}
function SiteSettings({device,toggles,setToggles,onEdit,onArchive,onToggleEnabled}:{device:Device|null;toggles:Record<string,boolean>;setToggles:React.Dispatch<React.SetStateAction<Record<string,boolean>>>;onEdit:()=>void;onArchive:()=>void;onToggleEnabled:()=>void}){return <><div className="page-heading"><div><h1>Site Settings</h1><p>Connection profile and local site preferences</p></div></div><Panel title="Device profile"><dl className="detail-list"><div><dt>Site name</dt><dd>{device?.name}</dd></div><div><dt>Edition</dt><dd>pfSense {device?.edition}</dd></div><div><dt>Connection address</dt><dd>{device?.address}</dd></div><div><dt>Connection state</dt><dd>{device?.state}</dd></div><div><dt>Manager polling</dt><dd>{device?.enabled===false?"Disabled":"Enabled"}</dd></div></dl><div className="modal-actions"><button className="secondary-button" onClick={onEdit} disabled={!device||device.isDemo}>Edit profile</button><button className="secondary-button" onClick={onToggleEnabled} disabled={!device||device.isDemo}>{device?.enabled===false?"Enable site":"Disable site"}</button><button className="secondary-button danger-button" onClick={onArchive} disabled={!device||device.isDemo}>Archive site</button></div></Panel><SettingsPage title="Site preferences" toggles={toggles} setToggles={setToggles}/></>}
function Monitoring(){return <><div className="page-heading"><div><h1>Monitoring</h1><p>Performance trends and system health</p></div><button className="secondary-button" onClick={()=>alert("Time range selector preview")}>Last 24 hours⌄</button></div><div className="metric-grid"><Metric icon="cpu" label="CPU average" value="18%" detail="Illustrative value" tone="blue"/><Metric icon="database" label="Memory used" value="42%" detail="Illustrative value" tone="green"/><Metric icon="harddrive" label="Disk used" value="28%" detail="Illustrative value" tone="purple"/><Metric icon="clock" label="Uptime" value="12d 6h" detail="Illustrative value" tone="green"/></div><Panel title="Resource utilization"><div className="chart-placeholder"><div><span>CPU</span><svg viewBox="0 0 600 130" preserveAspectRatio="none"><polyline points="0,100 40,92 80,98 120,70 160,76 200,65 240,80 280,48 320,55 360,43 400,60 440,38 480,42 520,22 560,30 600,12"/></svg></div><div><span>Memory</span><svg viewBox="0 0 600 130" preserveAspectRatio="none"><polyline points="0,72 40,68 80,72 120,60 160,66 200,52 240,58 280,48 320,53 360,42 400,48 440,36 480,40 520,32 560,38 600,28"/></svg></div></div></Panel><p className="preview-footnote">Trend lines are visual placeholders, not collected metrics.</p></>}
function Compatibility({device}:{device:Device|null}){return <><div className="page-heading"><div><h1>Compatibility</h1><p>Firewall release, API package and capability support</p></div></div><Panel title="Device compatibility"><dl className="detail-list"><div><dt>Device</dt><dd>{device?.name??"Selected site"}</dd></div><div><dt>pfSense edition</dt><dd>{device?.edition??"Plus"}</dd></div><div><dt>Installed release</dt><dd>Not verified in preview</dd></div><div><dt>REST API package</dt><dd>Not verified in preview</dd></div><div><dt>Architecture</dt><dd>Pending live discovery</dd></div></dl></Panel><Panel title="Capability status"><div className="capability-list">{["System status","Gateway status","Interface status","Service status","pfSense version","ARP summary","Firewall states summary","State table size"].map(x=><div key={x}><span>{x}</span><Status state="warning" label="Integration pending"/></div>)}</div></Panel></>}
function DataPage({page,query,setQuery,onAdd}:{page:Page;query:string;setQuery:(s:string)=>void;onAdd:()=>void}){
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
function HubSettingsPage(){
 const {notify}=useToast();
 const [method,setMethod]=useState<"local"|"tailscale"|"hostname">("local");const [addressType,setAddressType]=useState<"magic_dns"|"tailscale_ip"|"hostname"|"ip">("magic_dns");const [address,setAddress]=useState("");const [port,setPort]=useState("443");const [busy,setBusy]=useState(true);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 useEffect(()=>{let active=true;fetch("/api/v1/hub-settings",{credentials:"same-origin"}).then(async r=>{if(!r.ok)throw new Error("Unable to load Hub settings.");return r.json();}).then(result=>{if(!active)return;const d=result.data??{};setMethod(d.reachabilityMethod??"local");setAddressType(d.addressType??"magic_dns");setAddress(d.address??"");setPort(String(d.httpsPort??443));}).catch(e=>{if(active)setMessage(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;}},[]);
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setMessage("");try{const response=await fetch("/api/v1/hub-settings",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({reachabilityMethod:method,addressType:method==="local"?null:addressType,address:method==="local"?null:address.trim(),httpsPort:Number(port)})});const result=await response.json();if(!response.ok)throw new Error(result.error?.message??"Unable to save settings.");const success=result.data?.note??"Preferences saved.";setMessage(success);notify(success,"success");}catch(err){const message=err instanceof Error?err.message:"Unable to save settings.";setMessage(message);notify(message,"error");}finally{setSaving(false);}}
 return <><div className="page-heading"><div><h1>Hub Settings</h1><p>Configure how administrators may reach this Hub installation.</p></div></div><form onSubmit={save} className="settings-grid"><Panel title="Reachability"><div className="reachability-options"><label className="reachability-option"><input type="radio" name="reachability" checked={method==="local"} onChange={()=>setMethod("local")}/><span><strong>Local network (default)</strong><small>Use the local machine or network address. No additional networking service is required.</small></span></label><label className="reachability-option"><input type="radio" name="reachability" checked={method==="tailscale"} onChange={()=>{setMethod("tailscale");if(!["magic_dns","tailscale_ip"].includes(addressType))setAddressType("magic_dns");}}/><span><strong>Tailscale (optional)</strong><small>Use your existing tailnet when you need to reach this Hub remotely. Tailscale is not required for normal local use.</small></span></label><label className="reachability-option"><input type="radio" name="reachability" checked={method==="hostname"} onChange={()=>{setMethod("hostname");if(!["hostname","ip"].includes(addressType))setAddressType("hostname");}}/><span><strong>Other hostname or IP</strong><small>For an existing DNS name or network address managed outside Hub Manager.</small></span></label></div>{method!=="local"&&<><label>Address type<select value={addressType} onChange={e=>setAddressType(e.target.value as typeof addressType)}>{method==="tailscale"?<><option value="magic_dns">Tailscale MagicDNS hostname</option><option value="tailscale_ip">Tailscale IP address</option></>:<><option value="hostname">Hostname</option><option value="ip">IP address</option></>}</select></label><label>{addressType==="magic_dns"?"MagicDNS hostname":addressType==="tailscale_ip"?"Tailscale IPv4 address":addressType==="hostname"?"Hostname":"IP address"}<input value={address} onChange={e=>setAddress(e.target.value)} placeholder={addressType==="magic_dns"?"main-firewall.example-tailnet.ts.net":addressType==="tailscale_ip"?"100.90.12.34":addressType==="hostname"?"hub.example.com":"192.168.1.20"}/><small>{addressType==="magic_dns"?"Example: main-firewall.example-tailnet.ts.net. MagicDNS resolves a device name to its Tailscale address.":addressType==="tailscale_ip"?"Example: 100.90.12.34. This is the numerical address assigned to the device on your tailnet.":"Enter an address already configured in your network or DNS."}</small></label></>}<label>HTTPS port<input type="number" min="1" max="65535" value={port} onChange={e=>setPort(e.target.value)}/></label></Panel><Panel title="Configuration status"><div className="info-strip"><Icon name="alert"/><span>These are saved preferences only. Saving does not install Tailscale, change Docker port bindings, configure DNS, or verify remote reachability.</span></div><p className="subtle">Local access remains the default. Optional networking fields can be left untouched until you need them.</p>{message&&<div className="settings-message" role="status">{message}</div>}<button className="primary-button" disabled={busy||saving}>{saving?"Saving…":"Save preferences"}</button></Panel></form></>;
}
