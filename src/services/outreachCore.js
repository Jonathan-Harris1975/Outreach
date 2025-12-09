import axios from "axios";

const KEY = process.env.RAPIDAPI_KEY;

const HOST = {
  serp: "google-search116.p.rapidapi.com",
  da: "domain-da-pa-check2.p.rapidapi.com",
  emailFinder: "email-address-finder1.p.rapidapi.com",
  emailValidator: "easy-email-validation.p.rapidapi.com"
};

const wait = ms => new Promise(res => setTimeout(res, ms));

async function rapidGet(host, path, params = {}, retries = 5) {
  const url = `https://${host}${path}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "x-rapidapi-key": KEY,
          "x-rapidapi-host": host
        },
        timeout: 15000
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        const delay = attempt * 2000;
        console.log(`429 ${host} → retry in ${delay}ms`);
        await wait(delay);
        continue;
      }

      if (attempt < retries) {
        await wait(attempt * 1200);
        continue;
      }
      throw err;
    }
  }
}

/* ------------------------- SERP LOOKUP ------------------------- */

export async function serpLookup(keyword) {
  return rapidGet(HOST.serp, "/", { query: keyword }, 3);
}

/* ----------------------- DOMAIN DA LOOKUP ---------------------- */

export async function fetchDomainAuthority(domain) {
  return rapidGet(HOST.da, "/check", { domain }, 3);
}

/* ----------------------- EMAIL DISCOVERY ----------------------- */

export async function findEmailsForDomain(domain) {
  return rapidGet(HOST.emailFinder, "/emailjob", { website: domain }, 3);
}

/* ---------------------- EMAIL VALIDATION ----------------------- */

export async function validateEmailAddress(email) {
  return rapidGet(HOST.emailValidator, "/validate-v2", { email }, 3);
}

/* ------------------ FULL OUTREACH AGGREGATION ------------------ */
/*
   This is the restored 3-step outreach process:

   1) lookup DA
   2) discover emails
   3) validate emails + return scored list
*/

export async function enrichDomain(domain) {
  console.log(`🔎 Enriching domain: ${domain}`);

  const da = await fetchDomainAuthority(domain);
  const emailSearch = await findEmailsForDomain(domain);

  const enrichedEmails = [];

  if (Array.isArray(emailSearch.emails)) {
    for (const e of emailSearch.emails) {
      const v = await validateEmailAddress(e.email);

      enrichedEmails.push({
        email: e.email,
        valid: v?.valid ?? false,
        score: v?.score ?? 0
      });

      await wait(500); // slow down validation API
    }
  }

  return {
    domain,
    da: da?.da || 0,
    pa: da?.pa || 0,
    spam: da?.spam_score || 0,
    emails: enrichedEmails
  };
}
