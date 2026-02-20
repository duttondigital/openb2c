package http

import "core:fmt"
import "core:net"

Status :: enum {
	Ok           = 200,
	Created      = 201,
	Bad_Request  = 400,
	Not_Found    = 404,
	Server_Error = 500,
}

Response :: struct {
	status:       Status,
	body:         string,
	content_type: string,
}

// Helper to create common responses
ok :: proc(body: string, content_type := "application/json") -> Response {
	return {status = .Ok, body = body, content_type = content_type}
}

created :: proc(body: string) -> Response {
	return {status = .Created, body = body, content_type = "application/json"}
}

not_found :: proc(body := `{"error": "not found"}`) -> Response {
	return {status = .Not_Found, body = body, content_type = "application/json"}
}

bad_request :: proc(body := `{"error": "bad request"}`) -> Response {
	return {status = .Bad_Request, body = body, content_type = "application/json"}
}

server_error :: proc(body := `{"error": "internal server error"}`) -> Response {
	return {status = .Server_Error, body = body, content_type = "application/json"}
}

send :: proc(client: net.TCP_Socket, body: string, content_type: string, status := Status.Ok) {
	response := fmt.tprintf(
		"HTTP/1.1 200 OK\r\n" +
		"Content-Type: %s; charset=utf-8\r\n" +
		"Content-Length: %d\r\n" +
		"Connection: close\r\n" +
		"\r\n" +
		"%s",
		content_type,
		len(body),
		body,
	)

	net.send_tcp(client, transmute([]byte)response)
}

// send_response sends a Response struct
send_response :: proc(client: net.TCP_Socket, resp: Response) {
	status_text: string
	switch resp.status {
	case .Ok: status_text = "OK"
	case .Created: status_text = "Created"
	case .Bad_Request: status_text = "Bad Request"
	case .Not_Found: status_text = "Not Found"
	case .Server_Error: status_text = "Internal Server Error"
	}

	response := fmt.tprintf(
		"HTTP/1.1 %d %s\r\n" +
		"Content-Type: %s; charset=utf-8\r\n" +
		"Content-Length: %d\r\n" +
		"Connection: close\r\n" +
		"\r\n" +
		"%s",
		int(resp.status),
		status_text,
		resp.content_type,
		len(resp.body),
		resp.body,
	)

	net.send_tcp(client, transmute([]byte)response)
}
