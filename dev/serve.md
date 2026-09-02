# Run the site locally

From the repository root:

    python3 -m http.server 8000

Then open http://localhost:8000/ . ES modules and cross-origin calls to
Wikidata work fine from `http://localhost`.

# Run the tests

    cd dev && npm install && npm test
