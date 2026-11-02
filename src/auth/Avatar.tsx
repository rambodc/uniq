export default function Avatar({ src, firstName, lastName, size = 48 }: { src: string | null; firstName: string; lastName: string; size?: number }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const style = { width: size, height: size, minWidth: size, minHeight: size, maxWidth: size, maxHeight: size, flexShrink: 0, aspectRatio: "1 / 1" } as const;
  if (src) return <img className="portal-avatar" src={src} alt="" width={size} height={size} style={style} />;
  return <span className="portal-avatar portal-avatar-fallback" style={style} aria-hidden="true">{initials}</span>;
}
