package customer

import "../../server/http"
import "../../sqlite"
import "core:encoding/json"
import "core:fmt"
import "core:strconv"
import "core:strings"

// GET /api/customers - list all customers
list_customers :: proc(req: ^http.Request, db: ^sqlite.Database) -> http.Response {
	customers: [dynamic]Customer
	err := sqlite.query(
		db,
		&customers,
		"SELECT id, name, email, phone, created_at FROM customer ORDER BY id",
	)
	if err != nil {
		return http.server_error()
	}
	defer {
		for c in customers {
			delete(c.name)
			delete(c.email)
			delete(c.phone)
			delete(c.created_at)
		}
		delete(customers)
	}

	json_bytes, marshal_err := json.marshal(customers[:], allocator = context.temp_allocator)
	if marshal_err != nil {
		return http.server_error()
	}

	return http.ok(string(json_bytes))
}

// GET /api/customers/:id - get single customer
get_customer :: proc(req: ^http.Request, db: ^sqlite.Database) -> http.Response {
	id_str, ok := req.params["id"]
	if !ok {
		return http.bad_request(`{"error":"missing id"}`)
	}

	id, parse_ok := strconv.parse_int(id_str)
	if !parse_ok {
		return http.bad_request(`{"error":"invalid id"}`)
	}

	customers: [dynamic]Customer
	query := fmt.tprintf(
		"SELECT id, name, email, phone, created_at FROM customer WHERE id = %d",
		id,
	)
	err := sqlite.query(db, &customers, query)
	if err != nil {
		return http.server_error()
	}
	defer {
		for c in customers {
			delete(c.name)
			delete(c.email)
			delete(c.phone)
			delete(c.created_at)
		}
		delete(customers)
	}

	if len(customers) == 0 {
		return http.not_found(`{"error":"customer not found"}`)
	}

	json_bytes, marshal_err := json.marshal(customers[0], allocator = context.temp_allocator)
	if marshal_err != nil {
		return http.server_error()
	}

	return http.ok(string(json_bytes))
}

// POST /api/customers - create customer
create_customer :: proc(req: ^http.Request, db: ^sqlite.Database) -> http.Response {
	if len(req.body) == 0 {
		return http.bad_request(`{"error":"empty body"}`)
	}

	input: Customer_Input
	unmarshal_err := json.unmarshal(transmute([]u8)req.body, &input)
	if unmarshal_err != nil {
		return http.bad_request(`{"error":"invalid json"}`)
	}
	defer {
		delete(input.name)
		delete(input.email)
		delete(input.phone)
	}

	if len(input.name) == 0 {
		return http.bad_request(`{"error":"name is required"}`)
	}

	// Insert into database
	query := fmt.tprintf(
		"INSERT INTO customer (name, email, phone) VALUES ('%s', '%s', '%s')",
		escape_sql(input.name),
		escape_sql(input.email),
		escape_sql(input.phone),
	)

	_, exec_ok := sqlite.exec(db, query)
	if !exec_ok {
		return http.server_error()
	}

	// Get last inserted ID
	result, id_ok := sqlite.exec(db, "SELECT last_insert_rowid()")
	if !id_ok {
		return http.server_error()
	}
	defer sqlite.cleanup_result(&result)

	id: i64 = 0
	if len(result.rows) > 0 && len(result.rows[0]) > 0 {
		if val, ok := result.rows[0][0].(i64); ok {
			id = val
		}
	}

	resp_obj := struct {
		id: i64 `json:"id"`,
	} {
		id = id,
	}
	json_bytes, _ := json.marshal(resp_obj, allocator = context.temp_allocator)
	return http.created(string(json_bytes))
}

// DELETE /api/customers/:id - delete customer
delete_customer :: proc(req: ^http.Request, db: ^sqlite.Database) -> http.Response {
	id_str, ok := req.params["id"]
	if !ok {
		return http.bad_request(`{"error":"missing id"}`)
	}

	id, parse_ok := strconv.parse_int(id_str)
	if !parse_ok {
		return http.bad_request(`{"error":"invalid id"}`)
	}

	// Check if customer exists
	check_query := fmt.tprintf("SELECT id FROM customer WHERE id = %d", id)
	check_result, check_ok := sqlite.exec(db, check_query)
	if !check_ok {
		return http.server_error()
	}
	defer sqlite.cleanup_result(&check_result)

	if len(check_result.rows) == 0 {
		return http.not_found(`{"error":"customer not found"}`)
	}

	// Delete
	query := fmt.tprintf("DELETE FROM customer WHERE id = %d", id)
	_, exec_ok := sqlite.exec(db, query)
	if !exec_ok {
		return http.server_error()
	}

	return http.ok(`{"deleted":true}`)
}

// PUT /api/customers/:id - update customer
update_customer :: proc(req: ^http.Request, db: ^sqlite.Database) -> http.Response {
	id_str, ok := req.params["id"]
	if !ok {
		return http.bad_request(`{"error":"missing id"}`)
	}

	id, parse_ok := strconv.parse_int(id_str)
	if !parse_ok {
		return http.bad_request(`{"error":"invalid id"}`)
	}

	// Check if customer exists
	check_query := fmt.tprintf("SELECT id FROM customer WHERE id = %d", id)
	check_result, check_ok := sqlite.exec(db, check_query)
	if !check_ok {
		return http.server_error()
	}
	defer sqlite.cleanup_result(&check_result)

	if len(check_result.rows) == 0 {
		return http.not_found(`{"error":"customer not found"}`)
	}

	if len(req.body) == 0 {
		return http.bad_request(`{"error":"empty body"}`)
	}

	input: Customer_Input
	unmarshal_err := json.unmarshal(transmute([]u8)req.body, &input)
	if unmarshal_err != nil {
		return http.bad_request(`{"error":"invalid json"}`)
	}
	defer {
		delete(input.name)
		delete(input.email)
		delete(input.phone)
	}

	if len(input.name) == 0 {
		return http.bad_request(`{"error":"name is required"}`)
	}

	// Update
	query := fmt.tprintf(
		"UPDATE customer SET name='%s', email='%s', phone='%s' WHERE id=%d",
		escape_sql(input.name),
		escape_sql(input.email),
		escape_sql(input.phone),
		id,
	)

	_, exec_ok := sqlite.exec(db, query)
	if !exec_ok {
		return http.server_error()
	}

	resp_obj := struct {
		id: i64 `json:"id"`,
	} {
		id = i64(id),
	}
	json_bytes, _ := json.marshal(resp_obj, allocator = context.temp_allocator)
	return http.ok(string(json_bytes))
}

// Escape string for SQL (prevent injection)
// Uses temp allocator - result valid until end of frame
escape_sql :: proc(s: string) -> string {
	result, _ := strings.replace_all(s, "'", "''", context.temp_allocator)
	return result
}
