import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastKind = "success" | "info" | "warning" | "error";
type ToastRecord = { id:number; message:string; kind:ToastKind };
type ToastContextValue = { notify:(message:string,kind?:ToastKind)=>void; dismiss:(id:number)=>void };
const ToastContext=createContext<ToastContextValue|null>(null);
const durations:Record<ToastKind,number>={success:3000,info:4000,warning:5000,error:7000};

export function ToastProvider({children}:{children:ReactNode}){
 const [items,setItems]=useState<ToastRecord[]>([]);
 const sequence=useRef(0);
 const dismiss=useCallback((id:number)=>setItems(current=>current.filter(item=>item.id!==id)),[]);
 const notify=useCallback((message:string,kind:ToastKind="info")=>{
  const id=++sequence.current;
  setItems(current=>[...current,{id,message,kind}].slice(-5));
 },[]);
 return <ToastContext.Provider value={{notify,dismiss}}>
  {children}
  <div className="global-toast-region" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
   {items.map(item=><ToastItem key={item.id} item={item} onDismiss={dismiss}/>)}
  </div>
 </ToastContext.Provider>;
}

function ToastItem({item,onDismiss}:{item:ToastRecord;onDismiss:(id:number)=>void}){
 const [paused,setPaused]=useState(false);
 useEffect(()=>{
  if(paused)return;
  const timer=window.setTimeout(()=>onDismiss(item.id),durations[item.kind]);
  return()=>window.clearTimeout(timer);
 },[item.id,item.kind,onDismiss,paused]);
 return <div className={"global-toast global-toast-"+item.kind} role={item.kind==="error"?"alert":"status"} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)}>
  <span className="global-toast-mark" aria-hidden="true">{item.kind==="success"?"✓":item.kind==="error"?"!":item.kind==="warning"?"⚠":"i"}</span>
  <span className="global-toast-message">{item.message}</span>
  <button type="button" className="global-toast-close" aria-label="Dismiss notification" onClick={()=>onDismiss(item.id)}>×</button>
 </div>;
}

export function useToast(){
 const context=useContext(ToastContext);
 if(!context)throw new Error("useToast must be used within ToastProvider");
 return context;
}
