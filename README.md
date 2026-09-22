# Biblical Hebrew Accusative Data

A searchable dataset of 1,609 constituents in the
Pentateuch (Genesis–Deuteronomy) with analysis, compiled by Jacques E. J. Boulet. It is the
digital database accompanying *Accusative Noun Phrases in Biblical Hebrew:
Arguments, Modifiers, and Secondary Predicates* (Ancient Near Eastern
Monographs; SBL Press).

**Browse the data:** https://jejboulet.github.io/bh-accusative-data/

## Files

- `data.json`: the dataset
- `alignment_overrides.json`: manual corrections to Hebrew–English word alignments
- `index.html`, `script.js`, `style.css`: the search interface

## Viewing offline

The easiest way to browse the data is the live site linked above. To use the
search interface from a downloaded copy (for example, the archive on Zenodo):

1. Unzip the download.
2. Open a terminal and use `cd` to change into the unzipped folder (the one
   that contains `index.html`).
3. Start a local web server with Python 3:

   ```bash
   python3 -m http.server 8000
   ```

   On Windows, use `python` or `py` instead of `python3`.
4. Open http://localhost:8000 in a web browser.
5. When finished, press Ctrl+C in the terminal to stop the server.

Opening `index.html` directly (by double-clicking it) shows an empty table,
because most browsers do not let a page load data files from your own disk.

`data.json` is plain JSON and can also be read directly with any JSON viewer
or data tool (Python, R, etc.).

## Citation

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22903206.svg)](https://doi.org/10.5281/zenodo.22903206)

Boulet, Jacques E. J. *Biblical Hebrew Accusative Data*. Zenodo.
https://doi.org/10.5281/zenodo.22903206.

This DOI always resolves to the latest version. Each release also has its own
version-specific DOI, listed on the Zenodo record. See also
[`CITATION.cff`](CITATION.cff), or use "Cite this repository" on GitHub.

## License

[CC BY 4.0](LICENSE). You may share and adapt this material for any purpose,
provided you give appropriate credit.
