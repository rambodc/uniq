const NAME_ORDER: Intl.CollatorOptions = { sensitivity: "base", numeric: true };

/** Case-insensitive, numeric order. "Item 2" comes before "Item 10". Pack breaks a tie. */
export function compareProductName(nameA: string, nameB: string, packA = "", packB = "") {
  return nameA.localeCompare(nameB, undefined, NAME_ORDER) || packA.localeCompare(packB, undefined, NAME_ORDER);
}
