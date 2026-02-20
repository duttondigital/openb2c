package core

import "../server/http"
import "../sqlite"
import "core:fmt"
import "core:os"
import "core:strings"

// Module defines the contract for composable business modules.
Module :: struct {
	name:   string, // unique identifier e.g. "customer"
	deps:   []string, // names of required modules
	schema: string, // SQL schema (CREATE TABLE statements)
	init:   proc(db: ^sqlite.Database) -> bool, // module initialization
	routes: []Route, // HTTP routes this module handles
}

// Route defines an HTTP endpoint handled by a module.
Route :: struct {
	method:  http.Method,
	path:    string,
	handler: proc(req: ^http.Request, db: ^sqlite.Database) -> http.Response,
}

// Registry holds all registered modules.
Registry :: struct {
	modules: map[string]^Module,
}

// create_registry initializes a new module registry.
create_registry :: proc() -> Registry {
	return Registry{modules = make(map[string]^Module)}
}

// destroy_registry frees registry resources.
destroy_registry :: proc(registry: ^Registry) {
	delete(registry.modules)
}

// register adds a module to the registry.
// Returns false if a module with the same name already exists.
register :: proc(registry: ^Registry, mod: ^Module) -> bool {
	if mod.name in registry.modules {
		fmt.printf("Module '%s' already registered\n", mod.name)
		return false
	}
	registry.modules[mod.name] = mod
	return true
}

// resolve_deps performs topological sort to determine initialization order.
// Returns modules in dependency order, or false if there's a cycle or missing dep.
resolve_deps :: proc(registry: ^Registry) -> ([]^Module, bool) {
	// Build in-degree map and adjacency list
	in_degree := make(map[string]int)
	defer delete(in_degree)

	// Initialize all modules with 0 in-degree
	for name in registry.modules {
		in_degree[name] = 0
	}

	// Count incoming edges (dependencies)
	for name, mod in registry.modules {
		for dep in mod.deps {
			if dep not_in registry.modules {
				fmt.printf("Module '%s' depends on unknown module '%s'\n", name, dep)
				return nil, false
			}
			in_degree[name] += 1
		}
	}

	// Queue modules with no dependencies
	queue := make([dynamic]string)
	defer delete(queue)

	for name, degree in in_degree {
		if degree == 0 {
			append(&queue, name)
		}
	}

	// Process queue (Kahn's algorithm)
	result := make([dynamic]^Module)
	processed := 0

	for len(queue) > 0 {
		// Pop from front
		name := queue[0]
		ordered_remove(&queue, 0)

		mod := registry.modules[name]
		append(&result, mod)
		processed += 1

		// Reduce in-degree for modules that depend on this one
		for other_name, other_mod in registry.modules {
			for dep in other_mod.deps {
				if dep == name {
					in_degree[other_name] -= 1
					if in_degree[other_name] == 0 {
						append(&queue, other_name)
					}
				}
			}
		}
	}

	if processed != len(registry.modules) {
		fmt.println("Circular dependency detected in modules")
		delete(result)
		return nil, false
	}

	return result[:], true
}

// init_all initializes all modules in dependency order.
// Runs schema migrations and calls each module's init proc.
init_all :: proc(registry: ^Registry, db: ^sqlite.Database) -> bool {
	// Ensure _modules tracking table exists
	if !ensure_modules_table(db) {
		return false
	}

	// Get modules in dependency order
	ordered, ok := resolve_deps(registry)
	if !ok {
		return false
	}
	defer delete(ordered)

	// Initialize each module
	for mod in ordered {
		if !init_module(mod, db) {
			fmt.printf("Failed to initialize module '%s'\n", mod.name)
			return false
		}
	}

	return true
}

// init_module applies schema and runs init for a single module.
init_module :: proc(mod: ^Module, db: ^sqlite.Database) -> bool {
	// Check if already applied
	if is_module_applied(db, mod.name) {
		fmt.printf("Module '%s' already applied, skipping schema\n", mod.name)
	} else {
		// Apply schema
		if len(mod.schema) > 0 {
			if !apply_schema(db, mod.schema) {
				return false
			}
		}
		// Record as applied
		if !record_module(db, mod.name) {
			return false
		}
		fmt.printf("Applied schema for module '%s'\n", mod.name)
	}

	// Run module init if provided
	if mod.init != nil {
		if !mod.init(db) {
			return false
		}
	}

	return true
}

// ensure_modules_table creates the _modules tracking table if it doesn't exist.
ensure_modules_table :: proc(db: ^sqlite.Database) -> bool {
	SCHEMA :: `
		CREATE TABLE IF NOT EXISTS _modules (
			name TEXT PRIMARY KEY,
			applied_at TEXT DEFAULT CURRENT_TIMESTAMP
		);
	`
	_, ok := sqlite.exec(db, SCHEMA)
	return ok
}

// is_module_applied checks if a module's schema has been applied.
is_module_applied :: proc(db: ^sqlite.Database, name: string) -> bool {
	query := fmt.tprintf("SELECT 1 FROM _modules WHERE name = '%s'", name)
	result, ok := sqlite.exec(db, query)
	if !ok {
		return false
	}
	defer sqlite.cleanup_result(&result)
	return len(result.rows) > 0
}

// record_module marks a module as applied in the _modules table.
record_module :: proc(db: ^sqlite.Database, name: string) -> bool {
	query := fmt.tprintf("INSERT INTO _modules (name) VALUES ('%s')", name)
	_, ok := sqlite.exec(db, query)
	return ok
}

// apply_schema executes SQL schema statements.
apply_schema :: proc(db: ^sqlite.Database, schema: string) -> bool {
	// Split on semicolons and execute each statement
	statements := strings.split(schema, ";")
	defer delete(statements)

	for stmt in statements {
		trimmed := strings.trim_space(stmt)
		if len(trimmed) == 0 {
			continue
		}
		_, ok := sqlite.exec(db, trimmed)
		if !ok {
			fmt.printf("Failed to execute schema: %s\n", trimmed)
			return false
		}
	}
	return true
}

// get_all_routes collects routes from all registered modules.
get_all_routes :: proc(registry: ^Registry) -> []Route {
	routes := make([dynamic]Route)
	for _, mod in registry.modules {
		for route in mod.routes {
			append(&routes, route)
		}
	}
	return routes[:]
}
