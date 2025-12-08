
import fs from "fs";
import path from "path";
import { serpOutreach } from "./serp-OutreachService.js";
import { extractGoodLeads } from "../utils/filters.js";
import { appendLeadRows } from "./sheetService.js";

function loadKeywordsFromFile(filePath = "keywords.txt") {
  const full = path.resolve(process.cwd(), filePath);
  const data = fs.readFileSync(full, "utf8");
  return data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function chunk(arr, size = 50) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runSequentialSerpSearches(input) {
  let keywords = input;
  if (typeof input === "string") keywords = loadKeywordsFromFile(input);
  if (!Array.isArray(keywords)) throw new Error("Invalid keyword input");

  const batches = chunk(keywords, 50);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`\n===== Batch ${b + 1} of ${batches.length} (size ${batch.length}) =====`);
    for (let i = 0; i < batch.length; i++) {
      const kw = batch[i];
      console.log(`\n[${i + 1}/${batch.length}] SERP scan: ${kw}`);
      try {
        const result = await serpOutreach(kw);
        const good = extractGoodLeads(result, kw);
        if (good.length) {
          const rows = good.map(r => [
            r.timestamp,
            r.keyword,
            r.domain,
            r.da,
            r.serpPosition,
            r.email,
            r.emailScore,
            r.leadScore
          ]);
          await appendLeadRows(rows);
          console.log(`Saved ${good.length} leads.`);
        } else {
          console.log("No valid leads.");
        }
      } catch (err) {
        console.log("Error:", err.message);
      }
    }
  }
}

if (process.argv[1].includes("serp-runner.js")) {
  const keywords = loadKeywordsFromFile("keywords.txt");
  runSequentialSerpSearches(keywords).then(() =>
    console.log("All batches complete.")
  );
}
