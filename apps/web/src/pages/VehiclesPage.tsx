import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";

type Vehicle = {
  id: string;
  registrationNumber: string;
  fleetNumber?: string | null;
  vin: string;
  engineNumber?: string | null;
  make: string;
  model: string;
  variant?: string | null;
  category: string;
  bodyType?: string | null;
  manufacturingYear: number;
  registrationYear?: number | null;
  fuelType: string;
  transmission?: string | null;
  tankCapacityLitres?: string | number | null;
  currentOdometerKm: number;
  currentLocation?: string | null;
  status: string;
  branch?: { name: string } | null;
  department?: { name: string } | null;
};

const blocked = new Set(["GROUNDED", "BREAKDOWN", "ACCIDENT", "OUT_OF_SERVICE", "DISPOSED"]);
const service = new Set(["SERVICE_DUE", "SERVICE_OVERDUE", "UNDER_MAINTENANCE", "UNDER_INSPECTION"]);

export function VehiclesPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (search = query) => {
    setLoading(true); setError("");
    try {
      const result = await api<{ items: Vehicle[] }>(`/vehicles?limit=100${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`);
      setItems(result.items);
      if (selected) setSelected(result.items.find((item) => item.id === selected.id) ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load fleet register."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(""); }, []);

  const filtered = useMemo(() => statusFilter === "ALL" ? items : items.filter((item) => statusFilter === "ATTENTION" ? blocked.has(item.status) || service.has(item.status) : item.status === statusFilter), [items, statusFilter]);
  const stats = useMemo(() => ({
    available: items.filter((item) => item.status === "AVAILABLE").length,
    moving: items.filter((item) => item.status === "ON_TRIP").length,
    service: items.filter((item) => service.has(item.status)).length,
    blocked: items.filter((item) => blocked.has(item.status)).length
  }), [items]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    setError("");
    try {
      await api("/vehicles", { method: "POST", body: JSON.stringify({
        registrationNumber: f.get("registrationNumber"), fleetNumber: f.get("fleetNumber") || undefined,
        vin: f.get("vin"), engineNumber: f.get("engineNumber") || undefined, make: f.get("make"), model: f.get("model"),
        category: f.get("category"), manufacturingYear: Number(f.get("manufacturingYear")), fuelType: f.get("fuelType"),
        transmission: f.get("transmission") || undefined, tankCapacityLitres: f.get("tankCapacityLitres") ? Number(f.get("tankCapacityLitres")) : undefined,
        initialOdometerKm: Number(f.get("odometer") || 0), currentOdometerKm: Number(f.get("odometer") || 0), currentLocation: f.get("currentLocation") || undefined
      }) });
      form.reset(); setShowCreate(false); await load("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create vehicle."); }
  };

  return <>
    <section className="page-hero-v2 compact-hero-v2">
      <div><span className="eyebrow-v2">ASSET REGISTER · CONTROLLED MASTER DATA</span><h2>Vehicle Operations</h2><p>One operational record per truck: identity, ownership context, status, mileage and accountable movement.</p></div>
      {me?.permissions.includes("vehicle.create") && <button className="button-v2 primary" onClick={() => setShowCreate((value) => !value)}><Icon name={showCreate ? "close" : "plus"} size={16} />{showCreate ? "Close form" : "Add vehicle"}</button>}
    </section>

    {error && <div className="error-box">{error}</div>}

    <div className="mini-kpi-grid-v2">
      <div><span>Total fleet</span><b>{items.length}</b><small>Loaded fleet register</small></div>
      <div className="good"><span>Available</span><b>{stats.available}</b><small>Ready for controlled dispatch</small></div>
      <div className="info"><span>On trip</span><b>{stats.moving}</b><small>Authorized active movement</small></div>
      <div className="warning"><span>Service watch</span><b>{stats.service}</b><small>Due, inspection or workshop</small></div>
      <div className="danger"><span>Blocked</span><b>{stats.blocked}</b><small>Cannot be dispatched</small></div>
    </div>

    {showCreate && <form className="panel-v2 create-panel-v2" onSubmit={submit}>
      <div className="panel-head-v2"><div><span className="panel-kicker">NEW FLEET ASSET</span><h3>Register a vehicle</h3><p>Create the permanent fleet master record. Registration and VIN must be unique.</p></div></div>
      <div className="panel-body-v2 form-grid-v2">
        <label>Registration number<input name="registrationNumber" required placeholder="UAX 482Q" /></label>
        <label>Fleet number<input name="fleetNumber" placeholder="TRK-0048" /></label>
        <label>VIN / chassis<input name="vin" required /></label>
        <label>Engine number<input name="engineNumber" /></label>
        <label>Make<input name="make" required placeholder="Scania" /></label>
        <label>Model<input name="model" required placeholder="R450" /></label>
        <label>Category<input name="category" placeholder="Prime mover" required /></label>
        <label>Manufacturing year<input name="manufacturingYear" type="number" min="1950" max={new Date().getFullYear() + 1} required /></label>
        <label>Fuel type<select name="fuelType" defaultValue="DIESEL"><option>DIESEL</option><option>PETROL</option><option>HYBRID</option><option>ELECTRIC</option><option>LPG</option><option>CNG</option><option>OTHER</option></select></label>
        <label>Transmission<select name="transmission" defaultValue=""><option value="">Not specified</option><option>MANUAL</option><option>AUTOMATIC</option><option>AMT</option><option>CVT</option><option>OTHER</option></select></label>
        <label>Tank capacity (L)<input name="tankCapacityLitres" type="number" min="1" step="0.1" /></label>
        <label>Current odometer (km)<input name="odometer" type="number" min="0" defaultValue="0" /></label>
        <label className="span-2-v2">Current location<input name="currentLocation" placeholder="Kampala yard / branch / route location" /></label>
        <div className="form-actions-v2"><button className="button-v2 primary" type="submit"><Icon name="plus" size={16} /> Create fleet record</button><button className="button-v2 secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</button></div>
      </div>
    </form>}

    <section className="panel-v2">
      <div className="fleet-toolbar-v2">
        <form className="fleet-search-v2" onSubmit={(e) => { e.preventDefault(); void load(query); }}><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search registration, fleet no., VIN, make or model" /><button type="submit">Search</button></form>
        <div className="filter-tabs-v2">{["ALL", "AVAILABLE", "ON_TRIP", "ATTENTION"].map((filter) => <button className={statusFilter === filter ? "active" : ""} key={filter} onClick={() => setStatusFilter(filter)}>{filter === "ALL" ? "All fleet" : filter === "ATTENTION" ? "Needs attention" : filter.replaceAll("_", " ")}</button>)}</div>
      </div>

      <div className={`fleet-register-layout-v2 ${selected ? "with-detail" : ""}`}>
        <div className="table-wrap fleet-table-v2"><table><thead><tr><th>Vehicle</th><th>Fleet / VIN</th><th>Category</th><th>Branch</th><th>Status</th><th>Odometer</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={7}><div className="empty-state-v2"><span className="loading-ring small" /><b>Loading fleet register…</b></div></td></tr> : filtered.length ? filtered.map((vehicle) => <tr key={vehicle.id} className={selected?.id === vehicle.id ? "selected-row" : ""}><td><div className="vehicle-cell-v2"><span className="vehicle-symbol-v2"><Icon name="vehicle" size={18} /></span><div><b>{vehicle.registrationNumber}</b><span>{vehicle.make} {vehicle.model}{vehicle.variant ? ` · ${vehicle.variant}` : ""}</span></div></div></td><td><b className="secondary-id-v2">{vehicle.fleetNumber || "—"}</b><span className="cell-sub-v2">{vehicle.vin}</span></td><td>{vehicle.category}<span className="cell-sub-v2">{vehicle.manufacturingYear} · {vehicle.fuelType}</span></td><td>{vehicle.branch?.name ?? "—"}<span className="cell-sub-v2">{vehicle.department?.name ?? "No department"}</span></td><td><span className={`status-pill-v2 s-${vehicle.status}`}><i />{vehicle.status.replaceAll("_", " ")}</span></td><td><b>{vehicle.currentOdometerKm.toLocaleString()}</b><span className="cell-sub-v2">km</span></td><td><button className="table-detail-button" onClick={() => setSelected(vehicle)}>View</button></td></tr>) : <tr><td colSpan={7}><div className="empty-state-v2"><Icon name="search" size={24} /><b>No vehicles match this view</b><span>Change the search term or fleet-status filter.</span></div></td></tr>}</tbody></table></div>

        {selected && <aside className="vehicle-detail-v2">
          <div className="detail-head-v2"><div className="detail-icon-v2"><Icon name="vehicle" size={22} /></div><div><span>FLEET ASSET</span><h3>{selected.registrationNumber}</h3><p>{selected.make} {selected.model}</p></div><button onClick={() => setSelected(null)} aria-label="Close vehicle detail"><Icon name="close" size={17} /></button></div>
          <div className="detail-status-v2"><span className={`status-pill-v2 s-${selected.status}`}><i />{selected.status.replaceAll("_", " ")}</span><small>{blocked.has(selected.status) ? "Dispatch blocked by current state" : service.has(selected.status) ? "Maintenance control state" : "Operational state"}</small></div>
          <div className="detail-grid-v2">
            <div><span>Fleet number</span><b>{selected.fleetNumber || "—"}</b></div><div><span>Odometer</span><b>{selected.currentOdometerKm.toLocaleString()} km</b></div>
            <div><span>VIN / chassis</span><b>{selected.vin}</b></div><div><span>Engine</span><b>{selected.engineNumber || "—"}</b></div>
            <div><span>Category</span><b>{selected.category}</b></div><div><span>Year</span><b>{selected.manufacturingYear}</b></div>
            <div><span>Fuel</span><b>{selected.fuelType}</b></div><div><span>Transmission</span><b>{selected.transmission || "—"}</b></div>
            <div><span>Branch</span><b>{selected.branch?.name || "—"}</b></div><div><span>Department</span><b>{selected.department?.name || "—"}</b></div>
            <div className="detail-wide"><span>Current location</span><b>{selected.currentLocation || "Not recorded"}</b></div>
          </div>
          <div className="detail-actions-v2"><Link className="button-v2 secondary" to="/assignments"><Icon name="assignment" size={15} /> Assignments</Link><Link className="button-v2 secondary" to="/trips"><Icon name="trip" size={15} /> Trip history</Link><Link className="button-v2 secondary" to="/inspections"><Icon name="inspection" size={15} /> Inspections</Link></div>
        </aside>}
      </div>
    </section>
  </>;
}
