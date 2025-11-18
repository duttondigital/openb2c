CREATE TABLE production (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    composer TEXT NOT NULL,
    conductor TEXT,
    director TEXT,
    venue TEXT,
    premiere_date DATE,
    run_start_date DATE,
    run_end_date DATE,
    cast TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);