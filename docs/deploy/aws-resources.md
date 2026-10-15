# AWS resources

This file records the project's AWS account and resources: names, IDs and settings, never secrets. The `aws-provision` skill keeps it up to date.

## Account

| Field | Value |
|---|---|
| Account name | AI Craft Ecosystem |
| Account ID | 626159998512 |
| Owner | cxa.craftecosystem@gmail.com (Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, IIT Kharagpur) |
| CLI profile | `cxa` (sign in with `aws login --profile cxa`) |
| Region for this project | `ap-south-1` (Mumbai) |
| Billing plan | Paid plan, active. Credits remaining when first checked: USD 44.66 (`aws freetier get-account-plan-state`) |

These values were checked with `aws sts get-caller-identity` and `aws account get-account-information`. Every command must run against this account ID. The project lead also has a separate work AWS account; never use it for this project.

**Other usage.** The account already shows small usage from other work (Lambda, SQS, SNS in ap-south-1, Glue, KMS, CloudWatch), all within the Always Free limits. Budgets and alarms set up for this project should be tagged and filtered to this project's resources where possible.

## Expected monthly cost (on-demand, ap-south-1, AWS Price List API)

| Item | Price | Per month (730 h) |
|---|---|---|
| RDS `db.t4g.micro`, PostgreSQL, Single-AZ | USD 0.021 per instance-hour | USD 15.33 |
| RDS gp3 storage, 20 GB | USD 0.131 per GB-month | USD 2.62 |
| Public IPv4 address (publicly accessible RDS) | USD 0.005 per hour | USD 3.65 |
| RDS backup storage up to 100% of provisioned storage | free allocation; USD 0.095 per GB-month above it | USD 0 expected |
| S3 Standard (a few MB of media) | USD 0.025 per GB-month (first 50 TB) | under USD 0.01 |
| **Total** | | **about USD 21.6** |

- **Credits:** the USD 44.66 covers about two months of this. After that, charges go to the account's payment method.
- **Burstable instances:** RDS T4g instances can bill for CPU above their baseline. The `CPUCreditBalance` and CPU alarms watch for this.

## Resources

None created yet.
