import { useEffect, useRef, useState } from "react";
export default function CodeEntry({
  value,
  onChange,
  onComplete,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  disabled?: boolean;
}) {
  const sent = useRef("");
  useEffect(() => {
    if (value.length < 6) sent.current = "";
    else if (!disabled && sent.current !== value) {
      sent.current = value;
      onComplete(value);
    }
  }, [value, disabled, onComplete]);
  return (
    <label className="code-label">
      <span>Sign-in code</span>
      <div className="code-input">
        <div className="code-boxes" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={i === value.length ? "active" : ""}>
              {value[i] || ""}
            </span>
          ))}
        </div>
        <input
          aria-label="Sign-in code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          value={value}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
      </div>
    </label>
  );
}
export function Resend({
  at,
  busy,
  onClick,
}: {
  at: number;
  busy: boolean;
  onClick: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <button type="button" disabled={busy || seconds > 0} onClick={onClick}>
      {seconds ? `Resend in ${seconds}s` : "Send another code"}
    </button>
  );
}
