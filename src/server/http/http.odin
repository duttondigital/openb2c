package http

import "core:net"
import "core:strings"

Method :: enum {
	GET,
	POST,
	PUT,
	DELETE,
	PATCH,
}

Request :: struct {
	method:     Method,
	method_str: string,
	path:       string,
	body:       string,
	params:     map[string]string, // path parameters extracted from route
}

// The maximum number of bytes allowed in the HTTP request
Buffer_Size :: 4096

receive :: proc(client: net.TCP_Socket) -> Request {
	buffer: [Buffer_Size]byte
	bytes_read, read_err := net.recv_tcp(client, buffer[:])
	assert(read_err == nil)

	request := string(buffer[:bytes_read])

	// Parse HTTP method and path
	lines := strings.split_lines(request)
	assert(len(lines) != 0)

	first_line_parts := strings.split(lines[0], " ")
	assert(len(first_line_parts) >= 3)

	method_str := first_line_parts[0]
	method: Method
	switch method_str {
	case "GET": method = .GET
	case "POST": method = .POST
	case "PUT": method = .PUT
	case "DELETE": method = .DELETE
	case "PATCH": method = .PATCH
	case: method = .GET // default
	}

	// Clone path since buffer is local (use temp allocator for request lifetime)
	path := strings.clone(first_line_parts[1], context.temp_allocator)

	// Extract body (after blank line)
	body := ""
	for i in 1 ..< len(lines) {
		if strings.trim_space(lines[i]) == "" && i + 1 < len(lines) {
			// Join remaining lines as body
			body = strings.join(lines[i + 1:], "\n", context.temp_allocator)
			break
		}
	}

	return {method = method, method_str = method_str, path = path, body = body}
}
