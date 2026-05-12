# Seed Data

Seed data declares deterministic rows in the same Nix composition as the schema. It is intended for two different cases:

- `seed.reference.<table>` contains app-controlled reference rows. Generated runtimes apply these at startup with idempotent upserts.
- `seed.fixtures.<table>` contains example or demo rows. Generated runtimes only apply these when fixture seeding is enabled.

Every seed row must include a primary-key or unique field. This keeps startup safe to repeat and prevents accidental duplicate rows.

```nix
seed.reference.venue = [
  {
    id = 1;
    name = "Hall for Cornwall";
    address = "Back Quay";
    city = "Truro";
    postcode = "TR1 2LL";
    capacity = 900;
  }
];

seed.fixtures.performance = [
  {
    id = 1;
    title = "The Magic Flute";
    venue_id = 1;
    date = "2026-06-12";
    time = "19:30";
    duration_mins = 150;
    price_pence = 2500;
  }
];
```

Generated outputs include:

- `seed.sql` for reference data.
- `fixtures.sql` for example fixtures.

Reference data is applied automatically after schema migrations. Fixture data is applied when `OPENB2C_APPLY_FIXTURES=true`, or when `seed.applyFixturesByDefault = true` in a non-production runtime. Set `OPENB2C_APPLY_FIXTURES=false` to disable a non-production default.
