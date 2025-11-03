# Music Posters - Setup Guide

This guide will walk you through setting up the Music Posters application from scratch.

## Prerequisites

- Node.js 18+ installed
- A Spotify account
- A Google Cloud account

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create an App"
3. Fill in the details:
   - App name: "Music Posters" (or your choice)
   - App description: "Convert festival posters to playlists"
   - Redirect URI: `http://localhost:3000/api/auth/callback`
4. Click "Create"
5. Click "Settings" to view your credentials
6. Copy your **Client ID** and **Client Secret**

## 3. Set Up Google Cloud Vision API

### 3.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable billing for your project (required for Vision API)

### 3.2 Enable Vision API

1. In your project, go to "APIs & Services" > "Library"
2. Search for "Cloud Vision API"
3. Click "Enable"

### 3.3 Create Service Account Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the details:
   - Service account name: "music-posters-vision"
   - Service account description: "Vision API access for Music Posters"
4. Click "Create and Continue"
5. Grant the role: "Cloud Vision" > "Cloud Vision API User"
6. Click "Continue" then "Done"

### 3.4 Download Credentials JSON

1. In the "Credentials" page, find your service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create New Key"
5. Choose "JSON" format
6. Click "Create" - a JSON file will download
7. Rename the file to `google-credentials.json`
8. Move it to the root of your project directory

## 4. Configure Environment Variables

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Open `.env` and fill in your credentials:

```env
# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Google Cloud Vision API
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_a_random_secret_here
```

3. For `NEXTAUTH_SECRET`, generate a random string:

```bash
# On macOS/Linux
openssl rand -base64 32

# Or use any random string generator
```

## 5. Verify Setup

Make sure you have:

- ✅ Created a Spotify Developer App
- ✅ Set the redirect URI to `http://localhost:3000/api/auth/callback`
- ✅ Enabled Google Cloud Vision API
- ✅ Downloaded `google-credentials.json` to the project root
- ✅ Filled in all environment variables in `.env`

## 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 7. Test the Application

1. Click "Connect with Spotify"
2. Log in to your Spotify account
3. Upload a festival poster image (you can search for "Coachella poster" or "Lollapalooza poster" online)
4. Click "Analyze Poster"
5. Review the detected artists
6. Click "Create Spotify Playlist"
7. Check your Spotify account for the new playlist!

## Troubleshooting

### "Not authenticated" error

- Make sure you've logged in with Spotify
- Check that your Spotify credentials are correct in `.env`
- Verify the redirect URI matches exactly in both Spotify Dashboard and `.env`

### "Failed to analyze image" error

- Check that `google-credentials.json` exists in the project root
- Verify the Vision API is enabled in Google Cloud Console
- Make sure billing is enabled on your Google Cloud project
- Check the file path in `GOOGLE_APPLICATION_CREDENTIALS`

### "Could not find any tracks" error

- The OCR might not have detected any artist names
- Try a different poster with clearer text
- Check the console logs to see what text was extracted

### OAuth redirect issues

- Make sure the redirect URI in Spotify Dashboard **exactly** matches the one in `.env`
- It should be: `http://localhost:3000/api/auth/callback` (no trailing slash)
- The redirect URI is case-sensitive

## Production Deployment

### Vercel (Recommended)

1. Push your code to GitHub (make sure `.env` and `google-credentials.json` are in `.gitignore`)

2. Go to [Vercel](https://vercel.com) and import your repository

3. Add environment variables in Vercel:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (update to your production URL: `https://your-domain.vercel.app/api/auth/callback`)
   - `NEXTAUTH_URL` (your production URL)
   - `NEXTAUTH_SECRET`

4. For Google Cloud credentials:
   - Option 1: Copy the entire contents of `google-credentials.json` and add as `GOOGLE_APPLICATION_CREDENTIALS` env var
   - Option 2: Use Vercel's file upload feature for sensitive files

5. Update Spotify redirect URI:
   - Go to your Spotify Developer Dashboard
   - Add the production redirect URI: `https://your-domain.vercel.app/api/auth/callback`

6. Deploy!

## API Rate Limits

- **Spotify API**: 180 requests per minute (authenticated)
- **Google Vision API**: Free tier includes 1,000 requests per month

For posters with many artists (50+), the Spotify API calls might take 20-30 seconds due to rate limiting.

## Cost Considerations

- **Spotify API**: Free
- **Google Vision API**:
  - First 1,000 requests/month: Free
  - After that: $1.50 per 1,000 requests
  - [Pricing details](https://cloud.google.com/vision/pricing)

## Next Steps

- Test with various festival posters
- Share with friends
- Consider adding features from the V2 backlog

## Support

If you encounter issues:

1. Check the browser console for errors
2. Check the terminal/server logs
3. Verify all environment variables are set correctly
4. Make sure your Google Cloud project has billing enabled
