// src/services/serp-OutreachService.js

import { serpLookup, enrichDomain } from "./outreachCore.js";

const BAD_DOMAINS = [
  "youtube.com","amazon.com","facebook.com","instagram.com",
  "pinterest.com","reddit.com","quora.com","linkedin.com","x.com","twitter.com"
];

// Extract domains from SERP results
export function extractDomainPositions(serp) {
  const organic = serp?.organic_results || serp?.results || [];
  const map = new Map();

  organic.forEach((item, idx) => {
    if (!item?.link) return;
    try {
      const url = new URL(item.link);
      const host = url.hostname.replace(/^www\./, "");
      if (BAD_DOMAINS.includes(host)) return;

      const pos = idx + 1;
      const existing = map.get(host);
      if (!existing || pos < existing) map.set(host, pos);
    } catch {}
  });

  return Array.from(map.entries()).map(([domain, position]) => ({
    domain,
    serpPosition: position
  }));
}

/* -----------------------------------------------------------------------
   OPTIMISED LEAD SCORE — NEW GEN VERSION
   Score = DA weight (0–50) + SERP weight (0–30) + Email weight (0–20)
------------------------------------------------------------------------ */

export function computeLeadScore({ da, serpPosition, bestEmailScore }) {
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const daScore = (clamp(da, 0, 100) / 100) * 50;

  let serpScore = 0;
  if (serpPosition >= 1 && serpPosition <= 20) {
    const factor = clamp(21 - serpPosition, 0, 20);
    serpScore = (factor / 20) * 30;
  }

  const emailScore = clamp(bestEmailScore || 0, 0, 1) * 20;

  return {
    total: Math.round((daScore + serpScore + emailScore) * 10) / 10,
    breakdown: {
      daScore:Math.round(daScore*10)/10,
      serpScore:Math.round(serpScore*10)/10,
      emailScore:Math.round(emailScore*10)/10
    }
  };
}

/* -----------------------------------------------------------------------
   MAIN OUTREACH FUNCTION
------------------------------------------------------------------------ */

export async function serpOutreach(keyword) {
  console.log(`🔍 SERP for keyword: ${keyword}`);

  const serp = await serpLookup(keyword);
  const domainEntries = extractDomainPositions(serp);

  const leads = [];

  for (const entry of domainEntries) {
    const { domain, serpPosition } = entry;

    const enriched = await enrichDomain(domain);

    const bestEmailScore = Math.max(
      ...enriched.emails.map(e => e.score || 0), 0
    );

    const score = computeLeadScore({
      da: enriched.da,
      serpPosition,
      bestEmailScore
    });

    leads.push({
      domain,
      serpPosition,
      da: enriched.da,
      emails: enriched.emails,
      score: score.total,
      scoreBreakdown: score.breakdown
    });

    // slow down API hammering
    await new Promise(res => setTimeout(res, 500));
  }

  leads.sort((a, b) => b.score - a.score);

  return {
    keyword,
    totalDomains: domainEntries.length,
    leads
  };
      }
