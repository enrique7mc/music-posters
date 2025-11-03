# Testing Checklist

Use this checklist to verify the MVP is working correctly.

## Prerequisites

Before testing, ensure:

- [ ] All dependencies are installed (`npm install`)
- [ ] `.env` file is configured with valid credentials
- [ ] `google-credentials.json` is in the project root
- [ ] Spotify redirect URI matches exactly in both dashboard and `.env`
- [ ] Development server is running (`npm run dev`)

## 1. Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-10-31T...",
  "service": "music-posters",
  "version": "1.0.0"
}
```

## 2. Authentication Flow

### Test Case: Successful Login

1. [ ] Navigate to `http://localhost:3000`
2. [ ] Verify you see the home page with "Connect with Spotify" button
3. [ ] Click "Connect with Spotify"
4. [ ] Verify redirect to Spotify OAuth page
5. [ ] Log in with your Spotify credentials
6. [ ] Click "Agree" to grant permissions
7. [ ] Verify redirect back to `/upload` page
8. [ ] Verify you see "Hi, [Your Name]" in the navigation

### Test Case: Already Authenticated

1. [ ] After logging in, navigate back to `http://localhost:3000`
2. [ ] Verify automatic redirect to `/upload` page
3. [ ] Verify you're not prompted to log in again

### Test Case: Logout

1. [ ] On `/upload` page, click "Logout"
2. [ ] Verify redirect to home page
3. [ ] Verify "Connect with Spotify" button appears again

## 3. Image Analysis Flow

### Test Images to Use

Use these search terms to find good test images:

- "Coachella 2024 poster"
- "Lollapalooza lineup"
- "Glastonbury festival poster"
- "Bonnaroo lineup"
- "Austin City Limits poster"

### Test Case: Successful Analysis

1. [ ] On `/upload` page, click "Choose Image"
2. [ ] Select a festival poster image
3. [ ] Verify image preview appears
4. [ ] Click "Analyze Poster"
5. [ ] Verify loading spinner appears
6. [ ] Wait for analysis (5-15 seconds)
7. [ ] Verify list of artists appears
8. [ ] Check that reasonable artists are detected (not just random text)

### Test Case: No Text Detected

1. [ ] Upload a blank image or random photo (not a poster)
2. [ ] Click "Analyze Poster"
3. [ ] Verify error message: "No artists found in the image"

### Test Case: Invalid File Type

1. [ ] Try uploading a non-image file (PDF, .txt, etc.)
2. [ ] Verify error message: "Please select an image file"

## 4. Playlist Creation Flow

### Test Case: Successful Playlist Creation

1. [ ] After analyzing an image with detected artists
2. [ ] Click "Create Spotify Playlist"
3. [ ] Verify loading state: "Creating Playlist..."
4. [ ] Wait for creation (10-30 seconds depending on artist count)
5. [ ] Verify redirect to `/success` page
6. [ ] Verify success message and "Open in Spotify" button
7. [ ] Click "Open in Spotify"
8. [ ] Verify new tab opens with your playlist
9. [ ] Check playlist contents:
   - [ ] Playlist exists in your Spotify account
   - [ ] Playlist has a reasonable number of tracks
   - [ ] Track artists match detected artists

### Test Case: No Artists Found

1. [ ] Manually edit the request (use browser dev tools) to send empty artists array
2. [ ] Verify error message appears

## 5. Edge Cases

### Test Case: Large Image (10MB+)

1. [ ] Upload a very large festival poster image
2. [ ] Verify either:
   - [ ] Upload succeeds and analysis works
   - [ ] Error message about file size

### Test Case: Image with 50+ Artists

1. [ ] Find a large festival poster (Coachella full lineup)
2. [ ] Upload and analyze
3. [ ] Verify analysis completes (may take longer)
4. [ ] Create playlist
5. [ ] Verify playlist creation completes (may take 30-60 seconds)
6. [ ] Check Spotify rate limits aren't hit

### Test Case: Image with Sponsors/Text

1. [ ] Upload poster with lots of sponsor logos and non-artist text
2. [ ] Verify filtering removes:
   - [ ] URLs (www.festivaltix.com, etc.)
   - [ ] Dates (July 4-6, 2025)
   - [ ] Common keywords (presented by, tickets, VIP)
   - [ ] Sponsor brands (Red Bull, Pepsi, etc.)

### Test Case: Duplicate Artists

1. [ ] Find poster where an artist name appears multiple times
2. [ ] Verify deduplication works (artist only appears once in list)

## 6. API Endpoint Tests

### Test Authentication Required

```bash
# Should return 401 without auth cookie
curl http://localhost:3000/api/analyze
curl http://localhost:3000/api/create-playlist
```

### Test Invalid Methods

```bash
# Should return 405 Method Not Allowed
curl -X POST http://localhost:3000/api/auth/login
curl -X GET http://localhost:3000/api/analyze
```

## 7. Console Checks

### Browser Console

Open browser DevTools and check for:

- [ ] No JavaScript errors
- [ ] No 404 errors for resources
- [ ] Successful API calls (200 status codes)
- [ ] Proper error handling for failed requests

### Server Console

Check the terminal running `npm run dev` for:

- [ ] No uncaught errors
- [ ] Proper logging of API calls
- [ ] Google Vision API responses
- [ ] Spotify API responses

## 8. Performance Tests

### Image Analysis Time

- [ ] Small image (< 1MB): Should complete in 5-10 seconds
- [ ] Large image (5-10MB): Should complete in 10-20 seconds

### Playlist Creation Time

- [ ] 10 artists: Should complete in 5-10 seconds
- [ ] 30 artists: Should complete in 15-25 seconds
- [ ] 50+ artists: Should complete in 30-60 seconds

## 9. Browser Compatibility

Test in multiple browsers:

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

## 10. Mobile Responsiveness

Test on mobile device or browser dev tools:

- [ ] Home page displays correctly
- [ ] Upload page is usable
- [ ] Image preview scales properly
- [ ] Buttons are tappable
- [ ] Success page displays correctly

## Known Issues / Limitations

Document any issues found during testing:

1. **Issue**: [Description]
   - **Impact**: [Low/Medium/High]
   - **Workaround**: [If any]

2. **Issue**: OCR sometimes mistakes sponsor logos for artist names
   - **Impact**: Low
   - **Workaround**: Manual filtering is possible in V2

## Success Criteria

The MVP is ready for deployment if:

- [ ] All authentication flows work
- [ ] Image analysis extracts reasonable artists (>50% accuracy)
- [ ] Playlists are successfully created in Spotify
- [ ] No critical errors in console
- [ ] Build completes without errors (`npm run build`)
- [ ] App works in major browsers
- [ ] Mobile experience is functional

## Next Steps After Testing

1. Fix any critical bugs found
2. Deploy to Vercel
3. Test production deployment
4. Share with beta testers
5. Gather feedback for V2 features
