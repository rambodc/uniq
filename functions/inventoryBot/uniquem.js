/** Uniquem-made products. Edit `names` when a spelling should get the badge.
 * Packaging, case, hyphens, and spaces are ignored. A name matches only when the
 * whole stem equals one listed here, so UniPAC LV does not swallow UniPAC HV
 * and UniCorr does not swallow every UniCorr grade.
 * "Uniq-" and "Uni" are the same prefix (Uniq-PAC LV and UniPAC LVD are one family).
 */

export const UNIQUEM_PRODUCTS = [
  { id: "acetic-acid", label: "Acetic Acid Glacial", names: ["Acetic Acid Glacial", "Acetic Acid"] },
  { id: "activator", label: "Activator", names: ["Activator"] },
  { id: "amphosol", label: "Amphosol", names: ["Amphosol"] },
  { id: "aphrox", label: "ApHrox", names: ["ApHrox"] },
  { id: "basocorr", label: "Basocorr PP", names: ["Basocorr PP", "Basocorr"] },
  { id: "basoflux", label: "Basoflux", names: ["Basoflux"] },
  { id: "basolon", label: "Basolon GL40", names: ["Basolon GL40", "Basolon"] },
  { id: "basosol", label: "Basosol TDA 89", names: ["Basosol TDA 89", "Basosol"] },
  { id: "bbo", label: "BBO Base Plus", names: ["BBO Base Plus", "BBO"] },
  { id: "bitubust", label: "BituBust", names: ["BituBust"] },
  { id: "ciii", label: "C-III", names: ["C-III", "CIII"] },
  { id: "calcium-carbonate", label: "Calcium Carbonate", names: ["Calcium Carbonate"] },
  { id: "calcium-stearate", label: "Calcium Stearate", names: ["Calcium Stearate", "CERA"] },
  { id: "can-glide", label: "Can Glide", names: ["Can Glide"] },
  { id: "canquat", label: "Canquat BKC80", names: ["Canquat BKC80", "Canquat"] },
  { id: "cansol", label: "CanSol Plus", names: ["CanSol Plus"] },
  { id: "castor", label: "Castor", names: ["Castor"] },
  { id: "cinnamaldehyde", label: "Cinnamaldehyde", names: ["Cinnamaldehyde"] },
  { id: "clay-control", label: "Clay Control", names: ["Clay Control", "Clay-Control"] },
  { id: "clayshield", label: "ClayShield", names: ["ClayShield", "Clay Shield"] },
  { id: "cor-hib", label: "COR-HIB", names: ["COR-HIB", "Corhib"] },
  { id: "d-limonene", label: "D'limonene", names: ["D'limonene", "D-limonene", "Dlimonene"] },
  { id: "ddbsa", label: "DDBSA", names: ["DDBSA"] },
  { id: "deha", label: "DEHA", names: ["DEHA"] },
  { id: "distillate-822", label: "Distillate 822", names: ["Distillate 822"] },
  { id: "thermavis", label: "ThermaVis HT", names: ["ThermaVis HT"] },
  { id: "dowfax", label: "Dowfax", names: ["Dowfax"] },
  { id: "drs-100", label: "DRS-100", names: ["DRS-100"] },
  { id: "elixir", label: "Elixir", names: ["Elixir"] },
  { id: "emulbreak", label: "EmulBreak", names: ["EmulBreak"] },
  { id: "epsealon", label: "EpSealon", names: ["EpSealon"] },
  { id: "estobate-20", label: "Estobate 20", names: ["Estobate 20"] },
  { id: "estobate-80", label: "Estobate 80", names: ["Estobate 80"] },
  { id: "ethylene-glycol", label: "Ethylene Glycol", names: ["Ethylene Glycol"] },
  { id: "ez-slide", label: "EZ Slide L", names: ["EZ Slide L", "EZ-Slide L", "EZ Slide"] },
  { id: "flip", label: "FLIP", names: ["FLIP"] },
  { id: "foam-ranger", label: "Foam Ranger", names: ["Foam Ranger"] },
  { id: "formic-acid", label: "Formic Acid", names: ["Formic Acid"] },
  { id: "fusion", label: "Fusion", names: ["Fusion"] },
  { id: "gluconic-acid", label: "Gluconic Acid", names: ["Gluconic Acid"] },
  { id: "glycolic-acid", label: "Glycolic Acid", names: ["Glycolic Acid"] },
  { id: "guar", label: "Guar Gum", names: ["Guar Gum"] },
  { id: "hedp", label: "HEDP", names: ["HEDP"] },
  { id: "helix", label: "Helix", names: ["Helix"] },
  { id: "hm-starch", label: "HM Starch", names: ["HM Starch"] },
  { id: "hmda", label: "HMDA", names: ["HMDA"] },
  { id: "htfl", label: "HTFL", names: ["HTFL"] },
  { id: "hydroquinone", label: "Hydroquinone", names: ["Hydroquinone"] },
  { id: "inertia", label: "Inertia", names: ["Inertia"] },
  { id: "iofloc-1", label: "IOFloc 1", names: ["IOFloc 1"] },
  { id: "iofloc-2", label: "IOFloc 2", names: ["IOFloc 2"] },
  { id: "ipa", label: "IsoPropyl Alcohol", names: ["IsoPropyl Alcohol", "Isopropyl Alcohol"] },
  { id: "koh-45", label: "KOH-45%", names: ["KOH-45%", "KOH 45"] },
  { id: "konjac", label: "Konjac", names: ["Konjac"] },
  { id: "lubrizol-006", label: "Lubrizol 006", names: ["Lubrizol 006"] },
  { id: "lubrizol-7718", label: "Lubrizol 7718", names: ["Lubrizol 7718"] },
  { id: "lurex", label: "Lurex", names: ["Lurex", "LUREX"] },
  { id: "mea", label: "Monoethanolamine", names: ["Monoethanolamine"] },
  { id: "methanol", label: "Methanol", names: ["Methanol"] },
  { id: "msa-70", label: "MSA 70", names: ["MSA 70"] },
  { id: "myacide", label: "Myacide GA50", names: ["Myacide GA50", "Myacide"] },
  { id: "nano-active", label: "Nano-Active", names: ["Nano-Active", "Nano Active"] },
  { id: "natrosol", label: "Natrosol Plus330", names: ["Natrosol Plus330", "Natrosol"] },
  { id: "peg", label: "PEG", names: ["PEG"] },
  { id: "pinemul-100", label: "Pinemul 100", names: ["Pinemul 100", "Envamul 1772"] },
  { id: "pinemul-201", label: "Pinemul 201", names: ["Pinemul 201", "Envamul 1740"] },
  { id: "polyaspartic", label: "Polyaspartic Acid", names: ["Polyaspartic Acid"] },
  { id: "polyferric", label: "Polyferric Sulfate", names: ["Polyferric Sulfate"] },
  { id: "qs302", label: "QS302", names: ["QS302"] },
  { id: "quatrex", label: "Quatrex 182", names: ["Quatrex 182"] },
  { id: "quinoline", label: "Quinoline Quat", names: ["Quinoline Quat"] },
  { id: "sandweb", label: "SandWeb", names: ["SandWeb"] },
  { id: "sodium-chloride", label: "Sodium Chloride", names: ["Sodium Chloride"] },
  { id: "solublok", label: "SoluBlok", names: ["SoluBlok", "Solu Blok", "Solublok"] },
  { id: "spectra", label: "SPECTRA HD", names: ["SPECTRA HD", "Spectra HD"] },
  { id: "spraycorr", label: "SprayCorr", names: ["SprayCorr"] },
  { id: "stearic", label: "Stearic Acid", names: ["Stearic Acid"] },
  { id: "stepantex", label: "Stepantex CV90", names: ["Stepantex CV90", "Stepantex"] },
  { id: "suga-det", label: "Suga Det", names: ["Suga Det", "SugaDet"] },
  { id: "surfactant-mw", label: "Surfactant MW", names: ["Surfactant MW"] },
  { id: "targone", label: "Targone", names: ["Targone"] },
  { id: "teos", label: "TEOS", names: ["TEOS"] },
  { id: "terminox-s", label: "Terminox S", names: ["Terminox S"] },
  { id: "terminox", label: "Terminox", names: ["Terminox", "Terminox Pails"] },
  { id: "thps", label: "THPS", names: ["THPS"] },
  { id: "triazine", label: "Triazine", names: ["Triazine"] },
  { id: "triox", label: "Triox", names: ["Triox"] },
  { id: "two-eh", label: "2EH", names: ["2EH"] },
  { id: "u-lerm", label: "U-LERM", names: ["U-LERM", "ULERM"] },
  { id: "u-scav", label: "U-Scav", names: ["U-Scav", "U Scav", "Uscav"] },
  { id: "ues-acid", label: "UES Acid Blend", names: ["UES Acid Blend", "UES Acid"] },
  { id: "ufr-a100", label: "UFR-A100", names: ["UFR-A100"] },
  { id: "uhcl-31", label: "UHCl-31", names: ["UHCl-31", "UHCL 31"] },
  { id: "ula", label: "ULA", names: ["ULA"] },
  { id: "uni-green", label: "Uni-Green", names: ["Uni-Green", "UniGreen"] },
  { id: "unibreak-1", label: "UniBreak 1", names: ["UniBreak 1"] },
  { id: "unibreak-8", label: "UniBreak 8", names: ["UniBreak 8"] },
  { id: "unicide", label: "UniCide G15", names: ["UniCide G15", "Unicide G15"] },
  { id: "unicoat", label: "UniCoat", names: ["UniCoat"] },
  { id: "unicorr-clear", label: "UniCorr Clear", names: ["UniCorr Clear", "Unicorr Clear"] },
  { id: "unicorr-p", label: "UniCorr P", names: ["UniCorr P"] },
  { id: "unicorr-x", label: "UniCorr X", names: ["UniCorr X"] },
  { id: "uniflow", label: "UniFlow AD", names: ["UniFlow AD"] },
  { id: "unifoam", label: "UniFoam", names: ["UniFoam"] },
  { id: "unifraq", label: "UniFRaq HV", names: ["UniFRaq HV", "Unifraq HV"] },
  { id: "unimul", label: "UniMul", names: ["UniMul"] },
  { id: "unipac-hv", label: "UniPAC HV", names: ["Uniq-PAC HV", "UniPAC HV", "UniPAC HVD", "Uniq-PAC HVD"] },
  { id: "unipac-lv", label: "UniPAC LV", names: ["Uniq-PAC LV", "Uniq-Pac LV", "UniPAC LV", "UniPAC LVD", "Uniq-PAC LVD", "Uniq-PAC LV Powder"] },
  { id: "uniq-rm", label: "Uniq-RM", names: ["Uniq-RM", "Uniq RM"] },
  { id: "unisap", label: "UniSAP", names: ["UniSAP"] },
  { id: "uniseal", label: "UniSeal G", names: ["UniSeal G"] },
  { id: "unisol", label: "UniSol AP/DH", names: ["UniSol AP/DH", "UniSol AP", "UniSol DH"] },
  { id: "unistar", label: "UniSTAR", names: ["UniSTAR", "Unistar"] },
  { id: "unistop", label: "UniSTOP", names: ["UniSTOP", "Unistop"] },
  { id: "univive-ht", label: "UniVive HT", names: ["UniVive HT"] },
  { id: "univive-ox", label: "UniVive Ox", names: ["UniVive Ox Concentrate", "UniVive Ox"] },
  { id: "uniwax", label: "UniWax T", names: ["UniWax T"] },
  { id: "uniwet-ii", label: "UniWet II", names: ["UniWet II", "UniWet 2"] },
  { id: "uniwet", label: "UniWet", names: ["UniWet"] },
  { id: "uod-h", label: "UOD H", names: ["UOD H"] },
  { id: "uod", label: "UOD", names: ["UOD"] },
  { id: "usc-100", label: "USC-100", names: ["USC-100"] },
  { id: "zan-hd", label: "ZAN HD", names: ["ZAN HD", "Zan HD", "ZANHD"] },
  { id: "zddp", label: "ZDDP", names: ["ZDDP"] },
  { id: "zinc-sulphate", label: "Zinc Sulphate", names: ["Zinc Sulphate", "Zinc Sulfate"] },
];

const STEM_INDEX = new Map();
for (const product of UNIQUEM_PRODUCTS) {
  for (const name of product.names) {
    const stem = productStem(name);
    if (stem && !STEM_INDEX.has(stem)) STEM_INDEX.set(stem, product);
  }
}

/** Drop packaging and collapse Uniq-/punctuation so two labels of one product share a stem. */
export function productStem(value) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|kgs|g|lb|lbs|l|lt|ltr|litre|liter|litres|liters|ml)\b/gi, " ")
    .replace(/\b(?:pails?|drums?|totes?|bags?|sacks?|pallets?|powder|concentrate)\b/gi, " ")
    .replace(/\bof\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase()
    .replace(/^uniq(?=[a-z])/, "uni");
}

/** The Uniquem family for a product name, or null when it is not on the list. */
export function matchUniquem(name) {
  const stem = productStem(name);
  if (!stem) return null;
  return STEM_INDEX.get(stem) || null;
}
