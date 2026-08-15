import { Icon, type IconName } from "./Icon";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet";

export function KpiCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
  meta
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: IconName;
  tone?: Tone;
  meta?: string;
}) {
  return <div className={`kpi-card-v2 tone-${tone}`}>
    <div className="kpi-card-top-v2"><span>{label}</span>{icon && <span className="kpi-icon-v2"><Icon name={icon} size={17} /></span>}</div>
    <strong>{value}</strong>
    <div className="kpi-card-bottom-v2">{detail && <small>{detail}</small>}{meta && <em>{meta}</em>}</div>
  </div>;
}
