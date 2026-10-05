const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Adds the signup to a Kit (formerly ConvertKit) form via their API — free
// tier covers up to 10,000 subscribers, and unlike a hand-rolled JSON file
// this gives you a real, taggable list you can actually email when PostFlo
// launches.
//
// Two calls, verified against the live API (the single-call "add by email"
// shortcut in Kit's docs 404s on this account/form type — this account only
// works with the two-step flow below):
//   1. POST /v4/subscribers                       — create/find the subscriber
//   2. POST /v4/forms/{form_id}/subscribers/{id}   — attach them to the form
// https://developers.kit.com/api-reference/subscribers/create-a-subscriber
// https://developers.kit.com/api-reference/forms/add-subscriber-to-form
//
// Requires two env vars in the Vercel project (Settings → Environment Variables):
//   KIT_API_KEY  — Kit dashboard → Settings → Developer → API Keys
//   KIT_FORM_ID  — the numeric id of the form you're collecting into
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const email = String((body && body.email) || '').trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;
  if (!apiKey || !formId) {
    console.error('subscribe: KIT_API_KEY / KIT_FORM_ID are not set — add them in the Vercel project env vars.');
    return res.status(500).json({ error: 'Waitlist is not configured yet' });
  }

  const kitHeaders = {
    'Content-Type': 'application/json',
    'X-Kit-Api-Key': apiKey,
  };

  try {
    const createRes = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: kitHeaders,
      body: JSON.stringify({ email_address: email }),
    });

    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      console.error('Kit create-subscriber failed', createRes.status, detail);
      return res.status(502).json({ error: 'Could not reach the waitlist service. Please try again.' });
    }

    const { subscriber } = await createRes.json();

    const attachRes = await fetch(`https://api.kit.com/v4/forms/${formId}/subscribers/${subscriber.id}`, {
      method: 'POST',
      headers: kitHeaders,
    });

    if (!attachRes.ok) {
      const detail = await attachRes.text().catch(() => '');
      console.error('Kit add-to-form failed', attachRes.status, detail);
      return res.status(502).json({ error: 'Could not reach the waitlist service. Please try again.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
