import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ICONS, MINI_APPS, USER_TYPE_LABELS } from "./miniApps";
import Avatar from "./Avatar";
import Shell from "./Shell";

const greeting = (hour: number) => hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

export default function Dashboard() {
  const { can, profile, type } = useAuth();
  const apps = MINI_APPS.filter((app) => can(app.id));
  return <Shell title={profile ? `${greeting(new Date().getHours())}, ${profile.firstName}` : "Dashboard"} eyebrow="Workspace">
    {profile && <p className="portal-lead">{type ? USER_TYPE_LABELS[type] : ""} · {profile.email}</p>}
    {profile && <Avatar src={profile.photo} firstName={profile.firstName} lastName={profile.lastName} size={64} />}
    <section className="portal-tiles" aria-label="Mini apps">
      {apps.map(({ id, route, name, description, icon, accent }) => {
        const Icon = ICONS[icon];
        return <Link key={id} className="portal-tile" style={{ "--accent": accent } as CSSProperties} to={route}>
          <span className="portal-tile-icon"><Icon size={26} aria-hidden="true" /></span>
          <h2>{name}</h2>
          <p>{description}</p>
          <span>Open</span>
        </Link>;
      })}
    </section>
  </Shell>;
}
