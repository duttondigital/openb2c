package main

import "core:fmt"
import "core:strconv"
import "sqlite"

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

get_production_status :: proc(start_date: string, end_date: string) -> string {
	return "upcoming"
}

query_result_to_productions :: proc(result: sqlite.QueryResult) -> []Production {
	productions := make([dynamic]Production, context.temp_allocator)

	for row in result.rows {
		if len(row) >= 11 {
			id, _ := strconv.parse_int(row[0])
			title := row[1]
			composer := row[2]

			description := fmt.tprintf("%s by %s", title, composer)
			date := row[8] != "" ? row[8] : row[7]
			status := get_production_status(row[7], row[8])

			production := Production {
				id          = id,
				title       = title,
				description = description,
				date        = date,
				status      = status,
			}
			append(&productions, production)
		}
	}

	return productions[:]
}

get_productions :: proc() -> []Production {
	QUERY :: "SELECT id, title, composer, conductor, director, venue, premiere_date, run_start_date, run_end_date, \"cast\", notes FROM production ORDER BY run_start_date DESC"
	result, ok := sqlite.exec(&db, QUERY)
	if !ok {
		return nil
	}
	return query_result_to_productions(result)
}

get_news :: proc() -> []News {
	return NEWS[:]
}
