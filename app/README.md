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

## How the images are made

For each size, the first images are **clean** versions, one per photo. If more are needed than there are photos, the app works through styled looks in order: gold sparkle, black & white, spotlight, gold frame, warm glow, full photo on blur, flipped layout, close-up, accent tint, cinematic bars.

Photos marked **Has title art** are never cropped more than a sliver. When the shape is very different they're shown whole over a blurred copy of themselves, with the theatre and date in the space left over.

## Files

- `index.html`, `styles.css`: page and look
- `js/render.js`: image layouts, styles, and which photo/style goes into each slot
- `js/app.js`: screens, editors, gallery, downloads, backup
- `js/presets.js`: fonts, size presets, the Google pack, starter theatres
- `js/db.js`, `js/zip.js`: browser storage and ZIP writer
