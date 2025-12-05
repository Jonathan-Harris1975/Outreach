import { serpLookup, outreachScan } from "./outreachCore.js";

const BAD_DOMAINS = ["youtube.com","amazon.com","facebook.com","instagram.com","pinterest.com","reddit.com","quora.com","linkedin.com","x.com","twitter.com"];

function extractDomainPositions(serp) {
  const organic = serp?.organic_results || [];
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

  return Array.from(map.entries()).map(([domain, position]) => ({ domain, position }));
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function computeLeadScore({ da, serpPosition, bestEmailScore }) {
  const daScore = (clamp(da || 0, 0, 100) / 100) * 50;

  let serpScore = 0;
  if (serpPosition >= 1 && serpPosition <= 10) {
    const factor = clamp(11 - serpPosition, 0, 10);
    serpScore = (factor / 10) * 30;
  }

  const emailScore = clamp(bestEmailScore || 0, 0, 1) * 20;

  return {
    total: Math.round((daScore + serpScore + emailScore) * 10) / 10,
    breakdown: {
      daScore: Math.round(daScore * 10) / 10,
      serpScore: Math.round(serpScore * 10) / 10,
      emailScore: Math.round(emailScore * 10) / 10
    }
  };
}

export async function serpOutreach(keyword) {
  const serp = await serpLookup(keyword);
  const domainEntries = extractDomainPositions(serp);

  const leads = [];

  for (const { domain, position } of domainEntries) {
    const result = await outreachScan(domain);

    const daValue = result?.da?.da || 0;

    let bestEmailScore = 0;
    result.emails?.forEach(e => {
      if (e.valid && typeof e.score === "number" && e.score > bestEmailScore) {
        bestEmailScore = e.score;
      }
    });

    const score = computeLeadScore({
      da: daValue,
      serpPosition: position,
      bestEmailScore
    });

    leads.push({
      domain,
      serpPosition: position,
      da: result.da || null,
      emails: result.emails || [],
      score: score.total,
      scoreBreakdown: score.breakdown
    });
  }

  leads.sort((a, b) => b.score - a.score || (b?.da?.da || 0) - (a?.da?.da || 0));

  return {
    keyword,
    totalDomains: domainEntries.length,
    leads
  };
}
