#+private
package sqlite

import "core:testing"

User :: struct {
	id:   i64,
	name: string,
	age:  i64,
}

@(test)
test_query_basic :: proc(t: ^testing.T) {
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
		insert_query := `INSERT INTO users (name, age) VALUES
			('Alice', 30),
			('Bob', 25),
			('Charlie', 35)`


		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Query into struct array
	users: [dynamic]User
	defer {
		for user in users {
			delete(user.name)
		}
		delete(users)
	}

	err := query(&db, &users, "SELECT id, name, age FROM users ORDER BY age")
	testing.expect(t, err == nil)

	// Verify results
	testing.expect(t, len(users) == 3)

	testing.expect(t, users[0].name == "Bob")
	testing.expect(t, users[0].age == 25)

	testing.expect(t, users[1].name == "Alice")
	testing.expect(t, users[1].age == 30)

	testing.expect(t, users[2].name == "Charlie")
	testing.expect(t, users[2].age == 35)
}

@(test)
test_query_struct_empty_result :: proc(t: ^testing.T) {
	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create empty table
	{
		create_query := `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Query empty table
	users: [dynamic]User
	defer delete(users)

	err := query(&db, &users, "SELECT id, name, age FROM users")
	testing.expect(t, err == nil, "Query should succeed even with no results")
	testing.expect(t, len(users) == 0)
}

@(test)
test_query_single_row :: proc(t: ^testing.T) {
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

	// Query single row
	users: [dynamic]User
	defer {
		for user in users {
			delete(user.name)
		}
		delete(users)
	}

	err := query(&db, &users, "SELECT id, name, age FROM users WHERE name = 'Alice'")
	testing.expect(t, err == nil)
	testing.expect(t, len(users) == 1)

	if len(users) > 0 {
		testing.expect(t, users[0].name == "Alice")
		testing.expect(t, users[0].age == 30)
	}
}

@(test)
test_query_nullable_fields :: proc(t: ^testing.T) {
	Product :: struct {
		id:    i64,
		name:  string,
		price: Maybe(f64),
	}

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

	// Insert data with NULL and non-NULL values
	{
		insert_query := `INSERT INTO products (name, price) VALUES
			('Widget', 19.99),
			('Gadget', NULL),
			('Doohickey', 9.95)`


		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Query into struct with Maybe field
	products: [dynamic]Product
	defer {
		for product in products {
			delete(product.name)
		}
		delete(products)
	}

	err := query(&db, &products, "SELECT id, name, price FROM products ORDER BY id")
	testing.expect(t, err == nil)
	testing.expect(t, len(products) == 3)

	// Check first product (has price)
	testing.expect(t, products[0].name == "Widget")
	price0, ok0 := products[0].price.(f64)
	testing.expect(t, ok0)
	testing.expect_value(t, price0, 19.99)

	// Check second product (NULL price)
	testing.expect_value(t, products[1].name, "Gadget")
	testing.expect_value(t, products[1].price, nil)

	// Check third product (has price)
	testing.expect_value(t, products[2].name, "Doohickey")
	price2, ok2 := products[2].price.(f64)
	testing.expect(t, ok2)
	testing.expect_value(t, price2, 9.95)
}


@(test)
test_query_type_mismatch :: proc(t: ^testing.T) {
	BadUser :: struct {
		id:   string, // Wrong type - should be i64
		name: string,
		age:  i64,
	}

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

	// Try to query into struct with wrong type
	bad_users: [dynamic]BadUser
	defer delete(bad_users)

	err := query(&db, &bad_users, "SELECT id, name, age FROM users")
	testing.expect_value(t, err, Unmarshall_Error.Type_Mismatch)
}

@(test)
test_query_null_in_non_nullable :: proc(t: ^testing.T) {
	NonNullableProduct :: struct {
		id:    i64,
		name:  string,
		price: f64, // Non-nullable
	}

	db, ok := open(":memory:")
	defer close(&db)
	testing.expect(t, ok, "Failed to open in-memory database")

	// Create table
	{
		create_query := `CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)`
		result, success := exec(&db, create_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to create table")
	}

	// Insert data with NULL price
	{
		insert_query := `INSERT INTO products (name, price) VALUES ('Widget', NULL)`
		result, success := exec(&db, insert_query)
		defer cleanup_result(&result)
		testing.expect(t, success, "Failed to insert data")
	}

	// Try to query into struct with non-nullable field
	products: [dynamic]NonNullableProduct
	defer delete(products)

	err := query(&db, &products, "SELECT id, name, price FROM products")
	testing.expect_value(t, err, Unmarshall_Error.Non_Nullable)
}
