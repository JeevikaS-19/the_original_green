# Case study research

Each company has a `*_extract.txt` with its disclosed figures, labelled per line as disclosed or derived. Items not in the source are listed as "Not disclosed" and are left blank in the tracker data. They are not modelled.

- `tcs_fy2026_extract.txt`
- `infosys_fy2026_extract.txt`
- `sources.md` lists where each figure came from and its verification status.

The tracker CSVs are in `shared/demo_data/<company>/`. Each carries `metadata.json`, which marks every value as disclosed or derived.
