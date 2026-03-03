package main

import "../core"
import "../modules/customer"
import "core:fmt"
import "core:net"
import "core:strings"
import "http"

// Module registry (global for route matching)
registry: core.Registry

ADDRESS :: net.IP4_Address{127, 0, 0, 1}
PORT :: 3069

main :: proc() {
	// Initialize database
	if !init_database() {
		fmt.printf("Failed to initialize database\n")
		return
	}
	defer cleanup_database()

	// Initialize module registry
	registry = core.create_registry()
	defer core.destroy_registry(&registry)

	// Register modules
	core.register(&registry, customer.get_module())

	// Initialize all modules (applies schemas, runs init procs)
	if !core.init_all(&registry, &db) {
		fmt.printf("Failed to initialize modules\n")
		return
	}

	endpoint := net.Endpoint {
		address = ADDRESS,
		port    = PORT,
	}

	socket, socket_err := net.listen_tcp(endpoint)
	if socket_err != nil {
		fmt.printf("Failed to create socket: %v\n", socket_err)
		return
	}
	defer net.close(socket)

	fmt.printf("API server running on http://localhost:%d\n", endpoint.port)

	for {
		client, _, accept_err := net.accept_tcp(socket)
		if accept_err != nil {
			fmt.printf("Failed to accept connection: %v\n", accept_err)
			continue
		}

		req := http.receive(client)
		fmt.printf("%s %s\n", req.method_str, req.path)

		// Handle module routes (API)
		if handle_module_route(&req, client) {
			net.close(client)
			continue
		}

		// No matching route
		http.send(client, body = `{"error": "not found"}`, content_type = "application/json", status = .Not_Found)
		net.close(client)
	}
}

// handle_module_route checks if a request matches a module route and handles it.
handle_module_route :: proc(req: ^http.Request, client: net.TCP_Socket) -> bool {
	for _, mod in registry.modules {
		for route in mod.routes {
			params, matched := match_route(route.path, req.path)
			if route.method == req.method && matched {
				req.params = params
				resp := route.handler(req, &db)
				http.send_response(client, resp)
				cleanup_params(&req.params)
				return true
			}
			if params != nil {
				cleanup_params(&params)
			}
		}
	}
	return false
}

// cleanup_params frees cloned param strings and the map
cleanup_params :: proc(params: ^map[string]string) {
	for _, v in params {
		delete(v)
	}
	delete(params^)
}

// match_route checks if a request path matches a route pattern.
// Supports :param placeholders (e.g., /api/customers/:id matches /api/customers/123)
// Returns extracted parameters and whether the route matched.
match_route :: proc(pattern: string, path: string) -> (map[string]string, bool) {
	pattern_parts := strings.split(pattern, "/")
	defer delete(pattern_parts)
	path_parts := strings.split(path, "/")
	defer delete(path_parts)

	if len(pattern_parts) != len(path_parts) {
		return nil, false
	}

	params := make(map[string]string)

	for i in 0 ..< len(pattern_parts) {
		if strings.has_prefix(pattern_parts[i], ":") {
			// Extract parameter - clone the value since path_parts will be freed
			param_name := pattern_parts[i][1:]
			params[param_name] = strings.clone(path_parts[i])
		} else if pattern_parts[i] != path_parts[i] {
			// Clean up any params we already added
			for _, v in params {
				delete(v)
			}
			delete(params)
			return nil, false
		}
	}

	return params, true
}
