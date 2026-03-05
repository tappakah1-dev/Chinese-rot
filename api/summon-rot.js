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

    // BONUS BRAINROT TIP: 
    // If you want it to truly "work forever" for free, you can generate 3 different 
    // free API keys from different Google accounts and format your env var like this:
    // GEMINI_API_KEY="key1,key2,key3"
    const apiKeyEnv = process.env.GEMINI_API_KEY;

    if (!apiKeyEnv) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel Environment Variables" });
    }

    // This logic picks a random API key if you provide multiple separated by commas
    const apiKeys = apiKeyEnv.split(',');
    const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)].trim();

    try {
        // FIXED: Switched from the preview 4.0 model (70 limit) to the production 3.0 model (massive limit)
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

        // Bubble up exact Google API errors
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

    } catch (error) {
        return res.status(500).json({
            error: "Internal Server Error during fetch",
            message: error.message
        });
    }
}
