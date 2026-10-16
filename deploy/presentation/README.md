# Présentation en ligne

`site/` is the static public version of the deck, served by nginx at `https://greenleaves.ga/presentation/`
(`deploy/nginx/trees-presentation.snippet`, installed by `deploy.sh`). Nothing runs here: `index.html`
(menu, search, overview, zoom, keyboard and swipe navigation), `slides/` (one 1920×1080 JPEG per page),
`thumbs/` (overview) and `Foresterie-Numerique-Presentation.pdf` (the same pages as a PDF).

To refresh it after the deck changes, render the pages again from the Slides artifact (every page to a
1920×1080 JPEG named `NN-<slide id>.jpg`) and regenerate `index.html`, thumbnails and the PDF. The pages
contain the shared pilot demo accounts and the team's phone numbers on purpose (decision of the project
owner): do not add anything private to the deck without removing it here.
