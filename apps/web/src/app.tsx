import { Navigate,Route,Routes,useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DriverHomePage } from "./pages/DriverHomePage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { DriversPage } from "./pages/DriversPage";
import { UsersPage } from "./pages/UsersPage";
import { BranchesPage } from "./pages/BranchesPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { AuditPage } from "./pages/AuditPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DriverProfilePage } from "./pages/DriverProfilePage";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { TripsPage } from "./pages/TripsPage";
import { InspectionsPage } from "./pages/InspectionsPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { FuelPage } from "./pages/FuelPage";
import { CompliancePage } from "./pages/CompliancePage";
import { ReportsPage } from "./pages/ReportsPage";

function Protected(){const{me,loading}=useAuth();const location=useLocation();if(loading)return <div className="loading-screen">Loading ACRILAND Fleet Command…</div>;if(!me)return <Navigate to="/login" replace/>;if(me.mustChangePassword&&location.pathname!=="/change-password")return <Navigate to="/change-password" replace/>;return <Shell/>;}
function Home(){const{me}=useAuth();return me?.roles.includes("DRIVER")?<DriverHomePage/>:<DashboardPage/>;}
export function App(){return <Routes><Route path="/login" element={<LoginPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/change-password" element={<ChangePasswordPage/>}/><Route element={<Protected/>}><Route index element={<Home/>}/><Route path="my-profile" element={<DriverProfilePage/>}/><Route path="vehicles" element={<VehiclesPage/>}/><Route path="drivers" element={<DriversPage/>}/><Route path="assignments" element={<AssignmentsPage/>}/><Route path="trips" element={<TripsPage/>}/><Route path="inspections" element={<InspectionsPage/>}/><Route path="maintenance" element={<MaintenancePage/>}/><Route path="fuel" element={<FuelPage/>}/><Route path="compliance" element={<CompliancePage/>}/><Route path="reports" element={<ReportsPage/>}/><Route path="users" element={<UsersPage/>}/><Route path="branches" element={<BranchesPage/>}/><Route path="departments" element={<DepartmentsPage/>}/><Route path="audit" element={<AuditPage/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
