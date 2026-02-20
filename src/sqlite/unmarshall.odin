#+private
package sqlite

import "base:intrinsics"
import "core:reflect"
import "core:strings"
import "core:testing"

Unmarshall_Error :: enum {
	Unsupported_Type,
	Non_Nullable,
	Type_Mismatch,
}

unmarshall :: proc(
	result: QueryResult,
	dst: ^[dynamic]$T,
) -> Unmarshall_Error where intrinsics.type_is_struct(T) {
	T_type_info := reflect.type_info_base(type_info_of(T))
	struct_info := T_type_info.variant.(reflect.Type_Info_Struct)

	// Build column name to index map (case-insensitive)
	column_map := make(map[string]int, len(result.columns), context.temp_allocator)
	for col_name, idx in result.columns {
		column_map[strings.to_lower(col_name, context.temp_allocator)] = idx
	}

	for row in result.rows {
		instance: T

		for i in 0 ..< struct_info.field_count {
			name := struct_info.names[i]
			col_idx := column_map[strings.to_lower(name, context.temp_allocator)] or_continue

			field_offset := struct_info.offsets[i]
			field_ptr := rawptr(uintptr(&instance) + field_offset)
			field_type := struct_info.types[i].id

			// TODO: do this at compile time in the where clause
			switch field_type {
			case i64, f64, string, []byte, Maybe(i64), Maybe(f64), Maybe(string), Maybe([]byte):
			case: return .Unsupported_Type
			}

			value := row[col_idx]
			switch v in value {
			case i64: switch field_type {
					case i64: (^i64)(field_ptr)^ = v
					case Maybe(i64): (^Maybe(i64))(field_ptr)^ = v
					case: return .Type_Mismatch
					}
			case f64: switch field_type {
					case f64: (^f64)(field_ptr)^ = v
					case Maybe(f64): (^Maybe(f64))(field_ptr)^ = v
					case: return .Type_Mismatch
					}
			case string: switch field_type {
					case string: (^string)(field_ptr)^ = v
					case Maybe(string): (^Maybe(string))(field_ptr)^ = v
					case: return .Type_Mismatch
					}
			case []byte: switch field_type {
					case []byte: (^[]byte)(field_ptr)^ = v
					case Maybe([]byte): (^Maybe([]byte))(field_ptr)^ = v
					case: return .Type_Mismatch
					}
			case nil: switch field_type {
					case i64, f64, string, []byte: return .Non_Nullable
					case Maybe(i64): (^Maybe(i64))(field_ptr)^ = nil
					case Maybe(f64): (^Maybe(f64))(field_ptr)^ = nil
					case Maybe(string): (^Maybe(string))(field_ptr)^ = nil
					case Maybe([]byte): (^Maybe([]byte))(field_ptr)^ = nil
					}
			}

		}

		append(dst, instance)
	}

	return nil
}

@(test)
test_unmarshall :: proc(t: ^testing.T) {
	User :: struct {
		id:   i64,
		name: string,
	}

	result := QueryResult {
		columns = {"id", "name"},
		rows    = {{1, "louis"}},
	}

	users: [dynamic]User
	defer delete(users)

	err := unmarshall(result, &users)
	testing.expect_value(t, users[0].id, 1)
	testing.expect_value(t, users[0].name, "louis")
}

@(test)
test_unmarshall_error :: proc(t: ^testing.T) {
	User :: struct {
		id:   i64,
		name: string,
	}

	result := QueryResult {
		columns = {"id", "name"},
		rows    = {{1, nil}},
	}

	users: [dynamic]User
	defer delete(users)

	err := unmarshall(result, &users)
	testing.expect_value(t, err, Unmarshall_Error.Non_Nullable)
}

@(test)
test_unmarshall_nullable :: proc(t: ^testing.T) {
	User :: struct {
		id:   i64,
		name: Maybe(string),
	}

	result := QueryResult {
		columns = {"id", "name"},
		rows    = {{1, nil}},
	}

	users: [dynamic]User
	defer delete(users)

	err := unmarshall(result, &users)
	testing.expect_value(t, err, nil)
	testing.expect_value(t, users[0].id, 1)
	testing.expect_value(t, users[0].name, nil)
}
