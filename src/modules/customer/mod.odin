package customer

import "../../core"
import "../../server/http"
import "../../sqlite"

// Schema loaded from schema.sql
SCHEMA :: #load("schema.sql", string)

// Module definition
module := core.Module {
	name   = "customer",
	deps   = {},
	schema = SCHEMA,
	init   = init,
	routes = {
		{method = .GET, path = "/api/customers", handler = list_customers},
		{method = .GET, path = "/api/customers/:id", handler = get_customer},
		{method = .POST, path = "/api/customers", handler = create_customer},
		{method = .PUT, path = "/api/customers/:id", handler = update_customer},
		{method = .DELETE, path = "/api/customers/:id", handler = delete_customer},
	},
}

// Module initialization (called after schema is applied)
init :: proc(db: ^sqlite.Database) -> bool {
	// Any additional initialization logic
	return true
}

// get_module returns a pointer to this module's definition.
get_module :: proc() -> ^core.Module {
	return &module
}
