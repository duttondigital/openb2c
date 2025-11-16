package main

import "core:fmt"
import "core:net"

LOCALHOST :: net.IP4_Address{127, 0, 0, 1}

main :: proc() {
    endpoint := net.Endpoint{
        address = LOCALHOST,
        port = 3000,
    }

    socket, socket_err := net.listen_tcp(endpoint)
    if socket_err != nil {
        fmt.printf("Failed to create socket: %v\n", socket_err)
        return
    }
    defer net.close(socket)

    fmt.printf("Server running on http://localhost:%d\n", endpoint.port)

    for {
        client, _, accept_err := net.accept_tcp(socket)
        if accept_err != nil {
            fmt.printf("Failed to accept connection: %v\n", accept_err)
            continue
        }

        handle_request(client)
        net.close(client)
    }
}


