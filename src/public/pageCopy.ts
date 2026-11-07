import { coverageSentences, servicePoints } from "./servicePoints.ts";

export const headings = {
  home: { lead: "Engineer the fluid.", rest: "Advance the wellbore." },
  about: { lead: "Built to move with", rest: "the operation." },
  systems: { lead: "Performance in", rest: "every blend." },
  technology: { lead: "Technology built", rest: "around the well." },
  safety: { lead: "Safe work is how", rest: "the work gets done." },
  locations: { lead: "Closer to the field.", rest: "Ready for what’s next." },
  contact: { lead: "Bring us the challenge.", rest: "Let’s connect the next step." },
} as const;

export const plainHeading = (heading: { lead: string; rest: string }) => `${heading.lead} ${heading.rest}`;

export const homeLead = "UniqEnergy is a Calgary drilling fluids company. We supply customized drilling fluid systems, specialty additives, technical expertise, and responsive field support for Western Canadian wellbores.";

export const aboutSummary = "A Calgary drilling fluids company combining responsive support, field intelligence, specialty chemistry, experienced people, and Western Canadian reach.";

export const systemsSummary = "Water-based and oil-based drilling mud systems, with the specialty drilling chemicals used to adjust them.";

export const systemsParagraphs = [
  "Drilling mud is the drilling fluid circulated through the well to carry cuttings and support the wellbore. UniqEnergy develops and supplies water-based and oil-based drilling mud systems for the formation conditions, well geometry, operating priorities, and economics of each program. The portfolio supports rheology, filtration, lubricity, lost-circulation control, microbial control, suspension, and hole cleaning.",
  "Product selection is supported by practical laboratory thinking and responsive field expertise. A qualified drilling-fluids engineer should review current well data before any product or treatment is used in the field.",
] as const;

export const catalogueLead = "Specialty drilling chemicals and additives in this catalogue include";

export const exploreSystemsLabel = "Explore drilling mud systems and drilling chemicals";

export const locationsLinkLabel = "Alberta and Western Canada service points";

export const locationsSummary = "Service points for Alberta drilling fluids programs, plus British Columbia and Saskatchewan, with published addresses and phone numbers.";

const calgaryServicePoint = servicePoints.find((point) => point.id === "calgary");

export const locationsIntro = `These published service points support Alberta drilling fluids programs, with further points in British Columbia and Saskatchewan. ${coverageSentences().join(" ")} Select any address for the map, then call or open directions. The downtown Calgary office is listed on the contact page. The Calgary card on this page is the southeast service point at ${calgaryServicePoint?.address[0] ?? ""}.`;

export const technologyLead = "Chemistry, current field information, and experienced people work together to support stronger drilling-fluid decisions.";

export const safetySummary = "Policies, training, communication, and personal ownership connect safety across the office, facility, field, and client operation.";

export const contactLead = "Talk with our Calgary team about an operation, a fluid program, a technical question, or working with UniqEnergy.";

export const capabilityFacts = [
  ["50,000 L", "Daily blend capacity"],
  ["50+", "Custom products"],
  ["21", "Patents granted & pending"],
  ["45,000 ft²", "SE Calgary facility"],
] as const;

export const aboutPillars = [
  {
    number: "01",
    eyebrow: "Responsiveness & dedicated support",
    title: "Support without the runaround.",
    copy: "Direct access to technical people keeps questions close to the people who can act on them. Fewer communication layers help field response, product coordination, and technical support move with the operation.",
  },
  {
    number: "02",
    eyebrow: "Connected field intelligence",
    title: "Connected information. Faster decisions.",
    copy: "Mobile applications and shared field reporting give office specialists and clients current visibility into the work. Better context supports clearer communication and more confident fluid decisions.",
  },
  {
    number: "03",
    eyebrow: "Specialty chemistry & custom products",
    title: "Chemistry shaped by the well.",
    copy: "Customized fluid programs bring laboratory thinking and field feedback together around actual operating conditions, technical requirements, and project economics.",
  },
  {
    number: "04",
    eyebrow: "Field expertise & people first",
    title: "Experience where it matters.",
    copy: "Experienced field engineers bring practical Western Canadian knowledge to the wellsite. Continuous learning, proactive troubleshooting, and close office collaboration keep sound technical judgment near the work.",
  },
  {
    number: "05",
    eyebrow: "Regional capacity & reach",
    title: "Built in Calgary. Ready across Western Canada.",
    copy: "Our southeast Calgary blending base and access to traditional mud-storage warehouses across Western Canada support dependable supply for operations across the region.",
  },
] as const;

export const visibleH1ByPath = {
  "/": plainHeading(headings.home),
  "/about-us": plainHeading(headings.about),
  "/drilling-fluid-systems": plainHeading(headings.systems),
  "/technology": plainHeading(headings.technology),
  "/health-safety": plainHeading(headings.safety),
  "/locations": plainHeading(headings.locations),
  "/contact-us": plainHeading(headings.contact),
} as const;
