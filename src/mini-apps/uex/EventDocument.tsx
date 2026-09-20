import { CalendarDays, MapPin, Music2 } from "lucide-react";
import "./event.css";
export type Asset = { id: string; url: string; alt: string; caption: string };
export type PageDocument = {
  version: 1;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venue: { name: string; address: string };
  theme: "dark" | "light" | "gold";
  sections: {
    type: string;
    heading: string;
    body: string;
    items: { title: string; detail: string; assetId: string }[];
  }[];
};
export function exactTime(value: string, zone: string) {
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value))
    : "";
}
export default function EventDocument({
  document: d,
  assets = [],
  preview = false,
}: {
  document: PageDocument;
  assets?: Asset[];
  preview?: boolean;
}) {
  const missing = (label: string) =>
    preview ? <p className="event-missing">{label}</p> : null;
  const hero = assets.find(
    (a) =>
      a.id === d.sections.find((s) => s.type === "hero")?.items[0]?.assetId,
  );
  // Essential sections always render; AI only arranges the trusted content below them.
  const sections = [
    ...["hero", "datetime", "venue"]
      .filter((type) => !d.sections.some((s) => s.type === type))
      .map((type) => ({ type, heading: "", body: "", items: [] })),
    ...d.sections,
  ];
  return (
    <article className={`event-document event-${d.theme}`}>
      {sections.map((s, index) => {
        if (s.type === "hero")
          return (
            <header className="event-hero" key={index}>
              {hero && (
                <img
                  className="event-hero-image"
                  src={hero.url}
                  alt={hero.alt}
                />
              )}
              <div className="event-hero-content">
                <span className="event-kicker">
                  UNIQ EXCLUSIVE · INVITATION ONLY
                </span>
                <h1>{d.title || "Your next unforgettable evening."}</h1>
                {d.description ? (
                  <p>{d.description}</p>
                ) : (
                  missing("Tell the assistant what makes this party special.")
                )}
              </div>
            </header>
          );
        if (s.type === "datetime")
          return (
            <section className="event-section event-time" key={index}>
              <CalendarDays />
              <div>
                <span className="event-kicker">SAVE THE DATE</span>
                {d.startsAt ? (
                  <>
                    <h2>{exactTime(d.startsAt, d.timezone)}</h2>
                    <p>
                      Until{" "}
                      {exactTime(d.endsAt, d.timezone) ||
                        "end time to be confirmed"}{" "}
                      · {d.timezone}
                    </p>
                  </>
                ) : (
                  missing("Date and time to be confirmed")
                )}
              </div>
            </section>
          );
        if (s.type === "venue")
          return (
            <section className="event-section" key={index}>
              <span className="event-kicker">
                <MapPin size={15} /> THE PLACE
              </span>
              <h2>{d.venue.name || "The venue"}</h2>
              {d.venue.address ? (
                <>
                  <p>{d.venue.address}</p>
                  <iframe
                    className="event-map"
                    title={`Map of ${d.venue.name || d.venue.address}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(d.venue.address)}&z=14&output=embed`}
                  />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.venue.address)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get directions ↗
                  </a>
                </>
              ) : (
                missing(
                  "Ask the assistant to add the venue name and full address.",
                )
              )}
            </section>
          );
        if (s.type === "gallery") {
          const images = s.items
            .map((i) => ({
              item: i,
              asset: assets.find((a) => a.id === i.assetId),
            }))
            .filter((x) => x.asset);
          if (!images.length)
            return preview
              ? missing("Upload images to build your gallery.")
              : null;
          return (
            <section className="event-section" key={index}>
              <h2>{s.heading || "A glimpse of the evening"}</h2>
              <div className="event-gallery">
                {images.map(({ asset: a, item }, i) => (
                  <figure key={i}>
                    <img src={a!.url} alt={a!.alt} />
                    {(a!.caption || item.detail) && (
                      <figcaption>{a!.caption || item.detail}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          );
        }
        const completeItems = s.items.filter(
          (i) => i.title && (s.type === "performers" || i.detail),
        );
        if (!s.body && !completeItems.length) return null;
        return (
          <section className="event-section" key={index}>
            <span className="event-kicker">
              {s.type === "performers" ? (
                <>
                  <Music2 size={15} /> THE LINEUP
                </>
              ) : (
                s.type.toUpperCase()
              )}
            </span>
            <h2>{s.heading}</h2>
            {s.body && <p className="event-copy">{s.body}</p>}
            {completeItems.map((i, n) =>
              s.type === "faq" ? (
                <details key={n}>
                  <summary>{i.title}</summary>
                  <p>{i.detail}</p>
                </details>
              ) : (
                <div className="event-item" key={n}>
                  <h3>{i.title}</h3>
                  <p>{i.detail}</p>
                </div>
              ),
            )}
          </section>
        );
      })}
    </article>
  );
}
