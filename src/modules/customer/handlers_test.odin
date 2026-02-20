#+private
package customer

import "../../server/http"
import "../../sqlite"
import "core:encoding/json"
import "core:testing"

// Helper to set up test database with customer table
setup_test_db :: proc() -> (sqlite.Database, bool) {
	db, ok := sqlite.open(":memory:")
	if !ok {
		return db, false
	}

	// Create customer table
	_, exec_ok := sqlite.exec(&db, SCHEMA)
	if !exec_ok {
		sqlite.close(&db)
		return db, false
	}

	return db, true
}

@(test)
test_list_customers_empty :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	req := http.Request {
		method = .GET,
		path   = "/api/customers",
	}
	resp := list_customers(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Ok)
	testing.expect_value(t, resp.body, "[]")
}

@(test)
test_list_customers_with_data :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	// Insert test data
	_, insert_ok := sqlite.exec(
		&db,
		`INSERT INTO customer (name, email, phone) VALUES ('Alice', 'alice@test.com', '123')`,
	)
	testing.expect(t, insert_ok, "Failed to insert test data")

	req := http.Request {
		method = .GET,
		path   = "/api/customers",
	}
	resp := list_customers(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Ok)

	// Verify JSON can be parsed
	customers: [dynamic]Customer
	defer {
		for c in customers {
			delete(c.name)
			delete(c.email)
			delete(c.phone)
			delete(c.created_at)
		}
		delete(customers)
	}
	err := json.unmarshal(transmute([]u8)resp.body, &customers)
	testing.expect(t, err == nil, "Response should be valid JSON")
	testing.expect_value(t, len(customers), 1)
	testing.expect_value(t, customers[0].name, "Alice")
}

@(test)
test_get_customer_found :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	// Insert test data
	_, insert_ok := sqlite.exec(
		&db,
		`INSERT INTO customer (name, email, phone) VALUES ('Bob', 'bob@test.com', '456')`,
	)
	testing.expect(t, insert_ok, "Failed to insert test data")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "1"

	req := http.Request {
		method = .GET,
		path   = "/api/customers/1",
		params = params,
	}
	resp := get_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Ok)

	// Verify JSON structure
	customer: Customer
	defer {
		delete(customer.name)
		delete(customer.email)
		delete(customer.phone)
		delete(customer.created_at)
	}
	err := json.unmarshal(transmute([]u8)resp.body, &customer)
	testing.expect(t, err == nil, "Response should be valid JSON")
	testing.expect_value(t, customer.name, "Bob")
}

@(test)
test_get_customer_not_found :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "999"

	req := http.Request {
		method = .GET,
		path   = "/api/customers/999",
		params = params,
	}
	resp := get_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Not_Found)
}

@(test)
test_get_customer_invalid_id :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "abc"

	req := http.Request {
		method = .GET,
		path   = "/api/customers/abc",
		params = params,
	}
	resp := get_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Bad_Request)
}

@(test)
test_get_customer_missing_id :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	req := http.Request {
		method = .GET,
		path   = "/api/customers/1",
	}
	resp := get_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Bad_Request)
}

@(test)
test_create_customer_success :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	req := http.Request {
		method = .POST,
		path   = "/api/customers",
		body   = `{"name":"Charlie","email":"charlie@test.com","phone":"789"}`,
	}
	resp := create_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Created)

	// Verify response contains id
	result: struct {
		id: i64 `json:"id"`,
	}
	err := json.unmarshal(transmute([]u8)resp.body, &result)
	testing.expect(t, err == nil, "Response should be valid JSON")
	testing.expect_value(t, result.id, i64(1))

	// Verify customer was created in DB
	customers: [dynamic]Customer
	defer {
		for c in customers {
			delete(c.name)
			delete(c.email)
			delete(c.phone)
			delete(c.created_at)
		}
		delete(customers)
	}
	sqlite.query(&db, &customers, "SELECT id, name, email, phone, created_at FROM customer")
	testing.expect_value(t, len(customers), 1)
	testing.expect_value(t, customers[0].name, "Charlie")
	testing.expect_value(t, customers[0].email, "charlie@test.com")
}

@(test)
test_create_customer_missing_name :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	req := http.Request {
		method = .POST,
		path   = "/api/customers",
		body   = `{"email":"test@test.com"}`,
	}
	resp := create_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Bad_Request)
}

@(test)
test_create_customer_empty_body :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	req := http.Request {
		method = .POST,
		path   = "/api/customers",
		body   = "",
	}
	resp := create_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Bad_Request)
}

@(test)
test_create_customer_invalid_json :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	req := http.Request {
		method = .POST,
		path   = "/api/customers",
		body   = `{invalid json}`,
	}
	resp := create_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Bad_Request)
}

@(test)
test_delete_customer_success :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	// Insert test data
	_, insert_ok := sqlite.exec(
		&db,
		`INSERT INTO customer (name, email) VALUES ('ToDelete', 'delete@test.com')`,
	)
	testing.expect(t, insert_ok, "Failed to insert test data")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "1"

	req := http.Request {
		method = .DELETE,
		path   = "/api/customers/1",
		params = params,
	}
	resp := delete_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Ok)

	// Verify customer was deleted
	result, _ := sqlite.exec(&db, "SELECT COUNT(*) FROM customer")
	defer sqlite.cleanup_result(&result)
	count, _ := result.rows[0][0].(i64)
	testing.expect_value(t, count, i64(0))
}

@(test)
test_delete_customer_not_found :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "999"

	req := http.Request {
		method = .DELETE,
		path   = "/api/customers/999",
		params = params,
	}
	resp := delete_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Not_Found)
}

@(test)
test_update_customer_success :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	// Insert test data
	_, insert_ok := sqlite.exec(
		&db,
		`INSERT INTO customer (name, email) VALUES ('Original', 'original@test.com')`,
	)
	testing.expect(t, insert_ok, "Failed to insert test data")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "1"

	req := http.Request {
		method = .PUT,
		path   = "/api/customers/1",
		params = params,
		body   = `{"name":"Updated","email":"updated@test.com","phone":"999"}`,
	}
	resp := update_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Ok)

	// Verify customer was updated
	customers: [dynamic]Customer
	defer {
		for c in customers {
			delete(c.name)
			delete(c.email)
			delete(c.phone)
			delete(c.created_at)
		}
		delete(customers)
	}
	sqlite.query(
		&db,
		&customers,
		"SELECT id, name, email, phone, created_at FROM customer WHERE id = 1",
	)
	testing.expect_value(t, len(customers), 1)
	testing.expect_value(t, customers[0].name, "Updated")
	testing.expect_value(t, customers[0].email, "updated@test.com")
}

@(test)
test_update_customer_not_found :: proc(t: ^testing.T) {
	db, ok := setup_test_db()
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to set up test database")

	params := make(map[string]string)
	defer delete(params)
	params["id"] = "999"

	req := http.Request {
		method = .PUT,
		path   = "/api/customers/999",
		params = params,
		body   = `{"name":"Test"}`,
	}
	resp := update_customer(&req, &db)

	testing.expect_value(t, resp.status, http.Status.Not_Found)
}

@(test)
test_escape_sql :: proc(t: ^testing.T) {
	// Test SQL injection prevention
	result := escape_sql("O'Brien")
	testing.expect_value(t, result, "O''Brien")

	result2 := escape_sql("test'; DROP TABLE customer; --")
	testing.expect_value(t, result2, "test''; DROP TABLE customer; --")
}
