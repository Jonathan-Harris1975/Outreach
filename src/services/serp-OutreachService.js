import { serpLookup, enrichDomain } from "./outreachCore.js";
import { batchValidateEmails } from "./zeroBounceBatch.js";

export async function serpOutreach(keyword) {
  console.log(`🔍 SERP for keyword: ${keyword}`);
  const serp = await serpLookup(keyword);

  const raw = Array.isArray(serp?.results) ? serp.results : [];
  const domains = [];

  raw.forEach(r => {
    try {
      const u = new URL(r.link || r.url);
      domains.push(u.hostname.replace(/^www\./, ""));
    } catch {}
  });

  const unique = [...new Set(domains)].slice(0, 10);
  console.log(`Found ${unique.length} unique domains`);

  const enriched = [];
  for (const d of unique) {
    try {
      enriched.push(await enrichDomain(d));
    } catch (err) {
      console.log(`❌ enrichDomain failed for ${d}: ${err.message}`);
    }
  }

  // 🔥 ZeroBounce once per keyword
  const allEmails = enriched.flatMap(e => e.emails);
  const validationMap = await batchValidateEmails(allEmails);

  enriched.forEach(e => {
    e.emails = e.emails.map(email => {
      const v = validationMap.get(email) || { status: "unknown" };
      let score = 0.3;
      if (v.status === "valid") score = 1;
      else if (v.status === "catch-all") score = 0.5;
      return { email, validation: v, score };
    });
  });

  return { keyword, domains: enriched };
}
