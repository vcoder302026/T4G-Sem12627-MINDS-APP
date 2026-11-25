# Handbook source

[`../MINDS-Volunteer-App-Handbook.pdf`](../MINDS-Volunteer-App-Handbook.pdf) is the printable
user & admin handbook for beginners. It follows the app's own design (indigo, white cards,
uppercase section labels, the Volunteer / Regular / Admin badges, the app's info and warning
boxes) and uses screenshots of the local demo, so every person in it is fictional.

**Update it whenever a screen or a step changes**, together with
[`../USER-GUIDE.md`](../USER-GUIDE.md) (the full reference it is based on):

```bash
cd volunteer-app
PORT=5326 npm run dev &                         # the demo, with its fictional data
python3 docs/handbook/shots.py /tmp/hbshots     # phone screenshots of every screen it shows
python3 docs/handbook/build.py /tmp/hbshots web/icons/icon-192.png docs/MINDS-Volunteer-App-Handbook.pdf
```

Needs Python with `playwright` (and its Chromium) and `Pillow`. The text is in `build.py`, one
`chapter(...)` per page: keep each chapter to one A4 page (split it as Chapter 1 is when it grows),
and bump `HB_VERSION` and `APP_VERSION` at the top.
