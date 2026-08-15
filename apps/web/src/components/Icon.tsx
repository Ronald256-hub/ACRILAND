export type IconName =
  | "command" | "vehicle" | "driver" | "assignment" | "trip" | "inspection"
  | "users" | "branch" | "department" | "audit" | "profile" | "search"
  | "bell" | "menu" | "close" | "plus" | "arrow" | "shield" | "alert"
  | "check" | "clock" | "wrench" | "route" | "gauge" | "calendar" | "logout";

const paths: Record<IconName, string[]> = {
  command: ["M4 4h6v6H4z", "M14 4h6v10h-6z", "M4 14h6v6H4z", "M14 18h6v2h-6z"],
  vehicle: ["M3 15l1.5-6h15L21 15", "M5 15h14v4H5z", "M7 19v2", "M17 19v2", "M7 12h2", "M15 12h2"],
  driver: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  assignment: ["M7 7h10", "M7 12h10", "M7 17h6", "M4 7h.01", "M4 12h.01", "M4 17h.01"],
  trip: ["M4 7h12", "M13 4l3 3-3 3", "M20 17H8", "M11 14l-3 3 3 3"],
  inspection: ["M9 11l2 2 4-4", "M7 3h10v3H7z", "M6 5H4v16h16V5h-2"],
  users: ["M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M3 21a6 6 0 0 1 12 0", "M17 11a3 3 0 1 0 0-6", "M16 16a5 5 0 0 1 5 5"],
  branch: ["M6 4v12", "M6 8h8", "M14 8v8", "M3 4h6v4H3z", "M11 16h6v4h-6z", "M3 16h6v4H3z"],
  department: ["M4 21V5l8-2 8 2v16", "M8 8h.01", "M12 8h.01", "M16 8h.01", "M8 12h.01", "M12 12h.01", "M16 12h.01", "M10 21v-5h4v5"],
  audit: ["M4 4h16v16H4z", "M8 8h8", "M8 12h8", "M8 16h5"],
  profile: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 21a7 7 0 0 1 14 0"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "M16 16l5 5"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  shield: ["M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z", "M9 12l2 2 4-4"],
  alert: ["M12 4 3 20h18z", "M12 9v4", "M12 17h.01"],
  check: ["M5 12l4 4L19 6"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  wrench: ["M14 7a4 4 0 0 0 5 5l-8 8-4-4 8-8a4 4 0 0 0-5-5l3 3 3-1 1-3z"],
  route: ["M5 5h4a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11", "M16 14l3 3-3 3"],
  gauge: ["M4 18a8 8 0 1 1 16 0", "M12 18l4-5", "M6 18h12"],
  calendar: ["M5 5h14v15H5z", "M8 3v4", "M16 3v4", "M5 9h14"],
  logout: ["M10 5H5v14h5", "M14 8l4 4-4 4", "M9 12h9"]
};

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name].map((d, index) => <path d={d} key={index} />)}</svg>;
}
