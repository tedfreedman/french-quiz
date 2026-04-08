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
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set' })
    };
  }

  let verbs;
  try {
    const body = JSON.parse(event.body);
    verbs = body.verbs;
    if (!verbs || typeof verbs !== 'string' || verbs.trim().length === 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No verbs provided' }) };
    }
  } catch(e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const prompt = `Generate French verb conjugation quiz questions as a JSON array.

VERBS: ${verbs.trim()}

For each verb generate questions for: présent (6 subjects), passé composé (3 subjects), imparfait (3 subjects), futur simple (3 subjects), conditionnel (3 subjects), conditionnel passé (2 subjects), plus-que-parfait (2 subjects), subjonctif présent (3 subjects). Also stem questions: futur/cond stem, participe passé, auxiliaire if être.

Output ONLY a JSON array, nothing else, no markdown. Each item: {"verb":"...","tense":"...","k":"...","sub":"...","ans":"..."}
k must be one of: present, passe, imparfait, futur, cond, condp, plusque, subj, stem`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
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

    let apiResponse;
    try {
      apiResponse = JSON.parse(responseText);
    } catch(e) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Could not parse Anthropic response: ' + responseText.slice(0, 200) }) };
    }

    if (apiResponse.error) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Anthropic error: ' + apiResponse.error.message }) };
    }

    if (!apiResponse.content || !apiResponse.content.length) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Empty response from Claude', raw: JSON.stringify(apiResponse).slice(0, 300) }) };
    }

    const raw = apiResponse.content.filter(c => c.type === 'text').map(c => c.text).join('');

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No JSON array found. Claude said: ' + raw.slice(0, 300) }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch(e) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'JSON parse failed: ' + e.message + ' | Raw: ' + match[0].slice(0, 200) }) };
    }

    if (!Array.isArray(parsed) || parsed.length < 5) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Array too short: ' + parsed.length + ' items' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: parsed })
    };

  } catch(e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Function error: ' + e.message }) };
  }
};
