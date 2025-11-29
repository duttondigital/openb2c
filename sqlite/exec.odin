
package sqlite

import "core:fmt"
import "core:mem"
import "core:strings"

SqlValue :: union {
	i64,
	f64,
	string,
	[]byte,
}

QueryResult :: struct {
	columns: []string,
	rows:    [][]SqlValue,
}

exec :: proc(db: ^Database, query: string) -> (QueryResult, bool) {
	query_cstr := strings.clone_to_cstring(query, context.temp_allocator)

	stmt: sqlite3_stmt
	result := sqlite3_prepare_v2(db.handle, query_cstr, -1, &stmt, nil)
	if result != SQLITE_OK {
		fmt.printf("Error preparing statement: %s\n", sqlite3_errmsg(db.handle))
		return {}, false
	}
	defer sqlite3_finalize(stmt)

	column_count := sqlite3_column_count(stmt)
	columns := make_slice([]string, column_count, context.allocator)
	for i in 0 ..< column_count {
		columns[i] = strings.clone(string(sqlite3_column_name(stmt, i)), context.allocator)
	}

	rows := make([dynamic][]SqlValue, context.allocator)

	for {
		step_result := sqlite3_step(stmt)
		if step_result == SQLITE_ROW {
			row := make_slice([]SqlValue, column_count, context.allocator)
			for i in 0 ..< column_count {
				col_type := sqlite3_column_type(stmt, i)
				switch col_type {
				case SQLITE_INTEGER: row[i] = i64(sqlite3_column_int(stmt, i))
				case SQLITE_FLOAT: row[i] = f64(sqlite3_column_double(stmt, i))
				case SQLITE_TEXT:
					row[i] = strings.clone(string(sqlite3_column_text(stmt, i)), context.allocator)
				case SQLITE_BLOB:
					blob_ptr := sqlite3_column_blob(stmt, i)
					blob_size := sqlite3_column_bytes(stmt, i)
					if blob_ptr != nil && blob_size > 0 {
						blob_data := make([]byte, blob_size, context.allocator)
						mem.copy(raw_data(blob_data), blob_ptr, int(blob_size))
						row[i] = blob_data
					} else {
						row[i] = nil
					}
				case SQLITE_NULL: row[i] = nil
				case: // Unknown type, treat as NULL
						row[i] = nil
				}
			}
			append(&rows, row)
		} else if step_result == SQLITE_DONE {
			break
		} else {
			fmt.printf("Error executing query: %s\n", sqlite3_errmsg(db.handle))
			return {}, false
		}
	}

	return QueryResult{columns = columns, rows = rows[:]}, true
}

cleanup_result :: proc(result: ^QueryResult) {
	for row in result.rows {
		for cell in row {
			switch v in cell {
			case string: delete(v)
			case []byte: delete(v)
			case i64, f64:
			// No cleanup needed
			}
		}
		delete(row)
	}
	delete(result.rows)
	for col in result.columns {
		delete(col)
	}
	delete(result.columns)
}
