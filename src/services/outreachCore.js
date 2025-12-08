
import axios from "axios";

const API_HOST = "serp-data-scraper.p.rapidapi.com";
const API_KEY = process.env.RAPIDAPI_KEY;

const wait = (ms) => new Promise(res => setTimeout(res, ms));

async function safeApiCall(url, params = {}, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "X-RapidAPI-Key": API_KEY,
          "X-RapidAPI-Host": API_HOST
        },
        timeout: 20000
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;

      if (status === 401) {
        console.log("⚠️ 401 Unauthorized – API key or quota issue");
        await wait(3000);
      }

      if (status === 429) {
        const delay = attempt * 2500;
        console.log(`⏳ 429 rate limit — retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }

      if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`⚠️ API error (${status}) — retry in ${delay}ms`);
        await wait(delay);
        continue;
      }

      throw err;
    }
  }
}

export async function serpLookup(keyword) {
  return safeApiCall(
    "https://serp-data-scraper.p.rapidapi.com/scrape",
    { q: keyword, gl: "uk", hl: "en" }
  );
}

export async function outreachScan(domain) {
  return safeApiCall(
    "https://serp-data-scraper.p.rapidapi.com/website-scan",
    { domain }
  );
}
