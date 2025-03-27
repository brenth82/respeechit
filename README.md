# Text-to-Speech Application (TTSER)

This is an accessible text-to-speech application that uses the OpenAI API to generate natural-sounding speech from text documents. It supports multiple voices and allows users to upload files or directly input text for processing.

## Features

- Convert text to speech through file upload or direct text input
- Supports multiple predefined voices with various characteristics
- Authentication (optional, configurable via environment variables)
- Automatic cleanup of old generated files
- Dark mode support with system preference detection
- History tracking of generated content
- Built-in audio player for instant preview
- Deployable to Vercel
- Fully WCAG 2.1 AA compliant
- Responsive design for mobile and desktop
- Progress indicators for better user feedback
- Error handling with user-friendly messages
- Support for keyboard navigation

## Prerequisites

- Node.js (version 16 or higher)
- A valid OpenAI API key

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd ttser
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:

   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration:
   - `OPENAI_API_KEY`: Your OpenAI API key (required)
   - `SESSION_SECRET`: A secret key for session management (required if authentication is enabled)
   - `ENABLE_AUTH`: Set to `true` to enable authentication, `false` to disable it
   - `APP_USERNAME` and `APP_PASSWORD`: Credentials for authentication (required if `ENABLE_AUTH` is `true`)
   - `WRITABLE_DIR`: Directory for storing uploads and generated files (default: `/tmp`)
   - `OPENAI_API_TIMEOUT`: Timeout for OpenAI API requests in milliseconds (default: `30000`)
   - `PORT`: Port for local development (default: `3000`)
   - `REDIS_URL` (optional): URL for Redis session storage

## Running Locally

1. Build the project:

   ```bash
   npm run build
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open your browser and navigate to `http://localhost:3000`.

## Using the Application

### File Upload

1. Select the "Upload File" tab (default)
2. Click "Browse" or "Choose File" to select a text document
3. Select your preferred voice
4. Add optional instructions for the speech style
5. Click "Generate Speech"
6. Once processing completes, you can listen to or download the generated audio files

### Direct Text Input

1. Select the "Enter Text" tab
2. Type or paste your text into the text area
3. Select your preferred voice and add optional instructions
4. Click "Generate Speech"
5. Preview or download the generated audio

### History

- The application keeps track of your 10 most recent generations
- You can find these in the "History" tab
- Each entry includes playback controls for quick access to previously generated audio

### Dark Mode

- Click the moon/sun icon in the bottom-right corner to toggle between light and dark modes
- Your preference will be remembered for future visits

## Accessibility Features

This application adheres to WCAG 2.1 AA compliance standards:

- Properly labeled form controls with descriptive text
- Keyboard navigation support
- Sufficient color contrast
- Screen reader compatibility
- Focus indicators for interactive elements
- Responsive design
- Error messages are announced to screen readers
- Skip to content link
- Semantic HTML structure
- ARIA attributes where appropriate
- Support for text resizing
- Reduced motion option
- Accessible progress indicators that don't spam screen readers

## Deploying to Vercel

1. Install the Vercel CLI:

   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:

   ```bash
   vercel login
   ```

3. Deploy the project:

   ```bash
   vercel
   ```

4. Set the required environment variables in Vercel:
   - `OPENAI_API_KEY` (required)
   - `SESSION_SECRET` (required if `ENABLE_AUTH` is `true`)
   - `ENABLE_AUTH` (optional, default: `false`)
   - `APP_USERNAME` and `APP_PASSWORD` (optional, required if `ENABLE_AUTH` is `true`)
   - `WRITABLE_DIR` (optional, default: `/tmp`)
   - `OPENAI_API_TIMEOUT` (optional, default: `30000`)

   You can set these variables using the Vercel dashboard or the CLI:

   ```bash
   vercel env add <variable-name>
   ```

   For the Redis configuration (optional):
   - Use a managed Redis service like Upstash if you need persistent sessions
   - Add the `REDIS_URL` environment variable with your Redis connection string
   - If no Redis URL is provided, the app will use in-memory session storage (suitable for small-scale deployments)

5. Once deployed, your application will be accessible at the URL provided by Vercel.

## File Limitations

- Maximum file size: 10MB
- Supported file types: .txt, .doc, .docx, .pdf, .rtf
- Maximum text length for direct input: 5000 characters
- Large files will be automatically split into smaller chunks for processing

## Cleaning Up Old Files

The application automatically manages generated files and includes an endpoint to clean up files older than 24 hours. You can trigger cleanup manually by sending a POST request to `/cleanup`.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
