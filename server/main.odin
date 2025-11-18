package main

import "core:fmt"
import "core:net"
import "core:strings"
import "core:os"

ADDRESS :: net.IP4_Address{127, 0, 0, 1}
PORT :: 3000

generate_productions_html :: proc() -> string {
    productions := get_productions()
    
    productions_html := ""
    for production in productions {
        status_class := production.status == "upcoming" ? "upcoming" : "past"
        button_text := production.status == "upcoming" ? "Learn More" : "Read About"
        
        productions_html = fmt.tprintf(`%s
                    <div class="card %s">
                        <h3>%s</h3>
                        <p class="date">%s</p>
                        <p>%s</p>
                        <a href="/contact" class="btn">%s</a>
                    </div>`, 
            productions_html, status_class, production.title, production.date, 
            production.description, button_text)
    }
    return productions_html
}

generate_news_html :: proc() -> string {
    news_items := get_news()
    
    news_html := ""
    for news_item in news_items {
        if len(news_item.slug) > 0 {
            // News item with slug - create link to full post
            news_html = fmt.tprintf(`%s
                    <div class="card">
                        <h3><a href="/news/%s">%s</a></h3>
                        <p class="date">%s</p>
                        <p>%s</p>
                        <a href="/news/%s" class="btn">Read More</a>
                    </div>`, 
                news_html, news_item.slug, news_item.title, news_item.date, news_item.content, news_item.slug)
        } else {
            // Regular news item without full post
            news_html = fmt.tprintf(`%s
                    <div class="card">
                        <h3>%s</h3>
                        <p class="date">%s</p>
                        <p>%s</p>
                    </div>`, 
                news_html, news_item.title, news_item.date, news_item.content)
        }
    }
    return news_html
}

render_page :: proc(title: string, content: string, active_page: string) -> string {
    // Load layout template
    layout_content, layout_ok := os.read_entire_file("templates/layout.html")
    if !layout_ok {
        return fmt.tprintf("<html><body><h1>%s</h1><div>%s</div></body></html>", title, content)
    }
    
    // Load header fragment
    header_content, header_ok := os.read_entire_file("templates/fragments/header.html")
    header_html := "<header>Header not found</header>"
    if header_ok {
        header_html = string(header_content)
    }
    
    // Load footer fragment  
    footer_content, footer_ok := os.read_entire_file("templates/fragments/footer.html")
    footer_html := "<footer>Footer not found</footer>"
    if footer_ok {
        footer_html = string(footer_content)
    }
    
    // Process header with active page
    processed_header := process_header_active_nav(header_html, active_page)
    
    // Compose the full page
    full_title := title == "Duchy Opera" ? title : fmt.tprintf("%s - Duchy Opera", title)
    return fmt.tprintf(string(layout_content), full_title, processed_header, content, footer_html)
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
    switch active_page {
    case "home":
        result, _ = strings.replace_all(result, `<li><a href="/" {{.HomeActive}}>Home</a></li>`, `<li><a href="/" class="active">Home</a></li>`)
    case "about":
        result, _ = strings.replace_all(result, `<li><a href="/about" {{.AboutActive}}>About</a></li>`, `<li><a href="/about" class="active">About</a></li>`)
    case "whats-on":
        result, _ = strings.replace_all(result, `<li><a href="/whats-on" {{.ProductionsActive}}>What's on</a></li>`, `<li><a href="/whats-on" class="active">What's on</a></li>`)
    case "news":
        result, _ = strings.replace_all(result, `<li><a href="/news" {{.NewsActive}}>News</a></li>`, `<li><a href="/news" class="active">News</a></li>`)
    case "auditions":
        result, _ = strings.replace_all(result, `<li><a href="/auditions" {{.AuditionsActive}}>Auditions</a></li>`, `<li><a href="/auditions" class="active">Auditions</a></li>`)
    case "support":
        result, _ = strings.replace_all(result, `<li><a href="/support" {{.SupportActive}}>Support</a></li>`, `<li><a href="/support" class="active">Support</a></li>`)
    case "contact":
        result, _ = strings.replace_all(result, `<li><a href="/contact" {{.ContactActive}}>Contact</a></li>`, `<li><a href="/contact" class="active">Contact</a></li>`)
    }
    
    return result
}

get_news_post_html :: proc(post_slug: string) -> string {
    // Convert slug to filename
    filename := fmt.tprintf("news/%s.md", post_slug)
    
    // Read markdown file
    markdown_content, read_ok := os.read_entire_file(filename)
    if !read_ok {
        return render_page("404 - News Post Not Found", "<h1>404 - News Post Not Found</h1>", "news")
    }
    
    // Convert markdown to HTML
    html_content := markdown_to_html(string(markdown_content))
    
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

    endpoint := net.Endpoint{
        address = ADDRESS,
        port = PORT,
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

