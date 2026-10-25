# Ad Builder — Diamond Horseshoe Productions

Makes the ad images for a show (an act at a theatre on certain dates) in every size the theatre asks for, then downloads them all as one ZIP.

## Opening it

Double-click `index.html` (Chrome or Edge recommended). Nothing to install. An internet connection is needed for the fonts.

Everything you enter (acts, photos, theatres, shows) is saved **in that browser on that computer**, so set up a backup.

## Backups

**Automatic (Chrome or Edge):** *File → Set up automatic backup folder…* and pick a folder, e.g. a shared Google Drive folder. The app copies every profile there right away and again after every change. The button at the top shows when it last backed up; if it turns orange ("Backup paused"), click it to allow saving again.

The folder holds `ad-builder-data.json` (all profiles), `photos/` (each photo saved once) and `history/` (a daily copy of the profiles, last 60 days).

**New or replacement computer:** open the app, choose *File → Restore from backup folder…* and pick the same folder. Everything comes back and backups carry on.

**Any browser (Safari, Firefox):** *File → Save backup file…* downloads one file with everything in it. Put it in Google Drive. *File → Restore from backup file…* brings it back.

## Yearly workflow

1. **Acts** (once per act): *File → Create Act*. Name it, drop in all the photos, tick **Has title art** on photos that already include the show name/logo, click each photo where the faces are, and set the title text or logo plus fonts/colors. The preview shows the overlay live.
2. **Theatres** (once per venue): *File → New Theatre*. It starts with the Google Ads pack (20 images: 8 landscape 1200×628, 8 square 1200×1200, 4 portrait 960×1200). Add or remove sizes and set how many of each. Use **in** for print sizes (300 dpi). **Duplicate** a theatre to start a similar one.
3. **Shows**: *Create New Show*. Pick the act, theatre and dates. The ads read like “Mendel Center, Dec 6” automatically; you can change the wording. Choose how many images (theatre default, or 10/20/30…).
4. In the gallery, untick any image you don't want, change the photo or look on any card, then **Download**.
   If a crop looks off, click **✥ Adjust crop** on that image, drag the picture to move it, use **+ / −** to zoom, and click **Done** (**Reset** puts it back). Adjusted images show a dot on the button. To fix every image of a photo at once, edit the act and click where the faces are on that photo instead.
   To fix the words, click **✎ Edit words**. Dashed outlines show the title and the theatre & date; click one to pick it (gold outline), drag it to move it, use **+ / −** to resize it, and choose an **Effect** for just those words (Sparkle, Glow, Gold shine, Outline, Neon, Dark backing, 3D shadow). Words always stay inside the picture. **Reset** puts the picked words back.
   **⧉ De-group** breaks the picked words apart one step at a time, so each piece can be moved, resized and given its own effect. First it splits them into rows (the title into “Christmas”, “with”, “THE RAT PACK”). Pick a row and De-group again to split it into single words (“THE”, “RAT”, “PACK”). Words that sit on a single line, like “Mendel Center, Dec 6”, go straight to single words. Pieces start where they were, keeping any move, size or effect already given. **⧈ Re-group** goes back one step: a word joins its row again, a row joins the whole block.

## Animated ads

In the gallery, set **Format** to **Animated GIF** or **Video (MP4)**, then pick an **Animation**:

- **Glisten & twinkle**: a light sweeps across the words, and little stars pop on the letters.
- **Words glisten**: just the light sweep.
- **Twinkling stars**: just the stars.
- **Floating sparkles**: gold sparkles drift up across the picture, and the words glisten.

Sparkles already in a picture (the gold sparkle look, or the Sparkle effect on words) always twinkle and shimmer. Point at any image to watch it move, then download as usual. Each image keeps its own photo, crop, look and word edits.

- **Animated GIF** loops every 3.2 seconds and plays almost anywhere: websites (like the County17 banners), email and marquees.
- **Video (MP4)** is about 10 seconds (the loop three times), for Facebook/Instagram posts and reels, and TV slides. It needs Chrome or Edge.

Animations are at most 1920 pixels on the long side, so print sizes come out smaller. **Google Ads:** responsive display ads (the 20-image pack) only take still JPG or PNG images. Google's uploaded animated GIF ads have stricter rules (under 150 KB, slower than 5 frames a second), which these GIFs don't follow.

## How the images are made

For each size, the first images are **clean** versions, one per photo. If more are needed than there are photos, the app works through styled looks in order: gold sparkle, black & white, spotlight, gold frame, warm glow, full photo on blur, flipped layout, close-up, accent tint, cinematic bars.

Photos marked **Has title art** are never cropped more than a sliver. When the shape is very different they're shown whole over a blurred copy of themselves, with the theatre and date in the space left over.

## Files

- `index.html`, `styles.css`: page and look
- `js/render.js`: image layouts, styles, and which photo/style goes into each slot
- `js/app.js`: screens, editors, gallery, downloads, backup
- `js/presets.js`: fonts, size presets, the Google pack, starter theatres
- `js/db.js`, `js/zip.js`: browser storage and ZIP writer
- `js/gif.js`, `js/mp4.js`: animated GIF and MP4 video writers
