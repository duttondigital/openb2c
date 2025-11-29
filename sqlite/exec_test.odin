#+private
package sqlite

import "core:fmt"
import "core:testing"

@(test)
test_open_close_memory_database :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")
	testing.expect(t, db.handle != nil, "Database handle should not be nil")
}

@(test)
test_create_table :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	create_query := `CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		age INTEGER
	)`


	result, success := exec(&db, create_query)
	defer cleanup_result(&result)

	testing.expect(t, success, "Failed to create table")
}

@(test)
test_insert_data :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table
	create_query := `CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		age INTEGER
	)`


	result, success := exec(&db, create_query)
	defer cleanup_result(&result)
	testing.expect(t, success, "Failed to create table")

	// Insert data
	insert_query := `INSERT INTO users (name, age) VALUES ('Alice', 30)`
	insert_result, insert_success := exec(&db, insert_query)
	defer cleanup_result(&insert_result)
	testing.expect(t, insert_success, "Failed to insert data")
}

@(test)
test_query_data :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table
	{
		create_query := `CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			age INTEGER
		)`


		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert data
	{
		insert_query := `INSERT INTO users (name, age) VALUES ('Alice', 30)`
		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Query data
	{
		select_query := `SELECT name, age FROM users WHERE name = 'Alice'`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 1,
			fmt.tprintf("Expected 1 row, got %d", len(result.rows)),
		)
		testing.expect(
			t,
			len(result.columns) == 2,
			fmt.tprintf("Expected 2 columns, got %d", len(result.columns)),
		)
		testing.expect(
			t,
			result.columns[0] == "name",
			fmt.tprintf("Expected column 'name', got %q", result.columns[0]),
		)
		testing.expect(
			t,
			result.columns[1] == "age",
			fmt.tprintf("Expected column 'age', got %q", result.columns[1]),
		)
		testing.expect(
			t,
			result.rows[0][0].(string) == "Alice",
			fmt.tprintf("Expected name 'Alice', got %v", result.rows[0][0]),
		)
		testing.expect(
			t,
			result.rows[0][1].(i64) == 30,
			fmt.tprintf("Expected age 30, got %v", result.rows[0][1]),
		)
	}
}

@(test)
test_query_multiple_rows :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table
	{
		create_query := `CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			age INTEGER
		)`


		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert multiple rows
	{
		insert_query := `INSERT INTO users (name, age) VALUES
			('Alice', 30),
			('Bob', 25),
			('Charlie', 35)`


		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert multiple rows")
	}

	// Query all data
	{
		select_query := `SELECT name, age FROM users ORDER BY age`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 3,
			fmt.tprintf("Expected 3 rows, got %d", len(result.rows)),
		)

		// Check first row (Bob, age 25)
		testing.expect(
			t,
			result.rows[0][0].(string) == "Bob",
			fmt.tprintf("Expected 'Bob', got %v", result.rows[0][0]),
		)
		testing.expect(
			t,
			result.rows[0][1].(i64) == 25,
			fmt.tprintf("Expected 25, got %v", result.rows[0][1]),
		)

		// Check second row (Alice, age 30)
		testing.expect(
			t,
			result.rows[1][0].(string) == "Alice",
			fmt.tprintf("Expected 'Alice', got %v", result.rows[1][0]),
		)

		// Check third row (Charlie, age 35)
		testing.expect(
			t,
			result.rows[2][0].(string) == "Charlie",
			fmt.tprintf("Expected 'Charlie', got %v", result.rows[2][0]),
		)
	}
}

@(test)
test_query_empty_result :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table
	{
		create_query := `CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			age INTEGER
		)`


		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Query empty table
	{
		select_query := `SELECT name, age FROM users`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Query should succeed even with no results")
		testing.expect(
			t,
			len(result.rows) == 0,
			fmt.tprintf("Expected 0 rows, got %d", len(result.rows)),
		)
		testing.expect(
			t,
			len(result.columns) == 2,
			fmt.tprintf("Expected 2 columns, got %d", len(result.columns)),
		)
	}
}

@(test)
test_update_data :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create and populate table
	{
		create_query := `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	{
		insert_query := `INSERT INTO users (name, age) VALUES ('Alice', 30)`
		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Update data
	{
		update_query := `UPDATE users SET age = 31 WHERE name = 'Alice'`
		result, success := exec(&db, update_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to update data")
	}

	// Verify update
	{
		select_query := `SELECT age FROM users WHERE name = 'Alice'`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			result.rows[0][0].(i64) == 31,
			fmt.tprintf("Expected age 31, got %v", result.rows[0][0]),
		)
	}
}

@(test)
test_delete_data :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create and populate table
	{
		create_query := `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	{
		insert_query := `INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25)`
		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Delete one row
	{
		delete_query := `DELETE FROM users WHERE name = 'Alice'`
		result, success := exec(&db, delete_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to delete data")
	}

	// Verify deletion
	{
		select_query := `SELECT name FROM users`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 1,
			fmt.tprintf("Expected 1 row, got %d", len(result.rows)),
		)
		testing.expect(
			t,
			result.rows[0][0].(string) == "Bob",
			fmt.tprintf("Expected 'Bob', got %v", result.rows[0][0]),
		)
	}
}

@(test)
test_null_values :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table with nullable column
	{
		create_query := `CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert data with NULL value
	{
		insert_query := `INSERT INTO products (name, price) VALUES ('Widget', NULL)`
		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data with NULL")
	}

	// Query and verify NULL
	{
		select_query := `SELECT name, price FROM products`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 1,
			fmt.tprintf("Expected 1 row, got %d", len(result.rows)),
		)
		testing.expect(
			t,
			result.rows[0][0].(string) == "Widget",
			fmt.tprintf("Expected 'Widget', got %v", result.rows[0][0]),
		)
		testing.expect(
			t,
			result.rows[0][1] == nil,
			fmt.tprintf("Expected NULL, got %v", result.rows[0][1]),
		)
	}
}

@(test)
test_real_values :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table with REAL column
	{
		create_query := `CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert data with floating point values
	{
		insert_query := `INSERT INTO products (name, price) VALUES
			('Widget', 19.99),
			('Gadget', 29.50),
			('Doohickey', 9.95)`


		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Query and verify REAL values
	{
		select_query := `SELECT name, price FROM products ORDER BY price`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 3,
			fmt.tprintf("Expected 3 rows, got %d", len(result.rows)),
		)

		// Check first product (Doohickey, 9.95)
		testing.expect(
			t,
			result.rows[0][0].(string) == "Doohickey",
			fmt.tprintf("Expected 'Doohickey', got %v", result.rows[0][0]),
		)
		price0 := result.rows[0][1].(f64)
		testing.expect(
			t,
			price0 > 9.94 && price0 < 9.96,
			fmt.tprintf("Expected ~9.95, got %v", price0),
		)

		// Check second product (Widget, 19.99)
		testing.expect(
			t,
			result.rows[1][0].(string) == "Widget",
			fmt.tprintf("Expected 'Widget', got %v", result.rows[1][0]),
		)
		price1 := result.rows[1][1].(f64)
		testing.expect(
			t,
			price1 > 19.98 && price1 < 20.00,
			fmt.tprintf("Expected ~19.99, got %v", price1),
		)

		// Check third product (Gadget, 29.50)
		testing.expect(
			t,
			result.rows[2][0].(string) == "Gadget",
			fmt.tprintf("Expected 'Gadget', got %v", result.rows[2][0]),
		)
		price2 := result.rows[2][1].(f64)
		testing.expect(
			t,
			price2 > 29.49 && price2 < 29.51,
			fmt.tprintf("Expected ~29.50, got %v", price2),
		)
	}
}

@(test)
test_blob_values :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table with BLOB column
	{
		create_query := `CREATE TABLE files (id INTEGER PRIMARY KEY, name TEXT, data BLOB)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert binary data
	{
		insert_query := `INSERT INTO files (name, data) VALUES ('test.bin', X'48656C6C6F')`
		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert BLOB data")
	}

	// Query and verify BLOB
	{
		select_query := `SELECT name, data FROM files`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 1,
			fmt.tprintf("Expected 1 row, got %d", len(result.rows)),
		)
		testing.expect(
			t,
			result.rows[0][0].(string) == "test.bin",
			fmt.tprintf("Expected 'test.bin', got %v", result.rows[0][0]),
		)

		blob := result.rows[0][1].([]byte)
		expected_blob := []byte{0x48, 0x65, 0x6C, 0x6C, 0x6F} // "Hello" in hex
		testing.expect(
			t,
			len(blob) == len(expected_blob),
			fmt.tprintf("Expected BLOB length %d, got %d", len(expected_blob), len(blob)),
		)

		for i in 0 ..< len(expected_blob) {
			testing.expect(
				t,
				blob[i] == expected_blob[i],
				fmt.tprintf("BLOB byte %d: expected %02X, got %02X", i, expected_blob[i], blob[i]),
			)
		}
	}
}

@(test)
test_mixed_types :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table with all types
	{
		create_query := `CREATE TABLE mixed (
			id INTEGER PRIMARY KEY,
			text_col TEXT,
			int_col INTEGER,
			real_col REAL,
			blob_col BLOB,
			null_col TEXT
		)`


		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert mixed type data
	{
		insert_query := `INSERT INTO mixed (text_col, int_col, real_col, blob_col, null_col)
			VALUES ('hello', 42, 3.14159, X'DEADBEEF', NULL)`


		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert mixed data")
	}

	// Query and verify all types
	{
		select_query := `SELECT text_col, int_col, real_col, blob_col, null_col FROM mixed`
		result, success := exec(&db, select_query)
		defer cleanup_result(&result)

		testing.expect(t, success, "Failed to query data")
		testing.expect(
			t,
			len(result.rows) == 1,
			fmt.tprintf("Expected 1 row, got %d", len(result.rows)),
		)

		row := result.rows[0]

		// Check TEXT
		testing.expect(
			t,
			row[0].(string) == "hello",
			fmt.tprintf("Expected 'hello', got %v", row[0]),
		)

		// Check INTEGER
		testing.expect(t, row[1].(i64) == 42, fmt.tprintf("Expected 42, got %v", row[1]))

		// Check REAL
		pi := row[2].(f64)
		testing.expect(t, pi > 3.14 && pi < 3.15, fmt.tprintf("Expected ~3.14159, got %v", pi))

		// Check BLOB
		blob := row[3].([]byte)
		expected_blob := []byte{0xDE, 0xAD, 0xBE, 0xEF}
		testing.expect(t, len(blob) == 4, fmt.tprintf("Expected BLOB length 4, got %d", len(blob)))

		// Check NULL
		testing.expect(t, row[4] == nil, fmt.tprintf("Expected NULL, got %v", row[4]))
	}
}
