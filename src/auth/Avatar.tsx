export default function Avatar({ src, firstName, lastName, size = 48 }: { src: string | null; firstName: string; lastName: string; size?: number }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  if (src) return <img className="portal-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return <span className="portal-avatar portal-avatar-fallback" style={{ width: size, height: size }} aria-hidden="true">{initials}</span>;
}
