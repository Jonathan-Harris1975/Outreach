// src/utils/filters.js

export function extractGoodLeads(outreachResult, keyword) {
  const MIN_LEAD_SCORE = 30;    // tuned for new scoring model
  const MIN_EMAIL_SCORE = 0.5;  // ZeroBounce-based score

  const out = [];

  if (!outreachResult || !Array.isArray(outreachResult.leads)) {
    return out;
  }

  outreachResult.leads.forEach((l) => {
    if (typeof l.score !== "number" || l.score < MIN_LEAD_SCORE) return;

    const emails = Array.isArray(l.emails) ? l.emails : [];

    emails.forEach((e) => {
      if (!e.valid) return;
      if (typeof e.score !== "number" || e.score < MIN_EMAIL_SCORE) return;

      out.push({
        timestamp: new Date().toISOString(),
        keyword,
        domain: l.domain,
        da: l.da,
        serpPosition: l.serpPosition,
        email: e.email,
        emailScore: e.score,
        leadScore: l.score,
      });
    });
  });

  return out;
}
