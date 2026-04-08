const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY environment variable is not set' })
    };
  }

  let verbs;
  try {
    const body = JSON.parse(event.body);
    verbs = body.verbs;
    if (!verbs || typeof verbs !== 'string' || verbs.trim().length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No verbs provided' }) };
    }
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const prompt = `You are a French grammar expert. Generate quiz questions for the following French verbs.

VERBS: ${verbs.trim()}

Generate conjugations for ALL verbs listed across ALL these tenses:
- présent (all 6 subjects: je, tu, il/elle, nous, vous, ils/elles)
- passé composé (4 subjects)
- imparfait (4 subjects)
- futur simple (4 subjects)
- conditionnel (4 subjects)
- conditionnel passé (3 subjects)
- plus-que-parfait (3 subjects)
- subjonctif présent (4 subjects using "que je", "que tu", "qu'il/elle", "que nous", "que vous", "qu'ils/elles")

Also add STEM questions for each verb:
- futur/conditionnel stem (e.g. "saur-")
- participe passé
- subjonctif stem only if irregular
- auxiliaire only if être (not avoir)

RULES:
- Use correct French accents on all words
- For être-verbs (naître, mourir, aller, venir, partir, etc.) use être as auxiliary
- Do NOT include any hints or explanations in the answers

Return ONLY a raw JSON array — no markdown fences, no backticks, no explanation text before or after.
Each object must have exactly these 5 keys:
"verb" (infinitive string), "tense" (French tense name string), "k" (one of: present/passe/imparfait/futur/cond/condp/plusque/subj/stem), "sub" (subject pronoun string), "ans" (correct conjugation string)`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const responseText = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { resolve(data); });
      });
      req.on('error', (e) => { reject(e); });
      req.write(requestBody);
      req.end();
    });

    const data = JSON.parse(responseText);

    if (data.error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Anthropic API error: ' + data.error.message })
      };
    }

    const raw = data.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const clean = raw.replace(/```json|```/gi, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not parse Claude response as JSON' })
      };
    }

    if (!Array.isArray(parsed) || parsed.length < 5) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Response was not a valid question array' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: parsed })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Function error: ' + e.message })
    };
  }
};
