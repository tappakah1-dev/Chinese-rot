export default async function handler(req, res) {
    // Add CORS headers to prevent cross-origin 500 blocks
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Pre-flight request check
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt payload" });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Fix 1: Properly catch missing API key and inform frontend
    if (!apiKey) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel Environment Variables" });
    }

    try {
        // Fix 2: Changed to the stable model: imagen-3.0-generate-001
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    instances: [
                        { prompt: prompt }
                    ],
                    parameters: {
                        sampleCount: 1
                    }
                })
            }
        );

        const data = await response.json();

        // Fix 3: Bubble up exact Google API errors (like bad keys or safety triggers)
        if (!response.ok) {
            return res.status(500).json({
                error: "Google API rejected the request",
                raw: data
            });
        }

        const imageBase64 = data?.predictions?.[0]?.bytesBase64Encoded;

        if (!imageBase64) {
            return res.status(500).json({
                error: "No image returned from Google",
                raw: data
            });
        }

        return res.status(200).json({
            image: `data:image/png;base64,${imageBase64}`
        });

    } catch (error) {
        return res.status(500).json({
            error: "Internal Server Error during fetch",
            message: error.message
        });
    }
}
