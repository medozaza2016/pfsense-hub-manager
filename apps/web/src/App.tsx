import {useEffect,useState} from "react";
type Device={id:string;name:string;location:string|null;edition:string;enabled:boolean};
type Result<T>={data:T;meta?:{outcome?:string;failedOperations?:number;durationMs?:number};error?:{message:string}};
export default function App(){
 const [devices,setDevices]=useState<Device[]>([]),[status,setStatus]=useState("Connecting to manager API"),[busy,setBusy]=useState(false),[overview,setOverview]=useState<Record<string,unknown>|null>(null),[error,setError]=useState<string|null>(null);
 async function load(){try{const r=await fetch("/api/v1/devices");if(!r.ok)throw new Error("Manager API returned HTTP "+r.status);const body=await r.json() as Result<Device[]>;setDevices(body.data);setStatus("Manager API connected");setError(null);}catch(e){setStatus("Manager API unavailable");setError(e instanceof Error?e.message:"Unknown error");}}
 async function check(id:string){setBusy(true);setOverview(null);setError(null);try{const r=await fetch("/api/v1/devices/"+encodeURIComponent(id)+"/overview");const body=await r.json() as Result<Record<string,unknown>>;if(!r.ok&&!body.data)throw new Error(body.error?.message??"Collection failed");setOverview(body.data);if(body.meta?.outcome!=="success")setError("Collection partially failed. "+(body.meta?.failedOperations??0)+" operations failed.");}catch(e){setError(e instanceof Error?e.message:"Collection failed");}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 return <main className="shell"><header><div><p className="eyebrow">NETWORK OPERATIONS</p><h1>pfSense Hub Manager</h1><p className="subtitle">Centralized visibility across your firewall locations</p></div><div className="status"><span className={status.includes("connected")?"dot online":"dot"}/>{status}</div></header>
 <section className="panel"><div className="section-heading"><div><p className="eyebrow">INVENTORY</p><h2>Managed firewalls</h2></div><button onClick={()=>void load()}>Refresh</button></div>
 {devices.length===0?<p className="muted">No device inventory loaded yet.</p>:devices.map(d=><article className="device" key={d.id}><div><strong>{d.name}</strong><p>{d.location||"Location not set"} · pfSense {d.edition.toUpperCase()}</p></div><span className="pill">Configured</span><button disabled={busy} onClick={()=>void check(d.id)}>{busy?"Checking…":"Run read-only check"}</button></article>)}</section>
 {error&&<div className="notice">{error}</div>}
 {overview&&<section className="panel"><p className="eyebrow">LIVE API CHECK</p><h2>Read-only endpoint results</h2><pre>{JSON.stringify(overview,null,2)}</pre><p className="muted">ARP and firewall-state records are not returned or persisted, only aggregate counts when the API returns a list.</p></section>}
 <footer>Initial development build · Read-only firewall integration · Configuration changes disabled</footer></main>;
}
