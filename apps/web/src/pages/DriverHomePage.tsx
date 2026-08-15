import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";

type Assignment={id:string;status:string;handoverConfirmed?:boolean;startAt?:string;vehicle:{registrationNumber:string;fleetNumber?:string|null;make:string;model:string;status:string}};
type Trip={id:string;tripNumber:string;status:string;origin:string;destination:string;requestedDeparture:string;expectedReturn?:string;vehicle?:{registrationNumber:string}|null};
const tripSteps=["ALLOCATED","PRE_TRIP_INSPECTION","READY_TO_DEPART","ACTIVE","RETURNED","POST_TRIP_INSPECTION","CLOSED"];

export function DriverHomePage(){
  const{me}=useAuth();
  const[assignments,setAssignments]=useState<Assignment[]>([]),[trips,setTrips]=useState<Trip[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{void Promise.all([api<{items:Assignment[]}>("/assignments"),api<{items:Trip[]}>("/trips")]).then(([a,t])=>{setAssignments(a.items);setTrips(t.items);}).catch(e=>setError(e instanceof Error?e.message:"Unable to load driver operations.")).finally(()=>setLoading(false));},[]);
  const activeAssignment=assignments.find(a=>a.status==="ACTIVE");
  const currentTrip=useMemo(()=>trips.find(t=>["ALLOCATED","PRE_TRIP_INSPECTION","READY_TO_DEPART","ACTIVE","RETURNED","POST_TRIP_INSPECTION"].includes(t.status))??trips.find(t=>t.status==="APPROVED")??trips[0],[trips]);
  const nextTrips=useMemo(()=>trips.filter(t=>!["CLOSED","CANCELLED","REJECTED"].includes(t.status)).slice(0,3),[trips]);
  const stepIndex=currentTrip?Math.max(0,tripSteps.indexOf(currentTrip.status)):0;
  const moveBlocked=activeAssignment? ["GROUNDED","BREAKDOWN","ACCIDENT","UNDER_MAINTENANCE","OUT_OF_SERVICE","DISPOSED"].includes(activeAssignment.vehicle.status):true;
  if(loading)return <div className="loading-state-v2"><span className="loading-ring"/><b>Loading driver workspace…</b><span>Checking your vehicle and authorized movements.</span></div>;

  return <>
    <section className="driver-mobile-hero-v2"><div className="driver-welcome-v2"><span className="eyebrow-v2">DRIVER OPERATIONS · MOBILE WORKSPACE</span><h2>Welcome, {me?.fullName}</h2><p>Only approved fleet movements appear here. Never move a truck until the required assignment, trip and inspection controls are complete.</p></div><div className={`driver-move-state-v2 ${moveBlocked?"blocked":"ready"}`}><span><Icon name={moveBlocked?"alert":"shield"} size={18}/></span><div><b>{moveBlocked?"Movement not cleared":"Vehicle control active"}</b><small>{moveBlocked?"Check assignment and vehicle status before any movement":"Follow the trip safety gate before departure"}</small></div></div></section>
    {error&&<div className="error-box">{error}</div>}

    <div className="driver-home-grid-v2">
      <section className="driver-current-vehicle-v2"><div className="driver-card-title-v2"><span className="panel-kicker">MY CURRENT VEHICLE</span><Link to="/assignments">Open full assignment <Icon name="arrow" size={13}/></Link></div>{activeAssignment?<><div className="driver-current-truck-v2"><span className="truck-hero-icon-v2"><Icon name="vehicle" size={30}/></span><div><h3>{activeAssignment.vehicle.registrationNumber}</h3><p>{activeAssignment.vehicle.make} {activeAssignment.vehicle.model}</p><span>{activeAssignment.vehicle.fleetNumber||"Fleet number not set"}</span></div><span className={`status-pill-v2 s-${activeAssignment.vehicle.status}`}><i/>{activeAssignment.vehicle.status.replaceAll("_"," ")}</span></div><div className="driver-current-facts-v2"><div><span>Handover</span><b>{activeAssignment.handoverConfirmed?"Confirmed":"Pending"}</b></div><div><span>Assigned since</span><b>{activeAssignment.startAt?new Date(activeAssignment.startAt).toLocaleDateString():"—"}</b></div></div></>:<div className="driver-card-empty-v2"><Icon name="vehicle" size={28}/><b>No vehicle assigned</b><span>Contact Fleet Management. A driver cannot allocate a truck to themselves.</span></div>}</section>
      <section className="driver-current-trip-v2"><div className="driver-card-title-v2"><span className="panel-kicker">CURRENT / NEXT TRIP</span><Link to="/trips">My trips <Icon name="arrow" size={13}/></Link></div>{currentTrip?<><div className="driver-trip-route-v2"><div><span>{currentTrip.tripNumber}</span><h3>{currentTrip.origin}<i>→</i>{currentTrip.destination}</h3><p>{new Date(currentTrip.requestedDeparture).toLocaleString()}</p></div><span className={`status-pill-v2 trip-${currentTrip.status}`}><i/>{currentTrip.status.replaceAll("_"," ")}</span></div><div className="driver-trip-progress-v2">{tripSteps.map((step,index)=><div key={step} className={index<=stepIndex?"done":""}><span>{index<stepIndex?"✓":index===stepIndex?"•":""}</span><small>{step.replaceAll("_"," ")}</small></div>)}</div></>:<div className="driver-card-empty-v2"><Icon name="trip" size={28}/><b>No authorized trip in your queue</b><span>Approved or allocated trips will appear here automatically.</span></div>}</section>
    </div>

    <section className="driver-action-grid-v2 driver-action-grid-v3">
      <Link to="/assignments"><span className="driver-action-icon-v2"><Icon name="vehicle"/></span><div><b>My Vehicle</b><small>Assignment, handover and vehicle status</small></div><Icon name="arrow" size={15}/></Link>
      <Link to="/trips"><span className="driver-action-icon-v2 blue"><Icon name="route"/></span><div><b>My Trips</b><small>Request, start, return and close movement</small></div><Icon name="arrow" size={15}/></Link>
      <Link to="/inspections"><span className="driver-action-icon-v2 amber"><Icon name="inspection"/></span><div><b>Start Inspection</b><small>Daily, pre-trip and post-trip roadworthiness</small></div><Icon name="arrow" size={15}/></Link>
      <Link to="/fuel"><span className="driver-action-icon-v2 fuel"><Icon name="gauge"/></span><div><b>My Fuel</b><small>Request fuel for your assigned vehicle and track approval</small></div><Icon name="arrow" size={15}/></Link>
      <Link to="/my-profile"><span className="driver-action-icon-v2 violet"><Icon name="profile"/></span><div><b>My Profile</b><small>Personal details and profile photo</small></div><Icon name="arrow" size={15}/></Link>
    </section>

    <section className="driver-safety-gate-v2"><div className="driver-safety-title-v2"><span><Icon name="shield"/></span><div><span className="panel-kicker">NO VEHICLE MOVES WITHOUT ACCOUNTABILITY</span><h3>Departure safety gate</h3></div></div><div className="driver-safety-steps-v2"><div className={activeAssignment?"done":""}><span>{activeAssignment?"✓":"1"}</span><div><b>Vehicle assigned</b><small>Fleet Management establishes accountability.</small></div></div><div className={currentTrip&&!["REQUESTED","APPROVED"].includes(currentTrip.status)?"done":""}><span>{currentTrip&&!["REQUESTED","APPROVED"].includes(currentTrip.status)?"✓":"2"}</span><div><b>Trip allocated</b><small>Approved movement is linked to a truck and driver.</small></div></div><div className={currentTrip&&["READY_TO_DEPART","ACTIVE","RETURNED","POST_TRIP_INSPECTION","CLOSED"].includes(currentTrip.status)?"done":""}><span>{currentTrip&&["READY_TO_DEPART","ACTIVE","RETURNED","POST_TRIP_INSPECTION","CLOSED"].includes(currentTrip.status)?"✓":"3"}</span><div><b>Pre-trip passed</b><small>Critical roadworthiness items must pass.</small></div></div><div className={currentTrip&&["ACTIVE","RETURNED","POST_TRIP_INSPECTION","CLOSED"].includes(currentTrip.status)?"done":""}><span>{currentTrip&&["ACTIVE","RETURNED","POST_TRIP_INSPECTION","CLOSED"].includes(currentTrip.status)?"✓":"4"}</span><div><b>Departure recorded</b><small>Starting odometer and controlled trip start.</small></div></div></div></section>
    {nextTrips.length>1&&<section className="panel-v2"><div className="panel-head-v2"><div><span className="panel-kicker">UPCOMING MOVEMENT</span><h3>My open trip queue</h3></div></div><div className="driver-trip-list-v2">{nextTrips.map(t=><Link to="/trips" key={t.id}><div><b>{t.tripNumber}</b><span>{t.origin} → {t.destination}</span></div><div><span>{new Date(t.requestedDeparture).toLocaleString()}</span><span className={`status-pill-v2 trip-${t.status}`}><i/>{t.status.replaceAll("_"," ")}</span></div></Link>)}</div></section>}
  </>;
}
