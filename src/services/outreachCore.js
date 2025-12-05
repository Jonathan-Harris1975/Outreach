import axios from "axios";

const KEY = process.env.RAPID_API_KEY;

export async function getDomainAuthority(domain) {
  const url = `https://domain-da-pa-check2.p.rapidapi.com/check?domain=${domain}`;
  return (await axios.get(url, {
    headers: {
      "x-rapidapi-key": KEY,
      "x-rapidapi-host": "domain-da-pa-check2.p.rapidapi.com"
    }
  })).data;
}

export async function serpLookup(query) {
  const url = `https://serpapi.p.rapidapi.com/search`;
  return (await axios.get(url, {
    headers: {
      "x-rapidapi-key": KEY,
      "x-rapidapi-host": "serpapi.p.rapidapi.com"
    },
    params: { engine: "google", q: query, hl: "en", gl: "gb" }
  })).data;
}

export async function findEmails(domain) {
  const url = `https://email-address-finder1.p.rapidapi.com/emailjob?website=${domain}`;
  return (await axios.get(url, {
    headers: {
      "x-rapidapi-key": KEY,
      "x-rapidapi-host": "email-address-finder1.p.rapidapi.com"
    }
  })).data;
}

export async function validateEmail(email) {
  const url = `https://easy-email-validation.p.rapidapi.com/validate-v2?email=${email}`;
  return (await axios.get(url, {
    headers: {
      "x-rapidapi-key": KEY,
      "x-rapidapi-host": "easy-email-validation.p.rapidapi.com"
    }
  })).data;
}

export async function outreachScan(domain) {
  const da = await getDomainAuthority(domain);
  const found = await findEmails(domain);
  const emails = found?.emails || [];

  const validated = [];
  for (const email of emails) {
    const v = await validateEmail(email);
    validated.push({
      email,
      valid: v?.status === "valid",
      score: v?.score,
      raw: v
    });
  }

  return { domain, da, emails: validated };
}