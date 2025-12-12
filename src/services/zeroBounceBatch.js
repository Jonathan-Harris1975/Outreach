// src/services/zeroBounceBatch.js

import axios from "axios";

const ZERO_API_KEY = process.env.API_ZERO_KEY;
const ZERO_BASE = "https://api.zerobounce.net/v2";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 4000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function batchValidateEmails(emails = []) {
  if (!ZERO_API_KEY) throw new Error("API_ZERO_KEY missing");

  const results = new Map();

  const chunks = [];
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    chunks.push(emails.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];

    const payload = {
      api_key: ZERO_API_KEY,
      email_batch: batch.map((email) => ({
        email_address: email,
      })),
    };

    try {
      const res = await axios.post(
        `${ZERO_BASE}/batch-validate`,
        payload,
        { timeout: 30000 }
      );

      const data = res.data?.email_batch || [];

      data.forEach((item) => {
        results.set(item.email_address, {
          status: item.status,
          sub_status: item.sub_status,
        });
      });

      console.log(
        `ZeroBounce batch ${i + 1}/${chunks.length} validated (${batch.length} emails)`
      );

    } catch (err) {
      console.log(
        `ZeroBounce batch ${i + 1} failed – marking as unknown`
      );

      batch.forEach((email) => {
        results.set(email, {
          status: "unknown",
          sub_status: "batch_failed",
        });
      });
    }

    if (i < chunks.length - 1) {
      await wait(BATCH_DELAY_MS);
    }
  }

  return results;
}
