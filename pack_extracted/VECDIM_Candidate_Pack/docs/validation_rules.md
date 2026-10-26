# Validation rules

These rules are implemented in R in `R/helpers.R` (`validate_records()`). **Your app and API must reproduce them.** The R output `outputs/validation_flags_all.csv` is the answer key for the parity test.

## Constants

- Nigeria bounding box: latitude 4 to 14, longitude 2.5 to 15 (inclusive).
- Reference date for "future": **2026-10-08** in the parity test. In the app, use the device clock on the phone and the server clock on the API.
- Pilot-state bounding boxes (inclusive):

| State | Latitude min | Latitude max | Longitude min | Longitude max |
| --- | --- | --- | --- | --- |
| Lagos | 6.3 | 6.8 | 2.7 | 4.4 |
| Kano | 11.5 | 12.6 | 8.0 | 9.2 |
| Osun | 7.0 | 8.2 | 4.0 | 5.0 |

- LGA reference points: `data/lga_reference.csv` has one reference point (latitude, longitude) for each of the 15 LGAs. "Distance" means the great-circle (haversine) distance in km between the record's GPS point and the reference point of the LGA the user selected. The limit is **25 km**. (A real deployment would use LGA boundary polygons; reference points keep this task small.)
- GPS accuracy: `gps_accuracy_m` is the horizontal accuracy radius, in metres, reported by the phone for the GPS fix (for example `coords.accuracy` in Expo Location). Target: **10 m or better**. Above **50 m** is unusable.

## WHO tube-test class (shown on the form, not a validation rule)

Computed from `mortality_pct`, which is `100 x n_dead / n_exposed` rounded to **1 decimal place first**. The class uses the rounded value, exactly as `R/02_descriptive_analysis.R` does.

| Class | Mortality (rounded to 1 decimal) | Examples |
| --- | --- | --- |
| Susceptible | 98.0 or more | 98.0, 100 |
| Possible resistance | 90.0 up to but not including 98.0 | 90.0, 97.5, 97.9 |
| Resistant | below 90.0 | 89.9, 89.5, 50 |

Edge cases to test: 89.9 is Resistant, 90.0 is Possible resistance, 97.9 is Possible resistance, 98.0 is Susceptible. No control-mortality (Abbott) correction is applied, because the form has no control-tube fields; the class is based on the raw mortality of the exposed tubes.

## Rules

"Device" means checked in the app before saving. "Server" means checked again by the API. "In R output" means the rule is a column in `outputs/validation_flags_all.csv`, so it is covered by the parity test. In the app and API, "missing" means null, undefined or an empty string (the CSV marks missing values as `NA`). A missing value never makes a comparison rule fire (for example, a missing temperature does not trigger the temperature rule); missing values are handled by `missing_core`.

| Rule ID | Condition (flag when true) | Device | Server | In R output | Severity |
| --- | --- | --- | --- | --- | --- |
| `GPS_outside_nigeria` | latitude or longitude outside the Nigeria box | Yes | Yes | Yes | Block |
| `GPS_zero_zero` | latitude = 0 and longitude = 0 | Yes | Yes | Yes | Block |
| `GPS_state_mismatch` | state unknown, or the point is outside the chosen state's box | Yes | Yes | Yes | Block |
| `GPS_far_from_lga` | the point is more than 25 km from the reference point of the chosen LGA (or the LGA is unknown). Catches a point inside the right state but in the wrong LGA | Yes | Yes | Yes | **Warn** |
| `GPS_accuracy_poor` | `gps_accuracy_m` is above 10 and up to 50 | Yes | Yes (when the field is sent) | No (not in the dataset) | **Warn** |
| `GPS_accuracy_unusable` | `gps_accuracy_m` is above 50, or the phone gave no accuracy value | Yes | Yes (when the field is sent) | No (not in the dataset) | Block |
| `n_dead_gt_n_exposed` | `n_dead` > `n_exposed` | Yes | Yes | Yes | Block |
| `positivity_out_range` | `slide_positivity_pct` < 0 or > 100 | No (not on form) | Yes | Yes | Block on server |
| `future_date` | `collection_date` later than the reference date | Yes | Yes | Yes | Block |
| `temp_implausible` | `temp_c` < 10 or > 50 | No (not on form) | Yes | Yes | Block on server |
| `rainfall_implausible` | `rainfall_mm` < 0 or > 1500 | No (not on form) | Yes | Yes | Block on server |
| `duplicate` | same `ward`, `collection_date`, `species`, `insecticide`, `n_exposed` and `n_dead` as an earlier record; **the earliest `record_id` is kept**, later ones are flagged | Yes (against records on the device) | Yes (against the database) | Yes | Warn |
| `missing_core` | any of `ndvi`, `rainfall_mm`, `itn_use_pct`, `species` is missing | `itn_use_pct` and `species` are required on the form, so Block | Yes | Yes | Block |

Notes:

- `ndvi` and `rainfall_mm` are added by the server for new app records, so the server reports `missing_core` for them as `enrichment_pending`, not as an error.
- **Block** means the record cannot be saved on the device (or is rejected by the server) until fixed, and the message must say what is wrong and how to fix it. **Warn** means the user can save, and the record syncs with the flag attached.
- The server must never trust the device: it re-runs every rule it can and returns every rule that fires, per record, with the field it concerns and a plain-language message.
- `GPS_far_from_lga` and `GPS_accuracy_poor` are warnings: do not reject a record for them. In the app, show them clearly before saving ("Your location is 38 km from Ife Central. Check the LGA, or recapture the location") and let the user continue.
- Drafts (partly filled forms) are **not** validated for Block rules while they are being saved automatically. The rules run when the user taps Save. See `field_form_spec.md`.

## Parity test (used for assessment)

Write a function in your project that takes a list of records like the rows in `data/vecdim_dummy_entomology_data.csv` and returns the rule flags. Run it over all 1,525 rows with the reference date 2026-10-08 and compare with `outputs/validation_flags_all.csv`:

- **Scope.** The comparison covers every rule marked "Yes" in the "In R output" column (11 rules). Run it twice if your device and server validators are separate code: once for the server validator (all 11 rules) and once for the device validator (the rules marked "Yes" under Device; the three server-only rules are skipped).
- The two accuracy rules are not in the dataset, so they are not part of the 1,525-row comparison. Cover them with your own unit tests (the edge cases are 10, 10.1, 50 and 50.1 m).
- Expected: **every rule matches on every row.** We accept at most 5 differing rows in total if your README explains each one.
- The summary in `outputs/validation_summary.csv` shows the expected number of flagged rows per rule (rules overlap).
- Include the comparison as an automated test or script, and save its output.
