package sqlite

Query_Error :: union {
	Unmarshall_Error,
	bool, // TODO
}

query :: proc(db: ^Database, dst: ^[dynamic]$T, query_string: string) -> Query_Error {
	result := exec(db, query_string) or_return
	defer cleanup_query_metadata(&result)

	if len(result.rows) == 0 do return nil
	unmarshall(result, dst) or_return

	return nil
}

// Clean up only the query metadata (column names, row arrays)
// In the success case, data values are transferred to the caller's structs
// In the error case, we still need to clean up any remaining data values
cleanup_query_metadata :: proc(result: ^QueryResult) {
	// Delete column name strings
	for col in result.columns do delete(col)
	delete(result.columns)

	// Delete row arrays and any strings/bytes that weren't transferred
	// (strings/bytes get transferred to structs, but if unmarshall fails,
	// some values may still be in the result)
	for row in result.rows {
		for cell in row {
			// TODO: free un-transferred cells
			// switch v in cell {
			// case string: delete(v)
			// case []byte: delete(v)
			// case i64, f64: // No cleanup needed
			// }
		}
		delete(row)
	}
	delete(result.rows)
}
