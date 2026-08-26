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
      "Elixir forms a highly lubricious boundary layer at contact surfaces, helping drilling teams manage friction through demanding intervals without overcomplicating the fluid program.",
    benefits: [
      "Helps reduce rotational torque and drag",
      "Supports a lower coefficient of friction",
      "Helps minimize differential sticking tendency",
      "Designed for water-based drilling fluids",
    ],
    packaging: "Available in 200 L drums",
    image: "/images/products/elixir-pallet.webp",
    alt: "Pallet of four navy UniqEnergy Elixir drilling-fluid lubricant drums",
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
      "Fusion is designed for rapid, complete hydration with less mixing time and product loss, bringing viscosity, suspension, hole cleaning, and filtration performance into one practical package.",
    benefits: [
      "Supports low- and high-end rheology",
      "Provides filtrate-control performance",
      "Hydrates quickly across different water types",
      "Helps simplify inventory and mixing",
    ],
    packaging: "Available in 22.7 kg bags",
    image: "/images/products/fusion-pallet.webp",
    alt: "Pallet of navy and white UniqEnergy Fusion drilling-fluid polymer bags",
  },
];

export const publicProductPaths = new Set(publicProducts.map((product) => product.path));

export function findPublicProduct(path: string) {
  return publicProducts.find((product) => product.path === path);
}
