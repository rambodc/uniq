import "./loading.css";
export default function WellLoader({
  message,
  percent,
  onCancel,
}: {
  message: string;
  percent?: number | null;
  onCancel?: () => void;
}) {
  const value =
    percent == null ? null : Math.round(Math.max(0, Math.min(100, percent)));
  return (
    <div className="well-brand-loader">
      <div className="well-loader-emblem" aria-hidden="true">
        <img src="/brand/uniqenergy-mark-256.png" alt="" />
        <span />
      </div>
      <p role="status">{message}</p>
      {value !== null && (
        <div className="well-loader-progress">
          <progress aria-label={message} max={100} value={value} />
          <span>{value}%</span>
        </div>
      )}
      {onCancel && <button onClick={onCancel}>Cancel</button>}
    </div>
  );
}
