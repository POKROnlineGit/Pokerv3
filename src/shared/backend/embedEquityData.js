// One-off script to convert preflop_equities.bin into a JS array module.
// Usage (from project root):
//   node embedEquityData.js

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source binary and target JS module paths
const BIN_PATH = join(
  __dirname,
  "src",
  "domain",
  "evaluation",
  "equity_lookup",
  "preflop_equities.bin"
);
const OUT_PATH = join(
  __dirname,
  "src",
  "domain",
  "evaluation",
  "equity_lookup",
  "preflop_equities_array.js"
);

console.log("[embedEquityData] Reading binary:", BIN_PATH);
const buffer = readFileSync(BIN_PATH);
const uint16 = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);

console.log("[embedEquityData] Entries:", uint16.length);

// We emit a single JS file that exports EQUITY_DATA as a plain array literal.
// This file will be large (~1.7MB before gzip), but parsed once and then reused.
const header = `// GENERATED FILE - DO NOT EDIT BY HAND
// Embedded preflop equities as a plain JS array (Uint16 values).
// Source: preflop_equities.bin

export const EQUITY_DATA = [
`;

const footer = `];
`;

// Stream-friendly generation: chunk the join to avoid huge intermediate strings.
// However, since Node can handle this size, a single join is acceptable here.
const body = Array.from(uint16).join(",");

console.log("[embedEquityData] Writing JS module:", OUT_PATH);
writeFileSync(OUT_PATH, header + body + "\n" + footer, "utf8");

console.log("[embedEquityData] Done.");

