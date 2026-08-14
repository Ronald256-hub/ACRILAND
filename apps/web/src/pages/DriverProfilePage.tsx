import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../api/client";
import { DriverAvatar } from "../components/DriverAvatar";

type DriverProfile = {
  id: string;
  employeeNumber: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  licenceNumber: string;
  licenceClass: string;
  licenceExpiry: string;
  emergencyContact?: string | null;
  status: string;
  photoAvailable: boolean;
  photoEndpoint?: string | null;
  branch?: { name: string } | null;
  department?: { name: string } | null;
};

export function DriverProfilePage() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = () => api<DriverProfile>("/drivers/me").then(setProfile).catch((e) => setError(e.message));
  useEffect(()=>{ void load(); }, []);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    setError(""); setMessage(""); setBusy(true);
    const body = new FormData(); body.append("photo", file);
    try {
      const updated = await api<DriverProfile>(`/drivers/${profile.id}/photo`, { method: "POST", body });
      setProfile(updated);
      setMessage("Profile photo updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload profile photo.");
    } finally {
      setBusy(false); if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!profile && !error) return <div className="loading">Loading driver profile…</div>;
  if (!profile) return <div className="error-box">{error}</div>;

  return <>
    <div className="section-head"><div><span className="eyebrow">Driver portal</span><h2>My Profile</h2></div></div>
    {error && <div className="error-box">{error}</div>}
    {message && <div className="success-box">{message}</div>}
    <div className="panel driver-profile-card">
      <div className="driver-photo-editor">
        <DriverAvatar name={profile.fullName} photoEndpoint={profile.photoEndpoint ?? null} size="large" />
        <div><h3>{profile.fullName}</h3><p>{profile.employeeNumber} · {profile.status.replaceAll("_", " ")}</p></div>
        <label className={`primary compact upload-button ${busy ? "disabled" : ""}`}>
          {busy ? "Uploading…" : profile.photoAvailable ? "Change photo" : "Add profile photo"}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} />
        </label>
      </div>
      <div className="profile-grid">
        <div><span>Licence</span><b>{profile.licenceNumber}</b></div>
        <div><span>Class</span><b>{profile.licenceClass}</b></div>
        <div><span>Licence expiry</span><b>{new Date(profile.licenceExpiry).toLocaleDateString()}</b></div>
        <div><span>Phone</span><b>{profile.phone || "—"}</b></div>
        <div><span>Email</span><b>{profile.email || "—"}</b></div>
        <div><span>Branch</span><b>{profile.branch?.name || "—"}</b></div>
        <div><span>Department</span><b>{profile.department?.name || "—"}</b></div>
        <div><span>Emergency contact</span><b>{profile.emergencyContact || "—"}</b></div>
      </div>
    </div>
    <div className="callout"><b>Photo security:</b> profile photos are stored privately and can only be retrieved through an authenticated ACRILAND session. JPEG, PNG and WebP files are accepted.</div>
  </>;
}
