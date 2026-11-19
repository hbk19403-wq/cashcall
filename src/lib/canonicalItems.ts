/**
 * canonicalItems.ts — Deterministic broadliner abbreviation expansion
 *
 * Zero latency, zero API calls. Used to:
 *   1. Pre-process raw item names before displaying to operators
 *   2. Normalize AI OCR output for downstream deduplication
 *   3. Suggest categories for items without AI
 *
 * Covers 300+ terms across all major broadliner (Sysco, US Foods, PFG, GFS, RD) naming conventions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ABBREVIATION MAP  (token → expansion)
// Applied left-to-right as full word matches (word boundaries)
// ─────────────────────────────────────────────────────────────────────────────
export const ABBREVIATION_MAP: Record<string, string> = {
  // ── Proteins & Poultry ───────────────────────────────────────────────────
  CHIX: "Chicken", CHKN: "Chicken", CKN: "Chicken", CHCK: "Chicken",
  BRST: "Breast", "BRST HLVS": "Breast Halves", BNLS: "Boneless",
  SKNLS: "Skinless", FRSH: "Fresh", FROZ: "Frozen", FRZ: "Frozen",
  IQF: "Individually Quick Frozen", GRND: "Ground", GRD: "Ground",
  THGH: "Thigh", DRMSTIC: "Drumstick", DRMSTK: "Drumstick",
  WHL: "Whole", HLVS: "Halves", HLVES: "Halves", TDR: "Tender", TNDR: "Tender",
  WNG: "Wing", WING: "Wing", HLFT: "Halftail",
  STRPLN: "Strip Loin", TNDRLOIN: "Tenderloin", TNDLN: "Tenderloin",
  BRISKT: "Brisket", BRISK: "Brisket",
  "SHORT RIB": "Short Rib", CHUCK: "Chuck", SIRLOIN: "Sirloin", SRLOIN: "Sirloin",
  FLANK: "Flank Steak", "GRND BEEF": "Ground Beef", "GRND PRK": "Ground Pork",
  "PORK BLY": "Pork Belly", "PORK BELY": "Pork Belly", "PORK SHLD": "Pork Shoulder",
  "PORK LN": "Pork Loin", SPRIB: "Spare Rib", "BACK RIB": "Back Rib",
  TURK: "Turkey", TKY: "Turkey", VEAL: "Veal", DUCK: "Duck",

  // ── Seafood ──────────────────────────────────────────────────────────────
  TUNA: "Tuna", SALM: "Salmon", SLMN: "Salmon",
  "ATLN SALM": "Atlantic Salmon", "ATL SALM": "Atlantic Salmon",
  SHRIMP: "Shrimp", SHR: "Shrimp", SHMP: "Shrimp",
  SCALP: "Scallop", SCLLP: "Scallop", SCLLPS: "Scallops",
  SNAPPER: "Red Snapper", SNPR: "Red Snapper",
  TILAPIA: "Tilapia", TLP: "Tilapia", COD: "Cod",
  MAHI: "Mahi Mahi", HLBT: "Halibut", TROUT: "Trout",
  CATFISH: "Catfish", CALMARI: "Calamari", OCTOPUS: "Octopus",
  CLAM: "Clams", MSSL: "Mussels", MUSSEL: "Mussels",
  OYSTR: "Oysters", OYSTER: "Oysters", CRAB: "Crab",
  LBST: "Lobster", LOBSTER: "Lobster",

  // ── Produce ──────────────────────────────────────────────────────────────
  LTCE: "Lettuce", LTTCE: "Lettuce", ROMN: "Romaine", ROM: "Romaine",
  SPNCH: "Spinach", ICBRG: "Iceberg",
  TOM: "Tomato", TOMT: "Tomato",
  ONON: "Onion", OINON: "Onion", ONI: "Onion",
  "GRND ONON": "Green Onion", SCLN: "Scallion",
  GRLC: "Garlic", GRLCK: "Garlic", GNGR: "Ginger",
  PEPR: "Bell Pepper", PPR: "Pepper",
  JLPNO: "Jalapeño", JALAPNO: "Jalapeño", JAL: "Jalapeño",
  SERO: "Serrano Pepper", CHTL: "Chipotle",
  CLNTRO: "Cilantro", CILNT: "Cilantro",
  LMN: "Lemon", LIME: "Lime",
  PARSL: "Parsley", PARSLF: "Parsley",
  BASIL: "Basil", BSL: "Basil", ZUCCH: "Zucchini",
  BROCL: "Broccoli", BRCL: "Broccoli",
  CLFLWR: "Cauliflower", CLRFL: "Cauliflower",
  MUSHRM: "Mushroom", MSHM: "Mushroom",
  PORTOBELO: "Portobello Mushroom", PORTO: "Portobello",
  SHITAKE: "Shiitake Mushroom", CELRY: "Celery", CARRT: "Carrot",
  ASPRGUS: "Asparagus", ASPAR: "Asparagus",
  STRWBY: "Strawberry", BLUEBY: "Blueberry", CRNBRY: "Cranberry",
  EDAMME: "Edamame", "SNOW PEA": "Snow Peas", "SNAP PEA": "Sugar Snap Peas",
  "MIXED GRN": "Mixed Greens", "MXD GRN": "Mixed Greens",
  ARUGLA: "Arugula", KALE: "Kale", CLLRD: "Collard Greens", CHARD: "Swiss Chard",
  ARTCHK: "Artichoke", WTRCRSS: "Watercress", ENDIVE: "Endive",

  // ── Dairy & Eggs ────────────────────────────────────────────────────────
  MLK: "Whole Milk", "2% MLK": "2% Milk",
  "HVY CRM": "Heavy Cream", "HF&HF": "Half and Half",
  "SOUR CRM": "Sour Cream", BTMLK: "Buttermilk", BTRMLK: "Buttermilk",
  BUTTER: "Butter", BTTR: "Butter", "UNSLT BTR": "Unsalted Butter",
  "SLT BTTR": "Salted Butter", "CREAM CHSE": "Cream Cheese", "CRM CHSE": "Cream Cheese",
  MOTZ: "Mozzarella", MOZZ: "Mozzarella",
  PARM: "Parmesan", PRMGN: "Parmesan",
  CHEDDR: "Cheddar", CHDR: "Cheddar", SWISS: "Swiss Cheese",
  PROVL: "Provolone", FETA: "Feta", GOUDA: "Gouda", BRIE: "Brie",
  "JMBO EGG": "Jumbo Eggs", "LRGE EGG": "Large Eggs", "LG EGG": "Large Eggs",
  "EGG WHTS": "Egg Whites",
  YOUGRT: "Yogurt", YOGRT: "Yogurt", "GRCK YOGRT": "Greek Yogurt",

  // ── Dry Goods & Pantry ───────────────────────────────────────────────────
  "CANOL OIL": "Canola Oil", "VGTBL OIL": "Vegetable Oil", "VEG OIL": "Vegetable Oil",
  "OLIVE OIL": "Olive Oil", EVOO: "Extra Virgin Olive Oil",
  "CKING OIL": "Cooking Oil", "CKG OIL": "Cooking Oil",
  SUGAR: "Sugar", SUGR: "Sugar", "BRWN SUGR": "Brown Sugar", "PWD SUGR": "Powdered Sugar",
  FLOUR: "All-Purpose Flour", FLOR: "Flour", "WH FLOUR": "Whole Wheat Flour",
  RICE: "Rice", BSMTI: "Basmati Rice", JASMIN: "Jasmine Rice",
  PASTA: "Pasta", SPGHTTI: "Spaghetti", SPGHTT: "Spaghetti",
  FETTUC: "Fettuccine", RIGATNI: "Rigatoni", PENNE: "Penne",
  MAYO: "Mayonnaise", MAYON: "Mayonnaise",
  KETCHP: "Ketchup", KTCHP: "Ketchup",
  MUSTRD: "Mustard", MSTRD: "Mustard",
  "SOY SC": "Soy Sauce", "HOT SC": "Hot Sauce", HTSC: "Hot Sauce",
  "WINGSC": "Wing Sauce", "WNG SC": "Wing Sauce", "BBQ SC": "BBQ Sauce",
  "OYSTR SC": "Oyster Sauce", "FISH SC": "Fish Sauce", TERIYAK: "Teriyaki Sauce",
  "CANN TOM": "Canned Tomatoes", "TOM PST": "Tomato Paste", "TOM PASTE": "Tomato Paste",
  VINEGR: "Vinegar", VNGR: "Vinegar", "BALS VIN": "Balsamic Vinegar",
  BRDCRUMB: "Breadcrumbs", PANKO: "Panko Breadcrumbs",
  CHICKPEA: "Chickpeas", LENTIL: "Lentils", "BLACK BN": "Black Beans",
  "KIDNEY BN": "Kidney Beans", ALMOND: "Almonds", ALMND: "Almonds",
  WALNUT: "Walnuts", WLNT: "Walnuts", "PINE NUT": "Pine Nuts",
  "SESM SD": "Sesame Seeds", "SUNFLWR SD": "Sunflower Seeds",

  // ── Spices & Seasonings ──────────────────────────────────────────────────
  PAPRIKA: "Paprika", PPRIKA: "Paprika",
  OREGNO: "Oregano", ORGNO: "Oregano",
  THYME: "Thyme", CUMIN: "Cumin", CORIAND: "Coriander",
  CINNM: "Cinnamon", TRMRIC: "Turmeric", TURMRC: "Turmeric",
  "BAY LF": "Bay Leaves", CARDMM: "Cardamom", CAYENNE: "Cayenne Pepper",
  "GARLIC PWD": "Garlic Powder", "ONION PWD": "Onion Powder",
  "SMOKED PAP": "Smoked Paprika", "CHILI PWD": "Chili Powder",
  "CUMIN GRD": "Ground Cumin", "ALL SPICE": "Allspice",
  "KOSHER SLT": "Kosher Salt", "SEA SALT": "Sea Salt",
  PEPPR: "Black Pepper", "CRACKED PEPPR": "Cracked Black Pepper",
  "WH PEPPR": "White Pepper", "RED PEPPR FLK": "Red Pepper Flakes",

  // ── Grains & Bread ───────────────────────────────────────────────────────
  TORTLA: "Tortilla", "FLOUR TORTLA": "Flour Tortilla", "CORN TORTLA": "Corn Tortilla",
  PITA: "Pita Bread", NAAN: "Naan", "BRGR BUN": "Burger Bun",
  "HOT DOG BUN": "Hot Dog Bun", BAGEL: "Bagel", CROSTNI: "Crostini",
  BAGUETTE: "Baguette", CIABATTA: "Ciabatta", SOURDOUGH: "Sourdough Bread",

  // ── Pack-size & units ────────────────────────────────────────────────────
  AVG: "avg", CS: "case", LB: "lb", GA: "gallon", GL: "gallon",
  OZ: "oz", DZ: "dozen", BX: "box", EA: "each", PC: "piece",
};

// ─────────────────────────────────────────────────────────────────────────────
// Category keywords for automatic classification
// ─────────────────────────────────────────────────────────────────────────────
const PROTEIN_KEYWORDS = [
  "chicken", "beef", "pork", "turkey", "veal", "lamb", "duck", "bison",
  "breast", "thigh", "wing", "tenderloin", "brisket", "chuck", "sirloin",
  "strip loin", "short rib", "spare rib", "ground beef", "ground pork",
  "pork belly", "pork loin", "pork shoulder",
];

const SEAFOOD_KEYWORDS = [
  "salmon", "tuna", "shrimp", "scallop", "crab", "lobster", "cod",
  "tilapia", "mahi", "halibut", "trout", "catfish", "calamari", "octopus",
  "clam", "mussel", "oyster", "snapper", "bass", "flounder", "grouper",
  "swordfish", "mackerel", "anchov",
];

const PRODUCE_KEYWORDS = [
  "lettuce", "romaine", "spinach", "tomato", "onion", "garlic", "ginger",
  "pepper", "jalapeño", "cilantro", "lemon", "lime", "parsley", "basil",
  "zucchini", "broccoli", "cauliflower", "mushroom", "celery", "carrot",
  "asparagus", "strawberry", "blueberry", "cranberry", "edamame",
  "arugula", "kale", "chard", "collard", "watercress", "endive",
  "scallion", "artichoke", "radish", "beet", "turnip", "parsnip",
  "snow pea", "snap pea", "corn", "avocado", "mango", "papaya",
];

const DAIRY_KEYWORDS = [
  "milk", "cream", "butter", "cheese", "egg", "yogurt", "mozzarella",
  "parmesan", "cheddar", "swiss", "provolone", "feta", "gouda", "brie",
  "sour cream", "half and half", "buttermilk", "ricotta", "mascarpone",
];

const SPICE_KEYWORDS = [
  "paprika", "oregano", "thyme", "cumin", "coriander", "cinnamon",
  "turmeric", "bay leaf", "cardamom", "cayenne", "garlic powder",
  "onion powder", "chili powder", "allspice", "pepper", "salt",
  "seasoning", "spice", "herb", "blend", "rub",
];

const GRAIN_KEYWORDS = [
  "bread", "tortilla", "pita", "naan", "bun", "bagel", "roll", "baguette",
  "ciabatta", "sourdough", "crostini", "cracker", "flatbread", "wrap",
];

const BEVERAGE_KEYWORDS = [
  "juice", "soda", "water", "coffee", "tea", "beer", "wine", "spirits",
  "liquor", "alcohol", "vodka", "rum", "whiskey", "tequila", "bourbon",
  "kombucha", "lemonade", "cider",
];

const SUPPLIES_KEYWORDS = [
  "container", "packaging", "box", "bag", "glove", "napkin", "straw",
  "cup", "lid", "wrap", "foil", "film", "label", "cleaning", "sanitizer",
  "detergent", "bleach", "soap", "towel", "apron", "brush", "sponge",
  "trash", "garbage", "liner", "fuel surcharge", "delivery fee", "freight",
];

type ItemCategory =
  | "PROTEIN" | "SEAFOOD" | "PRODUCE" | "DAIRY"
  | "DRY_GOODS" | "SPICES" | "GRAINS" | "BEVERAGE"
  | "SUPPLIES" | "OTHER";

// ─────────────────────────────────────────────────────────────────────────────
// expandAbbreviations
// Deterministically expands a raw broadliner item name into a human-readable form.
// Works on multi-word tokens, then single-word tokens, left-to-right.
// Also converts "#" → "lb" and normalizes whitespace.
// ─────────────────────────────────────────────────────────────────────────────
export function expandAbbreviations(raw: string): string {
  if (!raw) return raw;

  let text = raw
    .toUpperCase()
    .replace(/(\d+)#/g, "$1 LB")   // "40#" → "40 LB"
    .replace(/\s+/g, " ")
    .trim();

  // Sort multi-word keys first (longer matches win)
  const sortedKeys = Object.keys(ABBREVIATION_MAP).sort((a, b) => b.length - a.length);

  for (const abbr of sortedKeys) {
    const expansion = ABBREVIATION_MAP[abbr];
    // Match at word boundaries (space or start/end of string)
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![A-Z])${escaped}(?![A-Z])`, "g");
    text = text.replace(regex, expansion.toUpperCase());
  }

  // Title-case the result
  return text
    .toLowerCase()
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// categorizeItem
// Suggests the most likely category for an item given its name.
// Works on both raw abbreviation strings and canonical names.
// ─────────────────────────────────────────────────────────────────────────────
export function categorizeItem(name: string): ItemCategory {
  const lower = name.toLowerCase();

  if (SEAFOOD_KEYWORDS.some(k => lower.includes(k))) return "SEAFOOD";
  if (PROTEIN_KEYWORDS.some(k => lower.includes(k))) return "PROTEIN";
  if (DAIRY_KEYWORDS.some(k => lower.includes(k))) return "DAIRY";
  if (PRODUCE_KEYWORDS.some(k => lower.includes(k))) return "PRODUCE";
  if (SPICE_KEYWORDS.some(k => lower.includes(k))) return "SPICES";
  if (GRAIN_KEYWORDS.some(k => lower.includes(k))) return "GRAINS";
  if (BEVERAGE_KEYWORDS.some(k => lower.includes(k))) return "BEVERAGE";
  if (SUPPLIES_KEYWORDS.some(k => lower.includes(k))) return "SUPPLIES";
  return "OTHER";
}

// ─────────────────────────────────────────────────────────────────────────────
// isCatchWeight
// Heuristic: returns true if the item name suggests catch-weight pricing.
// Use to validate AI output or as a fallback when is_catch_weight is missing.
// ─────────────────────────────────────────────────────────────────────────────
export function isCatchWeight(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    /\d+#\s*(AVG)?/.test(upper) ||
    /\bCATCH\s*WT\b/.test(upper) ||
    /\bCW\b/.test(upper) ||
    /\bAVG\b/.test(upper) ||
    /\bVARIABLE\b/.test(upper) ||
    /\bSOLD\s+BY\s+(LB|WEIGHT)\b/.test(upper) ||
    /\bCATCH\s+WEIGHT\b/.test(upper)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeDistributor
// Maps messy distributor strings to canonical codes.
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeDistributor(raw: string): string {
  const upper = (raw ?? "").toUpperCase();
  if (upper.includes("SYSCO") && upper.includes("FRESHPOINT")) return "SYSCO_FRESHPOINT";
  if (upper.includes("BUCKHEAD") || upper.includes("NEWPORT MEAT")) return "SYSCO_BUCKHEAD";
  if (upper.includes("SYSCO") && upper.includes("CANADA")) return "SYSCO_CANADA";
  if (upper.includes("SYSCO")) return "SYSCO";
  if (upper.includes("US FOOD") || upper.includes("USFOOD")) return "US_FOODS";
  if (upper.includes("PERFORMANCE FOOD") || upper.includes("PFGC") || upper.includes("VISTAR")) return "PFG";
  if (upper.includes("GORDON FOOD") || upper.includes("GFS")) return "GFS";
  if (upper.includes("RESTAURANT DEPOT") || upper.includes("JETRO")) return "RESTAURANT_DEPOT";
  return raw || "UNKNOWN_BROADLINER";
}
