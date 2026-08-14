import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { DriverAvatar } from "../components/DriverAvatar";
import { useAuth } from "../auth/AuthContext";

type D = {
  id: string;
  employeeNumber: string;
  fullName: string;
  licenceNumber: string;
  licenceClass: string;
  licenceExpiry: string;
  status: string;
  photoAvailable: boolean;
  photoEndpoint?: string | null;
  user?: { status: string } | null;
};

export function DriversPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<D[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const load = () => api<{ items: D[] }>("/drivers").then((r) => setItems(r.items)).catch((e) => setError(e.message));
  useEffect(load, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const portal = f.get("createPortalAccount") === "on";
    setError("");
    try {
      const created = await api<D>("/drivers", {
        method: "POST",
        body: JSON.stringify({
          employeeNumber: f.get("employeeNumber"), fullName: f.get("fullName"), phone: f.get("phone") || undefined,
          email: f.get("email") || undefined, licenceNumber: f.get("licenceNumber"), licenceClass: f.get("licenceClass"),
          licenceExpiry: f.get("licenceExpiry"), createPortalAccount: portal, temporaryPassword: f.get("temporaryPassword") || undefined
        })
      });
      const photo = f.get("photo");
      if (photo instanceof File && photo.size > 0) {
        const upload = new FormData(); upload.append("photo", photo);
        try { await api(`/drivers/${created.id}/photo`, { method: "POST", body: upload }); }
        catch (e) { setError(`Driver created, but the profile photo could not be uploaded: ${e instanceof Error ? e.message : "upload failed"}`); }
      }
      form.reset(); setShow(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create driver"); }
  };

  const replacePhoto = async (driver: D, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setPhotoBusy(driver.id); setError("");
    const body = new FormData(); body.append("photo", file);
    try { await api(`/drivers/${driver.id}/photo`, { method: "POST", body }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update profile photo."); }
    finally { setPhotoBusy(null); event.target.value = ""; }
  };

  return <>
    <div className="section-head"><div><span className="eyebrow">Authorized operators</span><h2>Drivers</h2></div>{me?.permissions.includes("driver.create") && <button className="primary compact" onClick={() => setShow(!show)}>{show ? "Close" : "+ Register driver"}</button>}</div>
    {error && <div className="error-box">{error}</div>}
    {show && <form className="panel form-grid" onSubmit={submit}>
      <label>Employee number<input name="employeeNumber" required /></label><label>Full name<input name="fullName" required /></label>
      <label>Phone<input name="phone" /></label><label>Email<input name="email" type="email" /></label>
      <label>Licence number<input name="licenceNumber" required /></label><label>Licence class<input name="licenceClass" required /></label>
      <label>Licence expiry<input name="licenceExpiry" type="date" required /></label>
      {me?.permissions.includes("driver.photo.manage") && <label>Profile photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>}
      {me?.permissions.includes("user.create_driver") && <><label className="check"><input name="createPortalAccount" type="checkbox" /> Create secure driver portal account</label><label>Temporary password<input name="temporaryPassword" type="password" minLength={12} /></label></>}
      <button className="primary">Create driver</button>
    </form>}
    <div className="callout"><b>Driver access control:</b> drivers cannot self-register. Portal access is created here only by an authorized manager, and temporary passwords must be changed. Drivers can securely maintain their own profile photo after login.</div>
    <div className="panel"><DataTable headers={["Photo", "Employee", "Driver", "Licence", "Expiry", "Status", "Portal", "Photo action"]} rows={items.map((d) => [
      <DriverAvatar name={d.fullName} photoEndpoint={d.photoEndpoint} size="small" />, d.employeeNumber, <b>{d.fullName}</b>, `${d.licenceNumber} · ${d.licenceClass}`,
      new Date(d.licenceExpiry).toLocaleDateString(), <span className="badge">{d.status.replaceAll("_", " ")}</span>, d.user?.status ?? "No account",
      me?.permissions.includes("driver.photo.manage") ? <label className={`mini-upload ${photoBusy === d.id ? "disabled" : ""}`}>{photoBusy === d.id ? "Uploading…" : "Update photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void replacePhoto(d, e)} disabled={photoBusy === d.id} /></label> : "—"
    ])} /></div>
  </>;
}
