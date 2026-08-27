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
    packaging: "Available in 1000 L totes",
    image: "/images/products/unicide-g15-tote.webp",
    alt: "Blue UniqEnergy UniCide-G15 oilfield-chemical tote in a galvanized cage",
  },
];

export const publicProductPaths = new Set(publicProducts.map((product) => product.path));

export function findPublicProduct(path: string) {
  return publicProducts.find((product) => product.path === path);
}
