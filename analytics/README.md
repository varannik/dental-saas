# Analytics & Data

Data pipelines, analytics services, and ML integrations.

## Structure

```
analytics/
├── pipelines/              # Data pipeline definitions
│   ├── etl/                # ETL jobs
│   └── streaming/          # Real-time streaming
├── models/                 # ML models
│   ├── training/           # Training scripts
│   └── inference/          # Inference services
├── queries/                # SQL queries and views
│   ├── reports/            # Report queries
│   └── dashboards/         # Dashboard queries
├── schemas/                # Data schemas
│   ├── events/             # Event schemas
│   └── dimensions/         # Dimension tables
└── config/                 # Configuration
```

## Data Stack

- **Data Warehouse**: Snowflake / BigQuery
- **ETL**: dbt / Airflow
- **Streaming**: Kafka / Kinesis
- **Analytics**: Metabase / Looker
- **ML Platform**: MLflow / SageMaker

## Event Tracking

Events are collected using a custom event SDK and processed through the data pipeline.

### Standard Events

- `user.signed_up`
- `user.logged_in`
- `subscription.created`
- `subscription.cancelled`
- `feature.used`

