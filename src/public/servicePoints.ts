export type ServicePoint = {
  id: string;
  city: string;
  address: readonly string[];
  phones: readonly { display: string; dial: string }[];
};

/** Published service points already shown on the locations page. Not a new city list. */
export const servicePoints: readonly ServicePoint[] = [
  { id: "blackfalds", city: "Blackfalds", address: ["4300 South Street", "Blackfalds, AB T0M 0J0"], phones: [{ display: "403-885-5151", dial: "+14038855151" }] },
  { id: "elk-point", city: "Elk Point", address: ["4505 57 Avenue", "Elk Point, AB T0A 1A0"], phones: [{ display: "780-724-2040", dial: "+17807242040" }, { display: "780-210-0158", dial: "+17802100158" }] },
  { id: "fort-st-john", city: "Fort St. John", address: ["10223 116 Street", "Fort St. John, BC V1J 4M6"], phones: [{ display: "250-785-4222", dial: "+12507854222" }] },
  { id: "grande-prairie-38", city: "Grande Prairie", address: ["9716 38 Avenue", "Grande Prairie, AB T8V 4Z1"], phones: [{ display: "780-814-6045", dial: "+17808146045" }] },
  { id: "nisku", city: "Nisku", address: ["507 14 Avenue", "Nisku, AB T9E 7M8"], phones: [{ display: "780-955-5553", dial: "+17809555553" }] },
  { id: "blackfoot", city: "Blackfoot", address: ["27 Production Avenue", "Blackfoot, AB"], phones: [{ display: "780-808-3845", dial: "+17808083845" }] },
  { id: "rosetown", city: "Rosetown", address: ["110 Saskatchewan Drive", "Rosetown, SK S0L 2V0"], phones: [{ display: "306-882-1234", dial: "+13068821234" }] },
  { id: "brooks", city: "Brooks", address: ["143040 Township Road 191", "SE-9-19-14-W4, Box 686", "Brooks, AB T1R 1B6"], phones: [{ display: "403-362-4071", dial: "+14033624071" }] },
  { id: "grande-prairie-county", city: "Grande Prairie", address: ["#102-57, 721071 Range Road 53", "County of Grande Prairie No. 1, AB T8X 0N4"], phones: [{ display: "250-616-8592", dial: "+12506168592" }] },
  { id: "weyburn", city: "Weyburn", address: ["29 Queen Street West", "Weyburn, SK S4H 2L3"], phones: [{ display: "306-861-0860", dial: "+13068610860" }] },
  { id: "calgary", city: "Calgary", address: ["7115 48 Street SE", "Calgary, AB T2C 5A4"], phones: [{ display: "403-262-2004", dial: "+14032622004" }] },
];

const provinceName = { AB: "Alberta", BC: "British Columbia", SK: "Saskatchewan" } as const;

export function regionOf(point: ServicePoint): keyof typeof provinceName | undefined {
  const blob = point.address.join(" ");
  if (/, BC\b/.test(blob)) return "BC";
  if (/, SK\b/.test(blob)) return "SK";
  if (/, AB\b/.test(blob)) return "AB";
  return undefined;
}

export function postalCodeOf(point: ServicePoint): string | undefined {
  return point.address.join(" ").match(/[A-Z]\d[A-Z][ -]?\d[A-Z]\d/)?.[0];
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Province coverage derived only from the published service-point records. */
export function coverageSentences(points: readonly ServicePoint[] = servicePoints): string[] {
  return (["AB", "BC", "SK"] as const).map((region) => {
    const counts = new Map<string, number>();
    for (const point of points) {
      if (regionOf(point) !== region) continue;
      counts.set(point.city, (counts.get(point.city) ?? 0) + 1);
    }
    const labels = [...counts.entries()].map(([city, count]) => (count === 2 ? `${city} (two addresses)` : count > 2 ? `${city} (${count} addresses)` : city));
    return `${provinceName[region]}: ${joinList(labels)}.`;
  });
}

export const locationQuery = (location: ServicePoint) => location.address.join(", ");

export const mapEmbedUrl = (location: ServicePoint) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(locationQuery(location))}&z=14&output=embed`;

export const mapDirectionsUrl = (location: ServicePoint) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery(location))}`;
