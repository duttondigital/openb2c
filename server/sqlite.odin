package main

import "core:c"
import "core:fmt"
import "core:strings"

foreign import sqlite3 "system:sqlite3"

SQLITE_OK :: 0
SQLITE_ROW :: 100
SQLITE_DONE :: 101

sqlite3_db :: rawptr
sqlite3_stmt :: rawptr

@(default_calling_convention="c")
foreign sqlite3 {
    sqlite3_open :: proc(filename: cstring, ppDb: ^sqlite3_db) -> c.int ---
    sqlite3_close :: proc(db: sqlite3_db) -> c.int ---
    sqlite3_prepare_v2 :: proc(db: sqlite3_db, zSql: cstring, nByte: c.int, ppStmt: ^sqlite3_stmt, pzTail: ^cstring) -> c.int ---
    sqlite3_step :: proc(pStmt: sqlite3_stmt) -> c.int ---
    sqlite3_finalize :: proc(pStmt: sqlite3_stmt) -> c.int ---
    sqlite3_column_text :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> cstring ---
    sqlite3_column_int :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> c.int ---
    sqlite3_errmsg :: proc(db: sqlite3_db) -> cstring ---
}

Database :: struct {
    handle: sqlite3_db,
}

open_database :: proc(filename: string) -> (Database, bool) {
    db := Database{}
    filename_cstr := strings.clone_to_cstring(filename, context.temp_allocator)
    
    result := sqlite3_open(filename_cstr, &db.handle)
    if result != SQLITE_OK {
        fmt.printf("Error opening database: %s\n", sqlite3_errmsg(db.handle))
        return db, false
    }
    
    return db, true
}

close_database :: proc(db: ^Database) {
    if db.handle != nil {
        sqlite3_close(db.handle)
        db.handle = nil
    }
}

get_productions_from_db :: proc(db: ^Database) -> []Production {
    query := "SELECT id, title, composer, conductor, director, venue, premiere_date, run_start_date, run_end_date, \"cast\", notes FROM production ORDER BY run_start_date DESC"
    query_cstr := strings.clone_to_cstring(query, context.temp_allocator)
    
    stmt: sqlite3_stmt
    result := sqlite3_prepare_v2(db.handle, query_cstr, -1, &stmt, nil)
    if result != SQLITE_OK {
        fmt.printf("Error preparing statement: %s\n", sqlite3_errmsg(db.handle))
        return nil
    }
    defer sqlite3_finalize(stmt)
    
    productions := make([dynamic]Production, context.temp_allocator)
    
    for {
        step_result := sqlite3_step(stmt)
        if step_result == SQLITE_ROW {
            production := Production{
                id = int(sqlite3_column_int(stmt, 0)),
                title = string(sqlite3_column_text(stmt, 1)),
                description = fmt.tprintf("%s by %s", string(sqlite3_column_text(stmt, 1)), string(sqlite3_column_text(stmt, 2))),
                date = string(sqlite3_column_text(stmt, 7)) != "" ? string(sqlite3_column_text(stmt, 7)) : string(sqlite3_column_text(stmt, 6)),
                status = get_production_status(string(sqlite3_column_text(stmt, 7)), string(sqlite3_column_text(stmt, 8))),
            }
            append(&productions, production)
        } else if step_result == SQLITE_DONE {
            break
        } else {
            fmt.printf("Error executing query: %s\n", sqlite3_errmsg(db.handle))
            break
        }
    }
    
    return productions[:]
}

get_production_status :: proc(start_date: string, end_date: string) -> string {
    return "upcoming"
}
