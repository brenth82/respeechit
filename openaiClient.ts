import axios from 'axios';
import dotenv from "dotenv";

dotenv.config();

// Voice options interface (moved outside the class)
interface VoiceOptions {
    speed?: number;      // 0.5 to 2.0
    pitch?: number;      // -10 to 10
    volume?: number;     // 0.5 to 2.0
}

// Custom error class to provide better error handling
export class OpenAIError extends Error {
    public statusCode: number;
    public errorCode: string;

    constructor(message: string, statusCode: number = 500, errorCode: string = 'API_ERROR') {
        super(message);
        this.name = 'OpenAIError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
    }
}

export class OpenAIClient {
    private apiKey: string;

constructor(apiKey: string) {
        this.apiKey = apiKey;
        if (!this.apiKey) {
            throw new Error("OpenAI API key is missing. Please set it in the .env file.");
        }
    }

    async generateSpeech(
        text: string,
        voice: string = "alloy",
        instructions: string = "Speak in a neutral tone.",
        voiceOptions: VoiceOptions = {},
        output: string = "mp3" // Default output format
    ): Promise<Buffer> {
        const maxRetries = 3; // Retry up to 3 times for transient errors
        let attempt = 0;
        const timeout = parseInt(process.env.OPENAI_API_TIMEOUT || "30000", 10); // Default to 30 seconds

        while (attempt < maxRetries) {
            try {
                // Incorporate voice options into instructions
                let formattedInstructions = instructions;
                if (voiceOptions.speed) {
                    formattedInstructions += ` Speak at ${voiceOptions.speed > 1 ? 'a faster' : 'a slower'} pace.`;
                }
                if (voiceOptions.pitch) {
                    formattedInstructions += ` Use ${voiceOptions.pitch > 0 ? 'a higher' : 'a lower'} pitch.`;
                }

                const payload = {
                    model: "gpt-4o-mini-tts",
                    input: text,
                    voice,
                    instructions: formattedInstructions
                };

                console.log('Sending request to OpenAI API for text-to-speech...');
                console.log('Request payload:', JSON.stringify(payload, null, 2)); // Log the payload for debugging

                const response = await axios.post(
                    'https://api.openai.com/v1/audio/speech',
                    payload,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        responseType: 'arraybuffer', // Expect binary data for audio
                        timeout // Use the configurable timeout
                    }
                );

                console.log('Received response from OpenAI API.');
                console.log(`Response status: ${response.status}`);
                return Buffer.from(response.data);
            } catch (error) {
                attempt++;
                
                // Handle different types of errors
                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    const statusCode = error.response.status;
                    console.error(`Error generating speech (attempt ${attempt}):`, 
                        `Status: ${statusCode}`);
                    
                    // Check for Gateway Timeout specifically
                    if (statusCode === 504) {
                        throw new OpenAIError(
                            "OpenAI server timed out. This usually happens when processing large text. Try with a smaller chunk of text.",
                            504,
                            'OPENAI_TIMEOUT'
                        );
                    }
                    
                    // Handle rate limiting
                    if (statusCode === 429) {
                        throw new OpenAIError(
                            "OpenAI API rate limit exceeded. Please try again after some time.",
                            429,
                            'RATE_LIMIT_EXCEEDED'
                        );
                    }
                    
                    // Check if it's a transient error (5xx)
                    const isTransientError = statusCode >= 500 && statusCode < 600;
                    
                    if (!isTransientError || attempt >= maxRetries) {
                        // Non-transient error or exceeded retries
                        let errorData = "Unknown error";
                        try {
                            // Try to parse error data if possible
                            if (error.response.data) {
                                const decoder = new TextDecoder();
                                errorData = decoder.decode(error.response.data);
                            }
                        } catch (e) {
                            console.error("Error parsing response data:", e);
                        }
                        
                        throw new OpenAIError(
                            `OpenAI API error: ${errorData}`,
                            statusCode,
                            'API_ERROR'
                        );
                    }
                    
                    console.log(`Retrying request (attempt ${attempt}) due to transient error: ${statusCode}`);
                } else if (error.request) {
                    // The request was made but no response was received
                    console.error(`No response received (attempt ${attempt}):`, error.message);
                    
                    if (error.code === 'ECONNABORTED') {
                        throw new OpenAIError(
                            "Request timed out. The OpenAI server took too long to respond.",
                            504,
                            'REQUEST_TIMEOUT'
                        );
                    }
                    
                    if (attempt >= maxRetries) {
                        throw new OpenAIError(
                            "Failed to receive response from OpenAI API after multiple attempts.",
                            500,
                            'NO_RESPONSE'
                        );
                    }
                } else {
                    // Something happened in setting up the request
                    console.error(`Error setting up request (attempt ${attempt}):`, error.message);
                    
                    if (attempt >= maxRetries) {
                        throw new OpenAIError(
                            `Request setup error: ${error.message}`,
                            500,
                            'REQUEST_SETUP_ERROR'
                        );
                    }
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        
        // This shouldn't be reached but TypeScript wants a return value
        throw new OpenAIError("Unexpected error in speech generation.", 500, 'UNEXPECTED_ERROR');
    }
}
