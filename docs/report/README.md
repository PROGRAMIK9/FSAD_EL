# Project report

`report.tex` is the Experiential Learning report for RVCE Academic Hub: A4, Times New Roman (newtx) 12 pt, 1.5 line spacing.

## Build

Any standard TeX distribution (TeX Live, MiKTeX) or Overleaf works; the report uses only common packages
(newtx, geometry, setspace, titlesec, fancyhdr, booktabs, tabularx, longtable, listings, tikz, hyperref).

```bash
cd docs/report
latexmk -pdf report.tex      # or: pdflatex report.tex (run twice for the contents and references)
```

On Overleaf, upload this folder (with `figures/`) and compile with pdfLaTeX.

## Before submitting

Search for `\TODO` and fill in the team members, USNs, guide, course code, department and dates on the title page,
certificate and declaration. Placeholders print in red until they are replaced.

Screenshots in `figures/` were taken from the running application with sample data. Missing image files do not break
the build; a labelled box is printed instead.
