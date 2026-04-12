const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set' }) };
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

  // Split verbs and process in small batches to stay fast
  const verbList = verbs.split(',').map(v => v.trim()).filter(Boolean);
  const allQuestions = [];

  for (const verb of verbList) {
    const prompt = `Generate French conjugation quiz questions for the verb "${verb}" only.

Return ONLY a raw JSON array with no markdown, no backticks, no extra text.
Each object: {"verb":"${verb}","tense":"TENSE","k":"KEY","sub":"SUBJECT","ans":"ANSWER"}

Include these questions:
- présent: je,tu,il/elle,nous,vous,ils/elles (k="present")
- passé composé: j'/je,nous,ils/elles (k="passe")
- imparfait: je,nous,ils/elles (k="imparfait")
- futur simple: je,nous,ils/elles (k="futur")
- conditionnel: je,nous,ils/elles (k="cond")
- conditionnel passé: j'/je,nous (k="condp")
- plus-que-parfait: j'/je,nous (k="plusque")
- subjonctif présent: que je,que nous,qu'ils/elles (k="subj")
- stem: futur/cond stem as "saur-" format (k="stem",sub="futur/cond stem")
- stem: participe passé (k="stem",sub="participe passé")
- stem: auxiliaire only if être-verb (k="stem",sub="auxiliaire")

Use correct French accents. No hints in answers.`;

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
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
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(requestBody);
        req.end();
      });

      const apiResponse = JSON.parse(responseText);
      if (apiResponse.error) continue;

      const raw = apiResponse.content.filter(c => c.type === 'text').map(c => c.text).join('');
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) allQuestions.push(...parsed);

    } catch(e) {
      continue;
    }
  }

  if (allQuestions.length < 5) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Could not generate questions. Try fewer verbs.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions: allQuestions })
  };
};
