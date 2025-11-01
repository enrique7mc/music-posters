# Quick Start - 5 Minute Setup

Get Music Posters running in 5 minutes (assuming you have credentials).

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Spotify Developer account
- [ ] Google Cloud account with billing enabled

---

## Step 1: Install (30 seconds)

```bash
npm install
```

---

## Step 2: Get Spotify Credentials (2 minutes)

1. Go to: https://developer.spotify.com/dashboard
2. Click "Create App"
3. Name: "Music Posters"
4. Redirect URI: `http://localhost:3000/api/auth/callback`
5. Copy **Client ID** and **Client Secret**

---

## Step 3: Get Google Cloud Credentials (2 minutes)

1. Go to: https://console.cloud.google.com
2. Create new project (or select existing)
3. Enable "Cloud Vision API"
4. Create Service Account:
   - Name: "music-posters"
   - Role: "Cloud Vision API User"
5. Create JSON key → Download
6. Rename to `google-credentials.json`
7. Move to project root

---

## Step 4: Configure Environment (30 seconds)

```bash
cp .env.example .env
```

Edit `.env`:

```env
SPOTIFY_CLIENT_ID=paste_your_client_id
SPOTIFY_CLIENT_SECRET=paste_your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=any_random_string_here
```

Generate random secret:
```bash
openssl rand -base64 32
```

---

## Step 5: Run (10 seconds)

```bash
npm run dev
```

Open: http://localhost:3000

---

## First Test (1 minute)

1. Click "Connect with Spotify"
2. Log in and approve
3. Click "Choose Image"
4. Upload any festival poster (search Google Images for "Coachella poster")
5. Click "Analyze Poster"
6. Click "Create Spotify Playlist"
7. Check your Spotify account!

---

## Troubleshooting

### "Not authenticated"
- Spotify redirect URI must match **exactly**
- Check `.env` file has correct credentials

### "Failed to analyze image"
- Verify `google-credentials.json` exists in project root
- Check Google Cloud billing is enabled
- Verify Vision API is enabled

### "No artists found"
- Try a different poster with clearer text
- Check browser console for errors

---

## File Checklist

Before running, verify these files exist:

- [ ] `.env` (created from `.env.example`)
- [ ] `google-credentials.json` (downloaded from Google Cloud)
- [ ] `node_modules/` (after `npm install`)

---

## Next Steps

- Read [SETUP.md](SETUP.md) for detailed instructions
- Read [TESTING.md](TESTING.md) for full test checklist
- Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for implementation details

---

## Production Deployment

When ready to deploy:

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Update Spotify redirect URI to production URL
5. Deploy!

See [SETUP.md](SETUP.md) for details.

---

**Enjoy!** 🎉
