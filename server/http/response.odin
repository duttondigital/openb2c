package http

import "core:net"
import "core:fmt"

Status :: enum {
  Ok = 200,
  Not_Found = 404
}

Response :: struct {}

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
