
import fs from "fs";
import path from "path";
import { serpOutreach } from "./serp-OutreachService.js";
import { extractGoodLeads } from "../utils/filters.js";
import { appendLeadRows } from "./sheetService.js";

const wait = ms => new Promise(res => setTimeout(res, ms));
const RATE_DELAY = 2500;

function loadKeywordsFromFile(filePath = "keywords.txt") {
  const full = path.resolve(process.cwd(), filePath);
  const data = fs.readFileSync(full, "utf8");
  return data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

export async function runSequentialSerpSearches(input) {
  let keywords = input;
  if (typeof input === "string") keywords = loadKeywordsFromFile(input);
  if (!Array.isArray(keywords)) throw new Error("Invalid keyword input");

  const maxRun = 50;
  const slice = keywords.slice(0, maxRun);

  console.log(`Running rationed block of ${slice.length} keywords`);

  for (let i = 0; i < slice.length; i++) {
    const kw = slice[i];
    console.log(`\n[${i + 1}/${slice.length}] SERP scan: ${kw}`);

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
          r.leadScore,
        ]);
        await appendLeadRows(rows);
        console.log(`Saved ${good.length} leads`);
      }
    } catch (err) {
      console.log("Error:", err.message);
    }

    await wait(RATE_DELAY);
  }
}

if (process.argv[1].includes("serp-runner.js")) {
  const keywords = loadKeywordsFromFile("keywords.txt");
  runSequentialSerpSearches(keywords).then(() =>
    console.log("Rationed block complete.")
  );
}
