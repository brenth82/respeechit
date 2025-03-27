import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import session from 'express-session';
import { SpeechGenerator } from './speechGenerator';
import * as fs from 'fs';
import * as path from 'path';
import dotenvSafe from 'dotenv-safe';
import dotenv from 'dotenv';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import crypto from 'crypto';

// Only validate .env.example in non-production environments
if (process.env.NODE_ENV !== 'production') {
    // Allow empty values for development
    dotenvSafe.config({
        allowEmptyValues: true
    });
} else {
    // Load .env without validation in production
    dotenv.config();
}

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
}
if (process.env.ENABLE_AUTH === 'true' && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be defined when authentication is enabled.");
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded form data

// Enhanced static file serving with better path resolution for multiple environments
let publicPath: string;
if (process.env.NODE_ENV === 'production') {
    // In production, check if we're running on Vercel
    if (process.env.VERCEL_ENV) {
        // On Vercel, static files are at the root level
        publicPath = path.join(__dirname, '../public');
    } else {
        // Other production environments
        publicPath = path.join(__dirname, 'public');
    }
} else {
    // Development environment
    publicPath = path.join(__dirname, '..', 'public');
}

console.log('Environment:', process.env.NODE_ENV);
console.log('Current directory:', __dirname);
console.log('Serving static files from:', publicPath);
console.log('Public directory exists:', fs.existsSync(publicPath));

// First try to serve from publicPath
app.use(express.static(publicPath));

// Fallback to serve from the dist/public directory if it exists
const distPublicPath = path.join(__dirname, 'public');
if (distPublicPath !== publicPath && fs.existsSync(distPublicPath)) {
    console.log('Also serving static files from fallback path:', distPublicPath);
    app.use(express.static(distPublicPath));
}

// Serve generated files (adding this before other routes)
const writableDir = process.env.WRITABLE_DIR || '/tmp'; // Default to '/tmp' for Vercel
const generatedDir = path.join(writableDir, 'generated');
// Ensure the generated directory exists
if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
}
app.use('/generated', express.static(generatedDir));

async function initializeSessionStore() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
        // Use Redis if REDIS_URL is provided
        const redisClient = createClient({ url: redisUrl });
        redisClient.on('error', (err) => console.error('Redis Client Error:', err));
        try {
            await redisClient.connect();
            console.log('Connected to Redis');
        } catch (err) {
            console.error('Failed to connect to Redis:', err.message);
            throw err;
        }
        return new RedisStore({ client: redisClient });
    } else {
        // Fallback to MemoryStore
        console.warn('REDIS_URL not provided. Falling back to MemoryStore. This is not recommended for production.');
        return new session.MemoryStore();
    }
}

// Configure file upload with multer
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_FILE_TYPES = [
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'application/rtf',
];

// Configure multer storage and file filter
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const writableDir = process.env.WRITABLE_DIR || '/tmp';
        const uploadDir = path.join(writableDir, 'uploads');
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Check file type
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only text documents are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: fileFilter
});

// Error handler for multer errors with explicit types
const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File is too large. Maximum size is 10MB.',
                code: 'FILE_TOO_LARGE' 
            });
        }
    }
    if (err) {
        return res.status(400).json({ 
            error: err.message,
            code: 'INVALID_FILE' 
        });
    }
    next();
};

(async () => {
    const sessionStore = await initializeSessionStore();
    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'default_secret', // Use a secure secret in production
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            sameSite: 'lax' // For better CSRF protection
        },
    }));

    // Add security headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
        next();
    });

    // Increase timeout for requests to handle long-running processes
    app.use((req, res, next) => {
        req.setTimeout(5 * 60 * 1000); // 5 minutes
        res.setTimeout(5 * 60 * 1000); // 5 minutes
        next();
    });

    // Middleware to add X-Robots-Tag header to all responses
    app.use((req, res, next) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        next();
    });

    // Middleware to block bots based on user agent
    app.use((req, res, next) => {
        const botUserAgents = [
            /googlebot/i,
            /bingbot/i,
            /slurp/i,
            /duckduckbot/i,
            /baiduspider/i,
            /yandexbot/i,
            /sogou/i,
            /exabot/i,
            /facebot/i,
            /ia_archiver/i
        ];
        const userAgent = req.headers['user-agent'] || '';
        if (botUserAgents.some(bot => bot.test(userAgent))) {
            console.warn(`Blocked bot: ${userAgent}`);
            return res.status(403).send('Access forbidden');
        }
        next();
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY environment variable is not set.");
    }

    const enableAuth = process.env.ENABLE_AUTH === 'true'; // Toggle authentication via environment variable
    const username = process.env.APP_USERNAME || "admin"; // Default username
    const password = process.env.APP_PASSWORD || "password"; // Default password

    // Middleware to check authentication
    function checkAuth(req: Request, res: Response, next: NextFunction) {
        if (!enableAuth || req.session.isAuthenticated) {
            return next();
        }
        res.redirect('/login');
    }

    // Serve the login page with WCAG-compliant form
    app.get('/login', (req, res) => {
        if (!enableAuth) {
            return res.redirect('/');
        }
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="robots" content="noindex, nofollow">
                <title>Login - Text-to-Speech App</title>
                <style>
                    :root {
                        --primary-color: #4a6fa5;
                        --primary-dark: #345581;
                        --text-color: #333;
                        --background-color: #f8f9fa;
                        --error-color: #d9534f;
                        --success-color: #5cb85c;
                        --focus-outline: 3px solid #719ECE;
                    }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                        line-height: 1.6;
                        color: var(--text-color);
                        background-color: var(--background-color);
                        padding: 1rem;
                        max-width: 600px;
                        margin: 0 auto;
                        margin-top: 10vh;
                    }
                    .login-container {
                        background-color: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                        padding: 2rem;
                    }
                    h1 {
                        color: var(--primary-color);
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }
                    .form-group {
                        margin-bottom: 1.5rem;
                    }
                    label {
                        display: block;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                    }
                    input[type="text"],
                    input[type="password"] {
                        width: 100%;
                        padding: 0.75rem;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        font-size: 1rem;
                    }
                    input:focus {
                        outline: var(--focus-outline);
                        border-color: var(--primary-color);
                    }
                    button {
                        background-color: var(--primary-color);
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 0.75rem 1.5rem;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background-color 0.2s ease;
                        width: 100%;
                    }
                    button:hover {
                        background-color: var(--primary-dark);
                    }
                    button:focus {
                        outline: var(--focus-outline);
                    }
                    .error-message {
                        color: var(--error-color);
                        background-color: #fde8e8;
                        padding: 0.75rem;
                        border-radius: 4px;
                        margin-bottom: 1.5rem;
                        display: none;
                    }
                    .skip-link {
                        position: absolute;
                        top: -40px;
                        left: 0;
                        background: var(--primary-color);
                        color: white;
                        padding: 8px;
                        z-index: 100;
                        transition: top 0.3s;
                    }
                    .skip-link:focus {
                        top: 0;
                    }
                </style>
            </head>
            <body>
                <a href="#login-form" class="skip-link">Skip to login form</a>
                <div class="login-container">
                    <h1>Login</h1>
                    <div id="error-message" class="error-message" role="alert"></div>
                    <form id="login-form" method="POST" action="/login">
                        <div class="form-group">
                            <label for="username">Username:</label>
                            <input type="text" id="username" name="username" required autocomplete="username" aria-required="true">
                        </div>
                        <div class="form-group">
                            <label for="password">Password:</label>
                            <input type="password" id="password" name="password" required autocomplete="current-password" aria-required="true">
                        </div>
                        <button type="submit">Login</button>
                    </form>
                </div>
                <script>
                    // Check for error parameter in URL
                    const urlParams = new URLSearchParams(window.location.search);
                    const error = urlParams.get('error');
                    if (error) {
                        const errorMessage = document.getElementById('error-message');
                        errorMessage.textContent = 'Invalid username or password. Please try again.';
                        errorMessage.style.display = 'block';
                    }
                    // Focus on username field when page loads
                    document.getElementById('username').focus();
                </script>
            </body>
            </html>
        `);
    });

    // Handle login form submission
    app.post('/login', (req, res) => {
        if (!enableAuth) {
            return res.redirect('/');
        }
        const { username: providedUsername, password: providedPassword } = req.body;
        if (providedUsername === username && providedPassword === password) {
            req.session.isAuthenticated = true;
            return res.redirect('/');
        }
        res.redirect('/login?error=true');
    });

    // Handle logout
    app.get('/logout', (req, res) => {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    });

    // Use authentication middleware for protected routes
    app.use(checkAuth);

    // Use a writable directory for uploads and generated files
    const writableDir = process.env.WRITABLE_DIR || '/tmp'; // Default to '/tmp' for Vercel
    const uploadDir = path.join(writableDir, 'uploads');
    const generatedDir = path.join(writableDir, 'generated');

    // Ensure the uploads and generated directories exist
    [uploadDir, generatedDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Serve the main upload page
    app.get('/', (req, res) => {
        // Try multiple possible locations for index.html
        const possiblePaths = [
            path.join(publicPath, 'index.html'),
            path.join(distPublicPath, 'index.html'),
            path.join(__dirname, 'public', 'index.html')
        ];
        
        console.log('Looking for index.html in:');
        for (const indexPath of possiblePaths) {
            console.log(`- ${indexPath} (exists: ${fs.existsSync(indexPath)})`);
            if (fs.existsSync(indexPath)) {
                console.log(`Serving index.html from: ${indexPath}`);
                return res.sendFile(indexPath);
            }
        }
        
        // If we get here, the index file wasn't found in any location
        console.error('Index file not found in any expected location');
        res.status(500).send(`Error loading application. Index file not found. 
                              Searched paths: ${possiblePaths.join(', ')}`);
    });

    // Serve generated files
    app.use('/generated', express.static(generatedDir));

    // Serve robots.txt file
    app.use('/robots.txt', express.static(path.join(__dirname, 'public', 'robots.txt')));

    // Predefined list of voices including Shimmer and Nova
    const predefinedVoices = [
        { id: 'shimmer', name: 'Shimmer (Female, Enthusiastic)' },
        { id: 'nova', name: 'Nova (Female, Gentle)' },
        { id: 'alloy', name: 'Alloy (Non-binary, Neutral)' },
        { id: 'coral', name: 'Coral (Female, Warm)' },
        { id: 'echo', name: 'Echo (Male, Baritone)' },
        { id: 'fable', name: 'Fable (Male, British)' },
        { id: 'onyx', name: 'Onyx (Male, Deep)' },
        { id: 'sage', name: 'Sage (Male, Calm)' },
        { id: 'ash', name: 'Ash (Male, Formal)' },
        { id: 'ballad', name: 'Ballad (Male, Soothing)' }
    ];

    // Endpoint to fetch the list of voices
    app.get('/voices', (req, res) => {
        res.json({ voices: predefinedVoices });
    });

    // Endpoint to process the uploaded file - use error handling middleware
    app.post('/process', upload.single('file'), handleMulterError, async (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'Uploaded file is required',
                code: 'FILE_REQUIRED' 
            });
        }
        const voice = req.body.voice || "alloy"; // Default to "alloy" if no voice is selected
        const instructions = req.body.instructions || "Speak in a neutral tone."; // Default instructions
        try {
            // Read file asynchronously
            let document: string;
            try {
                document = await fs.promises.readFile(req.file.path, 'utf-8');
            } catch (readError) {
                console.error('Error reading file:', readError);
                return res.status(400).json({ 
                    error: 'Could not read the uploaded file. Make sure it contains valid text.',
                    code: 'FILE_READ_ERROR'
                });
            }
            // Check if document is empty
            if (!document.trim()) {
                return res.status(400).json({ 
                    error: 'The uploaded file is empty or contains no text.',
                    code: 'EMPTY_FILE'
                });
            }
            const speechGenerator = new SpeechGenerator(apiKey);
            console.log(`Generating speech with voice: "${voice}" and instructions: "${instructions}"`);
            const generatedFiles = await speechGenerator.generateSpeechFromDocument(document, generatedDir, voice, instructions);
            // Remove uploaded file asynchronously
            await fs.promises.unlink(req.file.path);
            console.log('Speech generation complete. Files saved to:', generatedDir);
            if (generatedFiles.length === 0) {
                return res.status(500).json({ 
                    error: 'Failed to generate any audio files.',
                    code: 'NO_FILES_GENERATED'
                });
            }
            res.status(200).json({ 
                message: 'Speech generation complete', 
                files: generatedFiles.map(file => `/generated/${path.basename(file)}`),
                totalChunks: generatedFiles.length,
                voice: voice
            });
        } catch (error: any) {
            // Detailed error logging
            console.error('Error generating speech:', error);
            // Check if it's an OpenAI Error with statusCode
            if (error.name === 'OpenAIError') {
                return res.status(error.statusCode).json({
                    error: error.message,
                    code: error.errorCode,
                });
            }
            // Handle timeout errors specifically
            if (error.message && (error.message.includes('timeout') || 
                                 error.message.includes('timed out') || 
                                 error.code === 'ECONNABORTED' ||
                                 error.code === 'ETIMEDOUT')) {
                return res.status(504).json({
                    error: 'The request to generate speech timed out. Try with a smaller text file.',
                    code: 'TIMEOUT_ERROR'
                });
            }
            // Handle other OpenAI API errors
            if (error.message && error.message.includes('OpenAI API')) {
                return res.status(502).json({
                    error: 'Error communicating with the OpenAI service. Please try again later.',
                    code: 'API_ERROR',
                    detail: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
            // Generic error handler for other errors
            res.status(500).json({ 
                error: 'Failed to generate speech. Please try again later.',
                code: 'GENERAL_ERROR',
                detail: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    // Endpoint to process direct text input
    app.post('/process-text', async (req: Request, res: Response) => {
        const { text, voice, instructions } = req.body;
        console.log('Received /process-text request:', { 
            textPresent: !!text, 
            textLength: text ? text.length : 0,
            textType: typeof text,
            voice, 
            instructions 
        }); // Enhanced logging

        // More robust text validation
        if (!text || typeof text !== 'string') {
            console.warn('Text input is missing or invalid type:', typeof text);
            return res.status(400).json({ 
                error: 'Text input is required',
                code: 'TEXT_REQUIRED' 
            });
        }
        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
            console.warn('Text input is empty (just whitespace)');
            return res.status(400).json({ 
                error: 'Text input cannot be empty',
                code: 'TEXT_EMPTY' 
            });
        }
        if (trimmedText.length > 5000) {
            console.warn(`Text input is too long: ${trimmedText.length} characters`);
            return res.status(400).json({ 
                error: 'Text is too long. Maximum length is 5000 characters.',
                code: 'TEXT_TOO_LONG' 
            });
        }
        const selectedVoice = voice || "alloy";
        const voiceInstructions = instructions || "Speak in a neutral tone.";
        try {
            const speechGenerator = new SpeechGenerator(apiKey);
            console.log(`Generating speech for direct text with voice: "${selectedVoice}" and instructions: "${voiceInstructions}"`);
            // Create a temporary directory for this request if it doesn't exist
            const sessionId = req.session.id || Date.now().toString();
            const outputDir = path.join(generatedDir, sessionId);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            const generatedFiles = await speechGenerator.generateSpeechFromDocument(trimmedText, outputDir, selectedVoice, voiceInstructions);
            console.log('Speech generation complete. Files saved to:', outputDir);
            if (generatedFiles.length === 0) {
                console.warn('Failed to generate any audio files.'); // Log if no files were generated
                return res.status(500).json({ 
                    error: 'Failed to generate any audio files.',
                    code: 'NO_FILES_GENERATED'
                });
            }
            res.status(200).json({ 
                message: 'Speech generation complete', 
                files: generatedFiles.map(file => `/generated/${path.basename(path.dirname(file))}/${path.basename(file)}`),
                totalChunks: generatedFiles.length,
                voice: selectedVoice
            });
        } catch (error) {
            // Reuse the same error handling logic as in the /process endpoint
            console.error('Error generating speech:', error);
            if (error.name === 'OpenAIError') {
                return res.status(error.statusCode).json({
                    error: error.message,
                    code: error.errorCode,
                });
            }
            if (error.message && (error.message.includes('timeout') || 
                                 error.message.includes('timed out') || 
                                 error.code === 'ECONNABORTED' ||
                                 error.code === 'ETIMEDOUT')) {
                return res.status(504).json({
                    error: 'The request to generate speech timed out. Try with a smaller text.',
                    code: 'TIMEOUT_ERROR'
                });
            }
            if (error.message && error.message.includes('OpenAI API')) {
                return res.status(502).json({
                    error: 'Error communicating with the OpenAI service. Please try again later.',
                    code: 'API_ERROR',
                    detail: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
            res.status(500).json({ 
                error: 'Failed to generate speech. Please try again later.',
                code: 'GENERAL_ERROR',
                detail: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    // Updated asynchronous cleanup function using fs.promises
    async function deleteOldFiles(directory: string, maxAge: number) {
        try {
            const now = Date.now();
            const files = await fs.promises.readdir(directory);
            await Promise.all(files.map(async file => {
                const filePath = path.join(directory, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (now - stats.mtimeMs > maxAge) {
                        await fs.promises.unlink(filePath);
                        console.log(`Deleted old file: ${filePath}`);
                    }
                } catch (err) {
                    console.error(`Error processing file ${filePath}:`, err);
                }
            }));
        } catch (err) {
            console.error(`Error reading directory ${directory}:`, err);
        }
    }

    // Endpoint to trigger cleanup of old files
    app.post('/cleanup', (req: Request, res: Response) => {
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        deleteOldFiles(generatedDir, maxAge);
        res.status(200).json({ message: 'Cleanup triggered' });
    });

    app.get('/status', (req: Request, res: Response) => {
        res.status(200).json({ status: 'ok', uptime: process.uptime() });
    });

    // Global error handler with explicit types
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Unhandled error:', err);
        res.status(500).json({ 
            error: 'An unexpected error occurred. Please try again later.',
            code: 'SERVER_ERROR'
        });
    });

    // Catch-all 404 handler with improved debugging and multiple path checking
    app.use((req: Request, res: Response) => {
        // Try multiple possible locations for 404.html
        const possiblePaths = [
            path.join(publicPath, '404.html'),
            path.join(distPublicPath, '404.html'),
            path.join(__dirname, 'public', '404.html')
        ];
        
        console.log(`404 for path: ${req.url}`);
        console.log('Looking for 404.html in:');
        for (const custom404Path of possiblePaths) {
            console.log(`- ${custom404Path} (exists: ${fs.existsSync(custom404Path)})`);
            if (fs.existsSync(custom404Path)) {
                console.log(`Serving 404.html from: ${custom404Path}`);
                return res.status(404).sendFile(custom404Path);
            }
        }
        
        // If we get here, the 404 file wasn't found in any location
        console.error('404 page not found in any expected location');
        res.status(404).send('Not Found - The requested resource does not exist');
    });
})();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});

// Export app for Vercel or start the server locally
if (process.env.VERCEL_ENV) {
    module.exports = app;
} else {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}