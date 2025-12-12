import axios from "axios";

const ZERO_API_KEY = process.env.API_ZERO_KEY;
const ZERO_BASE = "https://api.zerobounce.net/v2";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 4000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function batchValidateEmails(emails = []) {
  const resultMap = new Map();

  // Fail-safe: ZeroBounce disabled
  if (!ZERO_API_KEY) {
    console.log("⚠️ ZeroBounce disabled (API_ZERO_KEY missing)");
    emails.forEach((e) => {
      resultMap.set(e, { status: "unknown", sub_status: "not_checked" });
    });
    return resultMap;
  }

  const unique = [...new Set(emails)].filter(
    (e) => typeof e === "string" && e.includes("@")
  );

  const chunks = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    chunks.push(unique.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];

    try {
      const res = await axios.post(
        `${ZERO_BASE}/batch-validate`,
        {
          api_key: ZERO_API_KEY,
          email_batch: batch.map((email) => ({ email_address: email })),
        },
        { timeout: 30000 }
      );

      const data = res.data?.email_batch || [];

      data.forEach((item) => {
        resultMap.set(item.email_address, {
          status: item.status,
          sub_status: item.sub_status,
        });
      });

      console.log(
        `ZeroBounce batch ${i + 1}/${chunks.length} validated (${batch.length})`
      );
    } catch (err) {
      console.log(
        `⚠️ ZeroBounce batch ${i + 1} failed – marking unknown`
      );

      batch.forEach((email) => {
        resultMap.set(email, {
          status: "unknown",
          sub_status: "batch_failed",
        });
      });
    }

    if (i < chunks.length - 1) {
      await wait(BATCH_DELAY_MS);
    }
  }

  return resultMap;
}
