// src/utils/filters.js

export function extractGoodLeads(outreachResult, keyword) {
  const MIN_LEAD_SCORE = 40;     // lowered to widen capture
  const MIN_EMAIL_SCORE = 0.70;  // reliable but not too strict

  const out = [];

  outreachResult.leads.forEach(l => {
    if (l.score < MIN_LEAD_SCORE) return;

    l.emails.forEach(e => {
      if (!e.valid) return;
      if (e.score < MIN_EMAIL_SCORE) return;

      out.push({
        timestamp: new Date().toISOString(),
        keyword,
        domain: l.domain,
        da: l.da,
        serpPosition: l.serpPosition,
        email: e.email,
        emailScore: e.score,
        leadScore: l.score
      });
    });
  });

  return out;
}
