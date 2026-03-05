export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

    // Exponential backoff for API reliability
    const fetchWithRetry = async (retries = 5, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: prompt }],
                        parameters: { sampleCount: 1 }
                    })
                });
                if (response.ok) return await response.json();
                if (response.status === 429 || response.status >= 500) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    continue;
                }
                const errorData = await response.json();
                throw new Error(errorData.error?.message || "API Error");
            } catch (err) {
                if (i === retries - 1) throw err;
            }
        }
    };

    try {
        const data = await fetchWithRetry();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message || "The ritual failed to connect." });
    }
}
