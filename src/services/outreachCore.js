import axios from "axios";

const KEY = process.env.RAPIDAPI_KEY;

const HOST = {
  serp: "google-search116.p.rapidapi.com",
  da: "domain-authority1.p.rapidapi.com",
  emailFinder: "email-finder12.p.rapidapi.com",
  zeroBounce: "zerobounce1.p.rapidapi.com",
};

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function rapidGet(host, path, params = {}, retries = 5) {
  const url = `https://${host}${path}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "x-rapidapi-key": KEY,
          "x-rapidapi-host": host,
        },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        const delay = attempt * 2000;
        console.log(`429 from ${host} – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }

      if (attempt < retries) {
        const delay = attempt * 1200;
        console.log(`Error from ${host} (${status}) – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }

      throw err;
    }
  }
}

/* -----------------------------------------------------------
 * 1) SERP LOOKUP (google-search116)
 ----------------------------------------------------------- */

export async function serpLookup(keyword) {
  return rapidGet(HOST.serp, "/", { query: keyword }, 3);
}

/* -----------------------------------------------------------
 * 2) Domain Authority (domain-authority1)
 ----------------------------------------------------------- */

export async function fetchDomainAuthority(domain) {
  const data = await rapidGet(
    HOST.da,
    "/seo-tools/get-domain-info",
    { domain },
    3
  );

  return {
    da: data.domainAuthority ?? 0,
    pa: data.pageAuthority ?? 0,
    spam: data.spamScore ?? 0,
  };
}

/* -----------------------------------------------------------
 * 3) Email Finder (email-finder12)
 ----------------------------------------------------------- */

export async function findEmailsForDomain(domain) {
  const data = await rapidGet(
    HOST.emailFinder,
    "/v1/email",
    { domain },
    3
  );

  if (!data || !data.email) {
    return [];
  }

  return [
    {
      email: data.email,
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
    },
  ];
}

/* -----------------------------------------------------------
 * 4) Email Validation (ZeroBounce)
 ----------------------------------------------------------- */

export async function validateEmailAddress(email) {
  const data = await rapidGet(
    HOST.zeroBounce,
    "/v1/activity",
    { email },
    3
  );

  let score = 0;
  const activity = (data?.activity || "").toLowerCase();

  if (activity === "active") score = 1.0;
  else if (activity === "undetermined" || activity === "inactive") score = 0.5;
  else score = 0;

  return {
    valid: !!data?.is_valid,
    score,
  };
}

/* -----------------------------------------------------------
 * 5) Full enrichment pipeline
 ----------------------------------------------------------- */

export async function enrichDomain(domain) {
  console.log(`🔎 Enriching domain: ${domain}`);

  const da = await fetchDomainAuthority(domain);
  const found = await findEmailsForDomain(domain);

  const enrichedEmails = [];

  for (const e of found) {
    const v = await validateEmailAddress(e.email);

    enrichedEmails.push({
      email: e.email,
      valid: v.valid,
      score: v.score,
      confidence: e.confidence,
    });

    await wait(400);
  }

  return {
    domain,
    da: da.da,
    pa: da.pa,
    spam: da.spam,
    emails: enrichedEmails,
  };
}

export default {
  serpLookup,
  fetchDomainAuthority,
  findEmailsForDomain,
  validateEmailAddress,
  enrichDomain,
};
