package main

import "../sqlite"

Production :: struct {
	id:          int,
	title:       string,
	description: string,
	date:        string,
	status:      string,
}

News :: struct {
	id:      int,
	title:   string,
	content: string,
	date:    string,
	slug:    string, // URL slug for individual news posts
}

// Global database connection
db: sqlite.Database

NEWS := [?]News {
	{
		1,
		"Winter Season Auditions Now Open",
		"We're excited to announce that auditions for our Spring 2025 Season are now open! This year's lineup promises to be our most ambitious yet.",
		"2024-12-01",
		"2024-12-01-winter-auditions",
	},
	{
		2,
		"Auditions Open for Carmen",
		"We are excited to announce that auditions for our upcoming production of Carmen are now open. We are looking for passionate singers to join our cast.",
		"2024-02-15",
		"",
	},
	{
		3,
		"New Rehearsal Space",
		"Thanks to generous community support, we have secured a new rehearsal space that will enhance our preparation process.",
		"2024-02-01",
		"",
	},
	{
		4,
		"Season Announcement",
		"We are thrilled to announce our upcoming season featuring three amazing productions that showcase the best of opera.",
		"2024-01-15",
		"",
	},
}

init_database :: proc() -> bool {
	db = sqlite.open("database/opera.db") or_return
	return true
}

cleanup_database :: proc() {
	sqlite.close(&db)
}

get_productions :: proc() -> (productions: [dynamic]Production) {
	QUERY :: `SELECT * FROM production ORDER BY run_start_date DESC`
	err := sqlite.query(&db, &productions, QUERY)
	return
}

get_news :: proc() -> (news: [dynamic]News) {
	QUERY :: `SELECT * FROM news`
	err := sqlite.query(&db, &news, QUERY)
	return
}
