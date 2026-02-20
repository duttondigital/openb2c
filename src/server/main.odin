package main

import "../core"
import "../markdown"
import "../modules/customer"
import "core:fmt"
import "core:net"
import "core:os"
import "core:strings"
import "http"

// Module registry (global for route matching)
registry: core.Registry

ADDRESS :: net.IP4_Address{127, 0, 0, 1}
PORT :: 3069

generate_productions_html :: proc() -> string {
	productions := get_productions()

	productions_html := ""
	for production in productions {
		status_class := production.status == "upcoming" ? "upcoming" : "past"
		button_text := production.status == "upcoming" ? "Learn More" : "Read About"

		productions_html = fmt.tprintf(
			`%s
      <div class="card %s">
          <h3>%s</h3>
          <p class="date">%s</p>
          <p>%s</p>
          <a href="/contact" class="btn">%s</a>
      </div>`,
			productions_html,
			status_class,
			production.title,
			production.date,
			production.description,
			button_text,
		)
	}
	return productions_html
}

generate_news_html :: proc() -> string {
	news_items := get_news()

	news_html := ""
	for news_item in news_items {
		if len(news_item.slug) > 0 {
			// News item with slug - create link to full post
			news_html = fmt.tprintf(
				`%s
        <div class="card">
            <h3><a href="/news/%s">%s</a></h3>
            <p class="date">%s</p>
            <p>%s</p>
            <a href="/news/%s" class="btn">Read More</a>
        </div>`,
				news_html,
				news_item.slug,
				news_item.title,
				news_item.date,
				news_item.content,
				news_item.slug,
			)
		} else {
			// Regular news item without full post
			news_html = fmt.tprintf(
				`%s
        <div class="card">
            <h3>%s</h3>
            <p class="date">%s</p>
            <p>%s</p>
        </div>`,
				news_html,
				news_item.title,
				news_item.date,
				news_item.content,
			)
		}
	}
	return news_html
}

process_header_active_nav :: proc(header: string, active_page: string) -> string {
	result := header

	// Set all active states to empty first
	result, _ = strings.replace_all(result, "{{.HomeActive}}", "")
	result, _ = strings.replace_all(result, "{{.AboutActive}}", "")
	result, _ = strings.replace_all(result, "{{.ProductionsActive}}", "")
	result, _ = strings.replace_all(result, "{{.NewsActive}}", "")
	result, _ = strings.replace_all(result, "{{.AuditionsActive}}", "")
	result, _ = strings.replace_all(result, "{{.SupportActive}}", "")
	result, _ = strings.replace_all(result, "{{.ContactActive}}", "")

	// Set the active page
	//odinfmt: disable
	switch active_page {
	case "home": result, _ = strings.replace_all(result, "{{.HomeActive}}", `class="active"`)
	case "about": result, _ = strings.replace_all(result, "{{.AboutActive}}", `class="active"`)
	case "whats-on":
		result, _ = strings.replace_all(result, "{{.ProductionsActive}}", `class="active"`)
	case "news": result, _ = strings.replace_all(result, "{{.NewsActive}}", `class="active"`)
	case "auditions":
		result, _ = strings.replace_all(result, `{{.AuditionsActive}}`, `class="active"`)
	case "support": result, _ = strings.replace_all(result, `{{.SupportActive}}`, `class="active"`)
	case "contact": result, _ = strings.replace_all(result, `{{.ContactActive}}`, `class="active"`)
	}

	return result
}

get_news_post_html :: proc(post_slug: string) -> string {
	// Convert slug to filename
	filename := fmt.tprintf("news/%s.md", post_slug)

	// Read markdown file
	markdown_content, read_ok := os.read_entire_file(filename)
	if !read_ok {
		return render_page(
			"404 - News Post Not Found",
			"<h1>404 - News Post Not Found</h1>",
			"news",
		)
	}

	// Convert markdown to HTML
	html_content := markdown.to_html(string(markdown_content))

	// Get the title from the first line (assuming it starts with #)
	lines := strings.split_lines(string(markdown_content))
	title := "News Post"
	if len(lines) > 0 && strings.has_prefix(lines[0], "# ") {
		title = strings.trim_prefix(lines[0], "# ")
	}

	// Load news post content template
	content_template, template_ok := os.read_entire_file("templates/pages/news-post.html")
	template_html := "<div>%s</div>"
	if template_ok {
		template_html = string(content_template)
	}

	content := fmt.tprintf(template_html, html_content)
	return render_page(title, content, "news")
}


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

	fmt.printf("Server running on http://localhost:%d\n", endpoint.port)

	for {
		client, _, accept_err := net.accept_tcp(socket)
		if accept_err != nil {
			fmt.printf("Failed to accept connection: %v\n", accept_err)
			continue
		}

		req := http.receive(client)
		fmt.printf("%s %s\n", req.method_str, req.path)

		// Check for module routes first
		if handle_module_route(&req, client) {
			net.close(client)
			continue
		}

		// Serve CSS file
		if req.path == "/styles.css" {
			css_content, read_ok := os.read_entire_file("styles.css")
			if read_ok {
				http.send(client, body = string(css_content), content_type = "text/css")
			}
		} else {
			// Generate dynamic HTML based on requested path
			html, html_ok := get_page_html(req.path)
			if !html_ok {
				html = render_page("404 - Page Not Found", "<h1>404 - Page Not Found</h1>", "")
			}

			http.send(client, body = html, content_type = "text/html")
		}

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
