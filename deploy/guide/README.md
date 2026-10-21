# Guide utilisateur du Ministère

`site/` is the static public user guide for the Ministry space, served by nginx at
`https://greenleaves.ga/foresterie-app/guide/` (locations in `deploy/nginx/trees-presentation.snippet`,
installed and reloaded by `deploy.sh`). Nothing runs here: `index.html` (table of contents, search, zoom on the
captures, numbered markers on the key screens, print layout), `captures/` (screens of the production web app,
1600 px JPEG, pilot account `mef.dp2@pilote.ga`) and `Guide-Utilisateur-Ministere.pdf` (the same page printed to A4).

To refresh it after the Ministry screens change: capture the screens again from the web app with the pilot
Ministry account (view only — never press a decision button on production), keep the file names so the markers
stay in place (re-check each marked capture), and print the page to PDF again (Chrome, A4, backgrounds on).
Keep personal data out of the captures (the « Comptes » list carries real e-mail addresses; production test
organisations are filtered out). The page states the SNTBG positioning (arrêté n° 001/MEFPECCHF/CAB-M du
3 octobre 2023): keep it complementary and say plainly that the passerelle is not yet connected until it is.
