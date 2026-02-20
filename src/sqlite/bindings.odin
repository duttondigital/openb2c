#+private
package sqlite

import "core:c"

foreign import sqlite3 "system:sqlite3"

SQLITE_OK :: 0
SQLITE_ROW :: 100
SQLITE_DONE :: 101

SQLITE_INTEGER :: 1
SQLITE_FLOAT :: 2
SQLITE_TEXT :: 3
SQLITE_BLOB :: 4
SQLITE_NULL :: 5

sqlite3_db :: rawptr
sqlite3_stmt :: rawptr

@(default_calling_convention = "c")
foreign sqlite3 {
	sqlite3_open :: proc(filename: cstring, ppDb: ^sqlite3_db) -> c.int ---
	sqlite3_close :: proc(db: sqlite3_db) -> c.int ---
	sqlite3_prepare_v2 :: proc(db: sqlite3_db, zSql: cstring, nByte: c.int, ppStmt: ^sqlite3_stmt, pzTail: ^cstring) -> c.int ---
	sqlite3_step :: proc(pStmt: sqlite3_stmt) -> c.int ---
	sqlite3_finalize :: proc(pStmt: sqlite3_stmt) -> c.int ---
	sqlite3_column_text :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> cstring ---
	sqlite3_column_int :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> c.int ---
	sqlite3_column_double :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> c.double ---
	sqlite3_column_blob :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> rawptr ---
	sqlite3_column_bytes :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> c.int ---
	sqlite3_column_type :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> c.int ---
	sqlite3_column_count :: proc(pStmt: sqlite3_stmt) -> c.int ---
	sqlite3_column_name :: proc(pStmt: sqlite3_stmt, iCol: c.int) -> cstring ---
	sqlite3_errmsg :: proc(db: sqlite3_db) -> cstring ---
}
