import { Link } from "react-router-dom";

const fleet = [
  { reg: "UAX 482M", type: "Tata Prima 2528", state: "ON_TRIP", location: "Kampala → Jinja", driver: "Peter Okwir", odo: "184,260 km" },
  { reg: "UBK 731D", type: "Tata Ultra", state: "AVAILABLE", location: "ACRILAND Yard", driver: "Unassigned", odo: "96,410 km" },
  { reg: "UAZ 115K", type: "Tata LPT 613", state: "UNDER_MAINTENANCE", location: "Workshop Bay 2", driver: "Unassigned", odo: "221,840 km" },
  { reg: "UBJ 904P", type: "Tata Signa 4018", state: "GROUNDED", location: "Mbale", driver: "John Emuria", odo: "312,090 km" },
  { reg: "UAX 907R", type: "Tata LPT 709", state: "PARKED", location: "ACRILAND Yard", driver: "Unassigned", odo: "72,840 km" },
];

const stateLabel: Record<string, string> = { ON_TRIP: "On trip", AVAILABLE: "Available", UNDER_MAINTENANCE: "Workshop", GROUNDED: "Grounded", PARKED: "Parked" };

export function DemoPreviewPage() {
  return <div style={{ minHeight: "100vh", background: "#f4f7fb", color: "#172033", padding: "24px" }}>
    <div style={{ maxWidth: 1380, margin: "0 auto" }}>
      <div style={{ background: "#172033", color: "white", borderRadius: 18, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div><b style={{ fontSize: 15, letterSpacing: 1 }}>DEMO PREVIEW</b><div style={{ opacity: .72, fontSize: 13, marginTop: 3 }}>Sample data only · not connected to the live ACRILAND database</div></div>
        <Link to="/login" style={{ color: "white", textDecoration: "none", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "9px 14px", fontWeight: 700 }}>Back to secure login</Link>
      </div>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end", margin: "10px 0 26px", flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: "#4569a8" }}>ACRILAND LTD · FLEET COMMAND</div><h1 style={{ fontSize: "clamp(28px,4vw,42px)", margin: "8px 0 7px" }}>Fleet control is online.</h1><p style={{ margin: 0, maxWidth: 760, color: "#657086", fontSize: 16, lineHeight: 1.55 }}>A spacious app-first command centre for vehicle accountability, movement readiness, workshop control, driver safety and fleet intelligence.</p></div>
        <div style={{ background: "white", border: "1px solid #dce3ee", borderRadius: 14, padding: "12px 16px", minWidth: 210 }}><b>● Operations live</b><div style={{ color: "#657086", fontSize: 13, marginTop: 5 }}>12 active trips · 18 dispatch ready</div></div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
        {[
          ["Total fleet", "42", "Registered vehicles"], ["Available now", "27", "64.3% availability"], ["On active trips", "12", "28.6% utilized"], ["Workshop control", "3", "1 awaiting approval"], ["Open incidents", "2", "1 critical"], ["Driver readiness", "38", "41 registered"]
        ].map(([label, value, detail]) => <div key={label} style={{ background: "white", border: "1px solid #dce3ee", borderRadius: 16, padding: "20px 18px", minHeight: 105, boxSizing: "border-box" }}><div style={{ color: "#657086", fontSize: 13, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 32, fontWeight: 850, margin: "8px 0 3px" }}>{value}</div><div style={{ color: "#7a8497", fontSize: 12 }}>{detail}</div></div>)}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(300px,.8fr)", gap: 18, alignItems: "start" }}>
        <section style={{ background: "white", border: "1px solid #dce3ee", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid #e7ebf2" }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: "#4569a8" }}>FLEET HEALTH</div><h2 style={{ margin: "6px 0 4px", fontSize: 21 }}>Vehicle operating picture</h2><p style={{ margin: 0, color: "#788297", fontSize: 13 }}>Sample vehicles showing the density and accountability of the fleet register.</p></div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}><thead><tr>{["Vehicle","State","Current location","Driver","Odometer"].map(x => <th key={x} style={{ textAlign: "left", padding: "13px 16px", fontSize: 11, color: "#778196", textTransform: "uppercase", letterSpacing: .7, background: "#f8fafc" }}>{x}</th>)}</tr></thead><tbody>{fleet.map(v => <tr key={v.reg}>{<td style={{ padding: "15px 16px", borderTop: "1px solid #edf0f5" }}><b>{v.reg}</b><div style={{ color: "#7a8497", fontSize: 12, marginTop: 3 }}>{v.type}</div></td>}<td style={{ padding: "15px 16px", borderTop: "1px solid #edf0f5" }}><span style={{ display: "inline-block", padding: "6px 9px", borderRadius: 99, background: v.state === "GROUNDED" ? "#fff0f0" : v.state === "UNDER_MAINTENANCE" ? "#fff7e6" : v.state === "ON_TRIP" ? "#edf5ff" : "#edf9f1", fontSize: 12, fontWeight: 750 }}>{stateLabel[v.state]}</span></td><td style={{ padding: "15px 16px", borderTop: "1px solid #edf0f5" }}>{v.location}</td><td style={{ padding: "15px 16px", borderTop: "1px solid #edf0f5" }}>{v.driver}</td><td style={{ padding: "15px 16px", borderTop: "1px solid #edf0f5", whiteSpace: "nowrap" }}>{v.odo}</td></tr>)}</tbody></table></div>
        </section>

        <section style={{ background: "white", border: "1px solid #dce3ee", borderRadius: 18, padding: 20 }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: "#4569a8" }}>ACTION CENTRE</div><h2 style={{ margin: "6px 0 17px", fontSize: 21 }}>Attention required</h2>{[
          ["Critical", "1 grounded vehicle", "Dispatch blocked until release"], ["Workshop", "1 repair approval", "Commercial authorization required"], ["Compliance", "3 documents due", "Renewal action within 30 days"], ["Telemetry", "4 GPS units stale", "Review connected-fleet coverage"]
        ].map(([tone, title, detail]) => <div key={title} style={{ padding: "14px 0", borderTop: "1px solid #edf0f5" }}><div style={{ fontSize: 11, fontWeight: 800, color: tone === "Critical" ? "#b3261e" : "#4569a8", textTransform: "uppercase" }}>{tone}</div><b style={{ display: "block", margin: "4px 0" }}>{title}</b><span style={{ color: "#788297", fontSize: 12 }}>{detail}</span></div>)}</section>
      </div>

      <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {["Vehicles", "Drivers", "Vehicle 360", "Maintenance", "GPS & Telemetry", "Reports", "Vehicle Lifecycle", "Users & Access"].map((label, i) => <div key={label} style={{ background: "white", border: "1px solid #dce3ee", borderRadius: 14, padding: "15px 16px", fontWeight: 750 }}>{label}<span style={{ float: "right", color: "#9aa4b5" }}>›</span><div style={{ fontSize: 11, color: "#8892a4", fontWeight: 500, marginTop: 4 }}>{i < 3 ? "Core command" : "Control module"}</div></div>)}
      </section>
    </div>
  </div>;
}
