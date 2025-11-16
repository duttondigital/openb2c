package main

import "core:fmt"
import "core:strings"
import "core:os"
import "core:net"

handle_request :: proc(client: net.TCP_Socket) {
    buffer: [4096]byte
    bytes_read, read_err := net.recv_tcp(client, buffer[:])
    if read_err != nil {
        fmt.printf("Failed to read from client: %v\n", read_err)
        return
    }

    request := string(buffer[:bytes_read])
    
    // Parse HTTP method and path
    lines := strings.split_lines(request)
    if len(lines) == 0 {
        return
    }
    
    first_line_parts := strings.split(lines[0], " ")
    if len(first_line_parts) < 3 {
        return
    }
    
    method := first_line_parts[0]
    path := first_line_parts[1]
    
    fmt.printf("%s %s\n", method, path)

    // Serve HTML for all requests
    response := fmt.tprintf(
        "HTTP/1.1 200 OK\r\n" +
        "Content-Type: text/html; charset=utf-8\r\n" +
        "Content-Length: %d\r\n" +
        "Connection: close\r\n" +
        "\r\n" +
        "%s",
        len(HTML_CONTENT),
        HTML_CONTENT,
    )

    net.send_tcp(client, transmute([]byte)response)
}
