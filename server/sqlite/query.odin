package sqlite

import "core:strings"
import "core:fmt"

QueryResult :: struct {
    columns: []string,
    rows: [][]string,
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
    for i in 0..<column_count {
        columns[i] = strings.clone(string(sqlite3_column_name(stmt, i)), context.allocator)
    }
    
    rows := make([dynamic][]string, context.allocator)
    
    for {
        step_result := sqlite3_step(stmt)
        if step_result == SQLITE_ROW {
            row := make_slice([]string, column_count, context.allocator)
            for i in 0..<column_count {
                row[i] = strings.clone(string(sqlite3_column_text(stmt, i)), context.allocator)
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
