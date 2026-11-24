import { User } from "lucide-react";

export default function Avatar({ src, size = 48 }: { src: string | null; firstName: string; lastName: string; size?: number }) {
  const style = { width: size, height: size, minWidth: size, minHeight: size, maxWidth: size, maxHeight: size, flexShrink: 0, aspectRatio: "1 / 1" } as const;
  if (src) return <img className="portal-avatar" src={src} alt="" width={size} height={size} style={style} />;
  const icon = Math.max(18, Math.round(size * 0.46));
  return <span className="portal-avatar portal-avatar-fallback" style={style} aria-hidden="true"><User size={icon} strokeWidth={2} aria-hidden="true" /></span>;
}
