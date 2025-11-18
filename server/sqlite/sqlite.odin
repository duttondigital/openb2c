package sqlite

import "core:fmt"
import "core:strings"

Database :: struct {
    handle: sqlite3_db,
}

open :: proc(filename: string) -> (Database, bool) {
    db := Database{}
    filename_cstr := strings.clone_to_cstring(filename, context.temp_allocator)
    
    result := sqlite3_open(filename_cstr, &db.handle)
    if result != SQLITE_OK {
        fmt.printf("Error opening database: %s\n", sqlite3_errmsg(db.handle))
        return db, false
    }
    
    return db, true
}

close :: proc(db: ^Database) {
    if db.handle != nil {
        sqlite3_close(db.handle)
        db.handle = nil
    }
}
