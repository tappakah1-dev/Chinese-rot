export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    try {

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
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

        const imageBase64 =
            data?.predictions?.[0]?.bytesBase64Encoded;

        if (!imageBase64) {
            return res.status(500).json({
                error: "No image returned",
                raw: data
            });
        }

        return res.status(200).json({
            image: `data:image/png;base64,${imageBase64}`
        });

    } catch (error) {

        return res.status(500).json({
            error: error.message
        });

    }
}
