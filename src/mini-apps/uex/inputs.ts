export function parseGuests(value: string) {
  return value
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const m = line.match(/^\s*(.+?)\s*(?:<|,)\s*([^<>,\s]+@[^<>,\s]+)>?\s*$/);
      if (!m) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line.trim()))
          return { name: "", email: line.trim() };
        throw new Error(
          "Use email@example.com or Name, email@example.com on each line.",
        );
      }
      return { name: m[1].trim(), email: m[2].trim() };
    });
}
