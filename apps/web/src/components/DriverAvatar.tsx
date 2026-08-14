import { useEffect, useState } from "react";
import { apiBlob } from "../api/client";

export function DriverAvatar({ name, photoEndpoint, size = "medium" }: { name: string; photoEndpoint?: string | null; size?: "small" | "medium" | "large" }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!photoEndpoint) { setSrc(null); return; }
    void apiBlob(photoEndpoint.replace(/^\/api/, ""))
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (active) setSrc(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoEndpoint]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "D";
  return <div className={`driver-avatar ${size}`} aria-label={`${name} profile photo`}>{src ? <img src={src} alt="" /> : <span>{initials}</span>}</div>;
}
