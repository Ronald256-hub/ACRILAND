import { useEffect,useState } from "react";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
type A={id:string;action:string;recordType:string;recordId:string;reason?:string;ipAddress?:string;createdAt:string};
export function AuditPage(){const[items,setItems]=useState<A[]>([]),[error,setError]=useState("");useEffect(()=>{api<{items:A[]}>("/audit").then(r=>setItems(r.items)).catch(e=>setError(e.message));},[]);return <><div className="section-head"><div><span className="eyebrow">Accountability</span><h2>Audit trail</h2></div></div>{error&&<div className="error-box">{error}</div>}<div className="panel"><DataTable headers={["When","Action","Record","Reason","IP"]} rows={items.map(a=>[new Date(a.createdAt).toLocaleString(),<span className="badge">{a.action}</span>,`${a.recordType} · ${a.recordId.slice(0,8)}`,a.reason??"—",a.ipAddress??"—"])}/></div></>}
