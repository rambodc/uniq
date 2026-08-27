export type PublicProduct = {
  slug: string;
  path: string;
  name: string;
  category: string;
  eyebrow: string;
  teaser: string;
  description: string;
  benefits: readonly string[];
  packaging: string;
  image: string;
  alt: string;
  /** Search intent and cross-linking are centralized in the public SEO registry. */
  applications?: readonly string[];
  relatedProducts?: readonly string[];
  faqs?: readonly { question: string; answer: string }[];
};

export const publicProducts: readonly PublicProduct[] = [
  {
    slug: "elixir",
    path: "/drilling-fluid-systems/elixir",
    name: "Elixir",
    category: "Water-based fluid lubricant",
    eyebrow: "Lubricity where it matters",
    teaser:
      "A concentrated, biodegradable lubricant engineered to improve the lubricity of water-based drilling fluids.",
    description:
      "Elixir forms a highly lubricious boundary layer at contact surfaces, helping drilling teams manage friction through demanding intervals without overcomplicating the fluid program. Its concentrated formulation is designed to support smoother drilling, reduce metal-to-metal contact, and complement practical water-based fluid programs.",
    benefits: [
      "Helps reduce rotational torque and drag",
      "Supports a lower coefficient of friction",
      "Helps minimize differential sticking tendency",
      "Designed for water-based drilling fluids",
    ],
    packaging: "Available in 200 L drums",
    image: "/images/products/elixir-pallet.webp",
    alt: "Pallet of blue plastic UniqEnergy Elixir drilling-fluid lubricant drums",
  },
  {
    slug: "fusion",
    path: "/drilling-fluid-systems/fusion",
    name: "Fusion",
    category: "Rheology and filtration polymer",
    eyebrow: "One blend. Broad performance.",
    teaser:
      "A highly dispersible polymer blend developed to support rheology and filtrate control across water-based fluids.",
    description:
      "Fusion is designed for rapid, complete hydration with less mixing time and product loss, bringing viscosity, suspension, hole cleaning, and filtration performance into one practical package. The broad-performance blend helps simplify product selection while supporting consistent fluid properties across changing water and operating conditions.",
    benefits: [
      "Supports low- and high-end rheology",
      "Provides filtrate-control performance",
      "Hydrates quickly across different water types",
      "Helps simplify inventory and mixing",
    ],
    packaging: "Available in 22.7 kg bags",
    image: "/images/products/fusion-pallet.webp",
    alt: "Pallet of yellow and white UniqEnergy Fusion drilling-fluid polymer bags",
  },
  {
    slug: "inertia",
    path: "/drilling-fluid-systems/inertia",
    name: "Inertia",
    category: "Interfacial-tension reducer",
    eyebrow: "Lower pressure. Better flow.",
    teaser:
      "A versatile treatment engineered to reduce interfacial tension and capillary pressure between water and oil phases.",
    description:
      "Inertia is designed to reduce the forces that can restrict fluid movement through capillaries and constricted pore throats. The amphiphilic formulation supports preserved oil/water wettability while helping improve flow under reservoir pressure, and can be incorporated into drilling fluids, fracturing packages, water-based stimulation systems, and many commercial acid packages.",
    benefits: [
      "Helps reduce capillary pressure",
      "Supports preserved oil/water wettability",
      "Miscible with acid and water systems",
      "Compatible with many acid and water additives",
    ],
    packaging: "Available in 19 L pails",
    image: "/images/products/inertia-pallet.webp",
    alt: "Pallet of white UniqEnergy Inertia oilfield-chemical pails",
  },
  {
    slug: "unicide-g15",
    path: "/drilling-fluid-systems/unicide-g15",
    name: "UniCide-G15",
    category: "Broad-spectrum oilfield biocide",
    eyebrow: "Persistent microbial control",
    teaser:
      "A concentrated, glutaraldehyde-based biocide developed for broad-spectrum microbial control in oilfield systems.",
    description:
      "UniCide-G15 provides fast, persistent control across oilfield bacterial populations, including damaging sulfate-reducing bacteria, while supporting treatment strategies for systems affected by biofilm. Its broad activity extends across a wide temperature range, and its molecular structure does not contain formaldehyde.",
    benefits: [
      "Broad-spectrum oilfield bacterial control",
      "Effective against sulfate-reducing bacteria",
      "Supports treatment of biofilm-affected systems",
      "Active across a wide temperature range",
    ],
    packaging: "Available in 19 L pails",
    image: "/images/products/unicide-g15-pallet.webp",
    alt: "Pallet of white UniqEnergy UniCide-G15 oilfield-chemical pails",
  },
  {
    slug: "unipac-hvd",
    path: "/drilling-fluid-systems/unipac-hvd",
    name: "UniPAC HVD",
    category: "High-viscosity polyanionic cellulose",
    eyebrow: "Fast hydration. High-end performance.",
    teaser:
      "A rapidly hydrating high-viscosity PAC engineered for rheology and filtrate control across water-based drilling fluids.",
    description:
      "UniPAC HVD is designed to hydrate quickly and efficiently, helping water-based drilling fluids develop high-end rheology and filtrate control with less mixing time and product loss. Its performance supports suspension and hole cleaning while promoting cuttings and borehole inhibition, reduced solids buildup, and practical fluid maintenance across demanding operating conditions.",
    benefits: [
      "Develops high-end rheology quickly",
      "Supports suspension and hole cleaning",
      "Provides filtrate-control performance",
      "Compatible with water-based drilling fluids",
    ],
    packaging: "Available in 22.7 kg bags",
    image: "/images/products/unipac-hvd-pallet.webp",
    alt: "Pallet of green and white UniqEnergy UniPAC HVD drilling-fluid additive bags",
  },
  {
    slug: "unipac-lvd",
    path: "/drilling-fluid-systems/unipac-lvd",
    name: "UniPAC LVD",
    category: "Low-viscosity polyanionic cellulose",
    eyebrow: "Filtration control. Minimal viscosity.",
    teaser:
      "A rapidly hydrating low-viscosity PAC developed for filtrate control where additional viscosity is undesirable.",
    description:
      "UniPAC LVD provides efficient filtrate control in water-based drilling fluids without contributing unnecessary viscosity. Rapid, complete hydration helps limit mixing time and losses to solids-control equipment, while supporting a thin, firm filter cake, cuttings encapsulation, borehole inhibition, lower solids buildup, and consistent fluid performance.",
    benefits: [
      "Controls filtrate with minimal added viscosity",
      "Supports a thin, firm filter cake",
      "Promotes cuttings and borehole inhibition",
      "Compatible with water-based drilling fluids",
    ],
    packaging: "Available in 22.7 kg bags",
    image: "/images/products/unipac-lvd-pallet.webp",
    alt: "Pallet of orange and white UniqEnergy UniPAC LVD drilling-fluid additive bags",
  },
  {
    slug: "unistop",
    path: "/drilling-fluid-systems/unistop",
    name: "UniSTOP",
    category: "Water-swellable lost-circulation material",
    eyebrow: "Expand. Seal. Control losses.",
    teaser:
      "A water-swellable synthetic polymer engineered to help control severe seepage and lost circulation in high-loss wells.",
    description:
      "UniSTOP absorbs water and expands to help establish a low-permeability filter cake across porous rock, fissures, and fractures where conventional fluid-loss materials may be insufficient. Its engineered particle-size distribution and manageable absorption profile support practical placement, shear stability, and compatibility with other drilling-fluid products.",
    benefits: [
      "Helps control severe seepage losses",
      "Forms an expansive low-permeability barrier",
      "Engineered for shear stability",
      "Compatible with other drilling-fluid products",
    ],
    packaging: "Available in 25 kg bags",
    image: "/images/products/unistop-pallet.webp",
    alt: "Pallet of red and white UniqEnergy UniSTOP lost-circulation material bags",
  },
  {
    slug: "uniq-rm",
    path: "/drilling-fluid-systems/uniq-rm",
    name: "Uniq-RM",
    category: "Clay-free invert-emulsion system",
    eyebrow: "Clay-free rheology. Responsive control.",
    teaser:
      "An oil-soluble multi-polymer invert system developed to deliver responsive rheology, suspension, and filtration performance without relying on clay.",
    description:
      "Uniq-RM uses oil-soluble polymers to build broad-spectrum rheology, emulsion stability, and filtrate control in oil-based fluids. Rapid fragile-gel development supports suspension and hole cleaning when circulation stops, while immediate break-back helps manage circulating and surge pressures when pumping resumes. The low-solids system also supports lubricity and a thin, slick filter cake.",
    benefits: [
      "Rapid fragile-gel development and break-back",
      "Supports suspension and reliable hole cleaning",
      "Helps manage circulating and surge pressures",
      "Promotes lubricity and filter-cake quality",
    ],
    packaging: "Available in 19 L pails",
    image: "/images/products/uniq-rm-pallet.webp",
    alt: "Pallet of white UniqEnergy Uniq-RM oilfield-chemical pails with green-trimmed labels",
  },
  {
    slug: "unistar",
    path: "/drilling-fluid-systems/unistar",
    name: "UniSTAR",
    category: "Modified-starch filtration-control additive",
    eyebrow: "Filtration control. Minimal viscosity.",
    teaser:
      "A modified-starch additive developed to reduce filtrate across freshwater through saturated-salt water-based fluid systems.",
    description:
      "UniSTAR provides filtration control without a detrimental increase in fluid viscosity across a broad range of water-based environments. The additive also supports cuttings and exposed-formation encapsulation, helping reduce particle dispersion and reactive clay or shale swelling while promoting borehole stability in drilling-fluid and reservoir drill-in applications.",
    benefits: [
      "Reduces filtrate in water-based fluid systems",
      "Controls filtration without excess viscosity",
      "Supports cuttings and formation encapsulation",
      "Helps improve borehole stability",
    ],
    packaging: "Available in 22.68 kg bags",
    image: "/images/products/unistar-pallet.webp",
    alt: "Pallet of yellow and white UniqEnergy UniSTAR filtration-control additive bags",
  },
  {
    slug: "zan-hd",
    path: "/drilling-fluid-systems/zan-hd",
    name: "ZAN HD",
    category: "Highly dispersible xanthan biopolymer",
    eyebrow: "Fast dispersion. Low-end rheology.",
    teaser:
      "A highly dispersible xanthan biopolymer engineered to develop low-end rheology efficiently across water-based fluids.",
    description:
      "ZAN HD disperses rapidly to build low-end rheology while helping minimize mixing issues and product loss. Its low-shear performance supports suspension, hole cleaning, and cuttings transport, while helping reduce annular friction losses and pump-pressure requirements, limit solids buildup, and promote borehole stability across water-based drilling fluids.",
    benefits: [
      "Develops low-end rheology quickly",
      "Supports suspension and hole cleaning",
      "Helps reduce annular friction losses",
      "Compatible with water-based drilling fluids",
    ],
    packaging: "Available in 25 kg bags",
    image: "/images/products/zan-hd-pallet.webp",
    alt: "Pallet of blue and white UniqEnergy ZAN HD xanthan biopolymer bags",
  },
  {
    slug: "solublok",
    path: "/drilling-fluid-systems/solublok",
    name: "SoluBlok",
    category: "Oil-absorbing seepage-loss material",
    eyebrow: "Temporary seal. Controlled dissolution.",
    teaser:
      "A slow-dissolving particulate engineered to absorb oil, expand, and temporarily control seepage in oil-based drilling fluids.",
    description:
      "SoluBlok absorbs oil and expands to help temporarily bridge seepage pathways in oil-based drilling-fluid systems. Its engineered particle-size distribution and shear-stable form support dependable placement and compatibility with other drilling-fluid products, while progressive dissolution under typical downhole conditions helps minimize the potential for persistent formation residue.",
    benefits: [
      "Helps control seepage in oil-based fluids",
      "Expands through oil absorption",
      "Engineered for shear stability",
      "Designed for progressive downhole dissolution",
    ],
    packaging: "Available in 11.3 kg bags",
    image: "/images/products/solublok-pallet.webp",
    alt: "Pallet of grey and white UniqEnergy SoluBlok seepage-loss material bags",
  },
  {
    slug: "epsealon",
    path: "/drilling-fluid-systems/epsealon",
    name: "EpSealon",
    category: "Removable fluid-loss material",
    eyebrow: "Seal while drilling. Wash away after.",
    teaser:
      "An engineered fluid-loss material developed to form an expansive low-permeability filter cake that can be removed after drilling.",
    description:
      "EpSealon is designed for formations where fissures, fractures, or highly porous rock can allow substantial drilling-fluid losses. The material builds an expansive, nearly impermeable filter cake across the formation surface, then can be washed from the formation after drilling to help limit persistent blockage and protect productive intervals.",
    benefits: [
      "Helps control losses across porous formations",
      "Forms an expansive low-permeability seal",
      "Creates a breakable filter cake",
      "Designed for post-drilling washability",
    ],
    packaging: "Available in 11.3 kg bags",
    image: "/images/products/epsealon-pallet.webp",
    alt: "Pallet of purple and white UniqEnergy EpSealon fluid-loss material bags",
  },
  {
    slug: "kaolok",
    path: "/drilling-fluid-systems/kaolok",
    name: "KaoloK",
    category: "Kaolinite fines-control treatment",
    eyebrow: "Hold fines in place. Protect permeability.",
    teaser:
      "A formation treatment developed to reduce kaolinite fines migration and the pore-throat plugging associated with permeability damage.",
    description:
      "KaoloK increases the force required for mobile kaolinite fines to move through the pore network. By helping stabilize these high-surface-area particles near the wellbore, the treatment is designed to reduce fines migration, limit pore-throat plugging, and protect formation permeability during fluid flow.",
    benefits: [
      "Helps reduce kaolinite fines migration",
      "Supports protection against pore-throat plugging",
      "Targets near-wellbore formation damage",
      "Helps preserve formation permeability",
    ],
    packaging: "Available in 1000 L totes",
    image: "/images/products/kaolok-tote.webp",
    alt: "Green UniqEnergy KaoloK formation-treatment tote in a galvanized cage",
  },
];

export const publicProductPaths = new Set(publicProducts.map((product) => product.path));

export function findPublicProduct(path: string) {
  return publicProducts.find((product) => product.path === path);
}
