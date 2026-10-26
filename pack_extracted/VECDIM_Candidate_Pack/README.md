# VECDIM: Developer Task Pack (for candidates)

You are building the **VECDIM mobile app and its backend**. The data analysis is already done for you in R. You do not need R installed, and you do not need to change the R code.

## What is in this pack

| Path | What it is |
| --- | --- |
| `docs/vecdim_app_plan.md` | The part of the VECDIM plan your app implements |
| `docs/field_form_spec.md` | Exactly which fields the field worker enters, and how |
| `docs/validation_rules.md` | The data-quality rules to implement, and the parity test |
| `docs/api_contract.md` | Suggested API endpoints and JSON (language-neutral) |
| `data/vecdim_dummy_entomology_data.csv` | Synthetic site-level records (1,525 rows, three states). It contains deliberate errors |
| `data/lga_reference.csv` | A reference point for each of the 15 LGAs, for the "far from the chosen LGA" check |
| `data/demo_users.csv` | Demo users for the three roles (use them, or create your own with the same roles) |
| `R/` | The provided R pipeline (validation, descriptive analysis, random-forest model, early-warning alerts). Read it as a specification |
| `outputs/` | The results of running that pipeline, already generated |

Read the task brief first (sent with this pack), then `docs/vecdim_app_plan.md`.

## The outputs you will use

| File | Use it for |
| --- | --- |
| `outputs/validation_flags_all.csv` | Answer key for your validator (one row per record, one TRUE/FALSE column per rule) |
| `outputs/alerts.csv` | The alert feed your dashboard shows (LGA x month, tier, resistance flag) |
| `outputs/risk_predictions.csv` | Record-level risk for a map layer (bonus) |
| `outputs/cleaned_data.csv` | Records that passed all rules; use as seed data |
| `outputs/model_metrics.csv`, `rf_variable_importance.csv` and the `fig_*.png` files | Context for the dashboard's explanation text. You do not have to reproduce them |

## If you want to rerun the R pipeline (optional)

Needs R 4.0 or newer and the packages `dplyr`, `ggplot2` and `randomForest`. From this folder:

    Rscript R/run_all.R data/vecdim_dummy_entomology_data.csv outputs

It takes about a minute and gives the same results (the random seed is fixed).

## Important

The data are **synthetic**. They are not real surveillance data from UNIOSUN or any health programme, and must not be shared or reused.
