import sharp from 'sharp';

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

    const apiKeyEnv = process.env.GEMINI_API_KEY;

    if (!apiKeyEnv) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel Environment Variables" });
    }

    // Split multiple keys by comma and randomize their order to load-balance
    const apiKeys = apiKeyEnv.split(',').map(k => k.trim()).filter(k => k);
    const shuffledKeys = apiKeys.sort(() => 0.5 - Math.random());

    // A list of Google Imagen endpoints to try in order of preference
    const endpointsToTry = [
        // 1. Production v1 Imagen 3 (Highest Quota)
        "https://generativelanguage.googleapis.com/v1/models/imagen-3.0-generate-001:predict",
        // 2. Fallback to v1beta 002 if 001 is missing
        "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict",
        // 3. Fallback to preview 4.0 (70 Quota limit)
        "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict"
    ];

    let finalResponse = null;
    let finalData = null;
    let success = false;

    // --- ROBUST WATERFALL LOOP ---
    // Loop through our API keys (if you provided multiple for infinite limits)
    for (const key of shuffledKeys) {
        if (success) break;
        
        // Loop through the different model endpoints
        for (const endpoint of endpointsToTry) {
            try {
                finalResponse = await fetch(`${endpoint}?key=${key}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        instances: [{ prompt: prompt }],
                        parameters: { sampleCount: 1 }
                    })
                });

                finalData = await finalResponse.json();

                if (finalResponse.ok) {
                    success = true;
                    break; // Stop trying endpoints, we got an image!
                }

                // If Quota Exceeded (429), stop trying endpoints for THIS key, and move to the NEXT API key
                if (finalResponse.status === 429) {
                    break; 
                }

                // If Model Not Found (404), try the NEXT endpoint in the array
                if (finalResponse.status === 404) {
                    continue;
                }

                // For explicit safety/NSFW blocks (400), don't retry models, just break and fail gracefully
                if (finalResponse.status === 400) {
                    break;
                }

            } catch (e) {
                // Network error, try next
                continue;
            }
        }
    }

    if (!success) {
        return res.status(500).json({
            error: "Google API rejected the request on all available models/keys.",
            raw: finalData
        });
    }

    const imageBase64 = finalData?.predictions?.[0]?.bytesBase64Encoded;

    if (!imageBase64) {
        return res.status(500).json({
            error: "No image returned from Google",
            raw: finalData
        });
    }

    try {
        // Convert the raw base64 PNG string into a Buffer
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        // Compress and convert the image to WebP format
        const compressedBuffer = await sharp(imageBuffer)
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        const compressedBase64 = compressedBuffer.toString('base64');

        // Send the smaller WebP back to the frontend
        return res.status(200).json({
            image: `data:image/webp;base64,${compressedBase64}`
        });
        
    } catch (compressionError) {
        return res.status(500).json({
            error: "Failed to compress image to WebP",
            message: compressionError.message
        });
    }
}
