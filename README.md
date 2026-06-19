# AI Music Recommendation App

This project is an AI Music Recommendation App built with Flask, designed to suggest music based on a user's mood. It integrates with both YouTube and Spotify APIs to provide a wide range of music options.

## Features

*   **Mood-Based Recommendations**: Get music suggestions tailored to your current mood (e.g., happy, sad, excited, tired, angry, stressed, neutral).
*   **YouTube Integration**: Search for YouTube videos and receive recommendations using the YouTube Data API.
*   **Spotify Integration**: Search for Spotify tracks and receive recommendations using the Spotify Web API.
*   **Mood History**: Tracks and displays a history of moods submitted by the user.
*   **API Key Management**: Securely handles API keys using environment variables (`.env` file support via `python-dotenv`).
*   **CORS Enabled**: Allows cross-origin requests for flexible frontend integration.

## Technologies Used

*   **Backend**: Python, Flask
*   **APIs**: YouTube Data API v3, Spotify Web API
*   **Frontend**: HTML, CSS, JavaScript (served via Flask templates and static files)
*   **Dependency Management**: `pip`, `requirements.txt`
*   **Environment Variables**: `python-dotenv`

## Setup and Installation

To get this project up and running on your local machine, follow these steps:

### 1. Clone the Repository

```bash
git clone https://github.com/subham-paul/AI_Music_Recommendation_App.git
cd AI_Music_Recommendation_App
```

### 2. Create a Virtual Environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure API Keys

This application requires API keys for YouTube and Spotify.

*   **YouTube Data API**:
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    *   Create a new project or select an existing one.
    *   Enable the "YouTube Data API v3".
    *   Go to "Credentials" and create an API key.
*   **Spotify Web API**:
    *   Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
    *   Log in and create a new application.
    *   Note down your `Client ID` and `Client Secret`.

Create a `.env` file in the root directory of your project and add your API keys:

```
YOUTUBE_API_KEY="YOUR_YOUTUBE_API_KEY"
SPOTIFY_CLIENT_ID="YOUR_SPOTIFY_CLIENT_ID"
SPOTIFY_CLIENT_SECRET="YOUR_SPOTIFY_CLIENT_SECRET"
```

### 5. Run the Application

```bash
python app.py
```

The application will typically run on `http://127.0.0.1:5000/`.

## Usage

Once the server is running, open your web browser and navigate to `http://127.0.0.1:5000/`. You can interact with the application by:

*   Selecting a mood to get music recommendations.
*   Using the search functionality to find specific tracks or videos on YouTube and Spotify.
*   Viewing your mood history.

## Endpoints

The Flask backend exposes the following endpoints:

*   `GET /`, `/dashboard`, `/about`, `/contact`: Serve static HTML pages.
*   `POST /api/mood`: Submit a user's mood.
*   `GET /api/mood/history`: Retrieve the history of submitted moods.
*   `POST /api/search_youtube`: Search YouTube for videos.
*   `POST /api/search_spotify`: Search Spotify for tracks.
*   `POST /api/recommend`: Get mood-based music recommendations.
*   `POST /api/check_youtube`: Check if a YouTube video is embeddable.
*   `GET /api/debug_youtube_auto`: Debug YouTube API configuration.
*   `GET /api/debug_spotify`: Debug Spotify API configuration.