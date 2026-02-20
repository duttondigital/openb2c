package http

import "core:net"
import "core:strings"

Request :: struct {
	method: string,
	path:   string,
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

	return {method = first_line_parts[0], path = first_line_parts[1]}
}
