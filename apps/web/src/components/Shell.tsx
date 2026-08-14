import { NavLink,Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const links=[
  ["/","Command Centre","dashboard.view"],["/vehicles","Vehicles","vehicle.view"],["/drivers","Drivers","driver.view"],["/users","Users","user.view"],["/branches","Branches","branch.view"],["/departments","Departments","department.view"],["/audit","Audit Log","audit.view"]
] as const;
export function Shell(){const{me,logout}=useAuth();return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">A</div><div><b>ACRILAND</b><span>Fleet Command</span></div></div><nav>{me?.roles.includes("DRIVER")&&<NavLink to="/my-profile">My Profile</NavLink>}{links.filter(([, ,p])=>me?.permissions.includes(p)).map(([to,label])=><NavLink key={to} to={to} end={to==="/"}>{label}</NavLink>)}</nav><div className="sidebar-foot"><div className="user-mini"><b>{me?.fullName}</b><span>{me?.roles.join(" · ")}</span></div><button className="ghost" onClick={()=>void logout()}>Sign out</button></div></aside><main><header className="topbar"><div><span className="eyebrow">ACRILAND LTD</span><h1>Fleet Command Centre</h1></div><div className="secure-pill">● Secure session</div></header><div className="page"><Outlet/></div></main></div>}
