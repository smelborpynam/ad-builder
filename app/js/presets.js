// Fonts, size presets, requirement packs and starter theatre profiles.
window.AdPresets = (() => {
  'use strict';

  // Fonts available for overlays. Web fonts are loaded from Google Fonts in index.html.
  const FONTS = [
    { family: 'Playfair Display', weight: 700, kind: 'serif' },
    { family: 'Cinzel', weight: 700, kind: 'serif' },
    { family: 'Abril Fatface', weight: 400, kind: 'serif' },
    { family: 'Alfa Slab One', weight: 400, kind: 'serif' },
    { family: 'Great Vibes', weight: 400, kind: 'script' },
    { family: 'Pinyon Script', weight: 400, kind: 'script' },
    { family: 'Lobster', weight: 400, kind: 'script' },
    { family: 'Josefin Sans', weight: 600, kind: 'sans' },
    { family: 'Montserrat', weight: 800, kind: 'sans' },
    { family: 'Oswald', weight: 600, kind: 'sans' },
    { family: 'Bebas Neue', weight: 400, kind: 'sans' },
    { family: 'Monoton', weight: 400, kind: 'sans' },
    { family: 'Georgia', weight: 700, kind: 'serif', system: true },
    { family: 'Arial', weight: 700, kind: 'sans', system: true },
  ];

  // Common sizes offered in the theatre editor's "Add size" list.
  const SIZE_PRESETS = [
    { group: 'Google Ads', label: 'Google – Landscape 1.91:1', w: 1200, h: 628 },
    { group: 'Google Ads', label: 'Google – Square 1:1', w: 1200, h: 1200 },
    { group: 'Google Ads', label: 'Google – Portrait 4:5', w: 960, h: 1200 },
    { group: 'Web banners', label: 'Half page', w: 300, h: 600 },
    { group: 'Web banners', label: 'Medium rectangle', w: 300, h: 250 },
    { group: 'Web banners', label: 'Large rectangle', w: 336, h: 280 },
    { group: 'Web banners', label: 'Mobile banner', w: 320, h: 50 },
    { group: 'Web banners', label: 'Leaderboard', w: 728, h: 90 },
    { group: 'Web banners', label: 'Wide skyscraper', w: 160, h: 600 },
    { group: 'Web banners', label: 'Billboard banner', w: 970, h: 250 },
    { group: 'Social', label: 'Social – Square', w: 1080, h: 1080 },
    { group: 'Social', label: 'Social – Portrait 4:5', w: 1080, h: 1350 },
    { group: 'Social', label: 'Story / Reel', w: 1080, h: 1920 },
    { group: 'Social', label: 'Facebook event cover', w: 1920, h: 1005 },
    { group: 'Social', label: 'Facebook link image', w: 1200, h: 630 },
    { group: 'Screens', label: 'TV slide (HD)', w: 1920, h: 1080 },
    { group: 'Screens', label: 'Marquee', w: 512, h: 256, minimal: true },
    { group: 'Print (300 dpi)', label: 'Poster 11×17 in', w: 11, h: 17, unit: 'in' },
    { group: 'Print (300 dpi)', label: 'Flyer 8.5×11 in', w: 8.5, h: 11, unit: 'in' },
  ];

  // Groups of sizes that can be dropped into a theatre profile in one click.
  const PACKS = [
    {
      id: 'google', name: 'Google Ads – 20 images',
      rows: [
        { label: 'Google – Landscape 1.91:1', w: 1200, h: 628, count: 8 },
        { label: 'Google – Square 1:1', w: 1200, h: 1200, count: 8 },
        { label: 'Google – Portrait 4:5', w: 960, h: 1200, count: 4 },
      ],
    },
    {
      id: 'social', name: 'Social posts – 12 images',
      rows: [
        { label: 'Social – Square', w: 1080, h: 1080, count: 6 },
        { label: 'Social – Portrait 4:5', w: 1080, h: 1350, count: 6 },
      ],
    },
    {
      id: 'banners', name: 'Standard web banners – 4 images',
      rows: [
        { label: 'Half page', w: 300, h: 600, count: 1 },
        { label: 'Medium rectangle', w: 300, h: 250, count: 1 },
        { label: 'Mobile banner', w: 320, h: 50, count: 1 },
        { label: 'Leaderboard', w: 728, h: 90, count: 1 },
      ],
    },
  ];

  // Starter theatre profiles created the first time the app opens.
  const SEED_THEATRES = [
    {
      name: 'Mendel Center',
      displayName: 'Mendel Center',
      city: '', state: '',
      notes: 'Google Ads campaign: 20 images.',
      sizes: PACKS[0].rows,
    },
    {
      name: 'Gillette, WY – Heritage Center',
      displayName: 'Heritage Center',
      city: 'Gillette', state: 'WY',
      notes: [
        'From the venue request. Not covered by this app:',
        '• Email marketing: 2 different email texts',
        '• Satellite radio: 30-second script or recorded audio',
        '',
        'Satellite radio 300x600 and 300x250 can reuse the County17 graphics.',
        'Social: 12 graphics at 1350x1080 or 1080x1080, ideally 12 different ones. Short reels welcome.',
      ].join('\n'),
      sizes: [
        { label: 'County17 – Half page', w: 300, h: 600, count: 1 },
        { label: 'County17 – Medium rectangle', w: 300, h: 250, count: 1 },
        { label: 'County17 – Mobile banner', w: 320, h: 50, count: 1 },
        { label: 'County17 – Leaderboard', w: 728, h: 90, count: 1 },
        { label: 'Billboard', w: 1056, h: 352, count: 1 },
        { label: 'Poster 11×17 in', w: 11, h: 17, unit: 'in', count: 1 },
        { label: 'Marquee', w: 300, h: 160, count: 1, minimal: true },
        { label: 'Marquee', w: 512, h: 256, count: 1, minimal: true },
        { label: 'Marquee', w: 896, h: 256, count: 1, minimal: true },
        { label: 'Satellite radio – Square', w: 500, h: 500, count: 1 },
        { label: 'Heritage Center TV slide', w: 1920, h: 1080, count: 1 },
        { label: 'Website feature', w: 950, h: 540, count: 1, localized: false },
        { label: 'Website thumbnail', w: 1500, h: 1500, count: 1, localized: false },
        { label: 'Social – Square', w: 1080, h: 1080, count: 6 },
        { label: 'Social – Landscape', w: 1350, h: 1080, count: 6 },
      ],
    },
  ];

  return { FONTS, SIZE_PRESETS, PACKS, SEED_THEATRES, PRINT_DPI: 300 };
})();
