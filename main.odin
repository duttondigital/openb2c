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

get_news_post_html :: proc(post_slug: string) -> string {
    // Convert slug to filename
    filename := fmt.tprintf("news/%s.md", post_slug)
    
    // Read markdown file
    markdown_content, read_ok := os.read_entire_file(filename)
    if !read_ok {
        return "<html><body><h1>404 - News Post Not Found</h1></body></html>"
    }
    
    // Convert markdown to HTML
    html_content := markdown_to_html(string(markdown_content))
    
    // Get the title from the first line (assuming it starts with #)
    lines := strings.split_lines(string(markdown_content))
    title := "News Post"
    if len(lines) > 0 && strings.has_prefix(lines[0], "# ") {
        title = strings.trim_prefix(lines[0], "# ")
    }
    
    // Load news post template
    template_content, template_ok := os.read_entire_file("templates/news-post.html")
    if !template_ok {
        return fmt.tprintf("<html><body><h1>%s</h1><div>%s</div></body></html>", title, html_content)
    }
    
    return fmt.tprintf(string(template_content), title, html_content)
}

get_page_html :: proc(page: string) -> string {
    // Handle news posts - format: /news/post-slug
    if strings.has_prefix(page, "/news/") {
        post_slug := strings.trim_prefix(page, "/news/")
        return get_news_post_html(post_slug)
    }
    
    switch page {
    case "/", "/home":
        content, read_ok := os.read_entire_file("templates/home.html")
        if read_ok {
            return string(content)
        }
    case "/about":
        content, read_ok := os.read_entire_file("templates/about.html")
        if read_ok {
            return string(content)
        }
    case "/productions":
        content, read_ok := os.read_entire_file("templates/productions.html")
        if read_ok {
            productions_html := generate_productions_html()
            return fmt.tprintf(string(content), productions_html)
        }
    case "/news":
        content, read_ok := os.read_entire_file("templates/news.html")
        if read_ok {
            news_html := generate_news_html()
            return fmt.tprintf(string(content), news_html)
        }
    case "/auditions":
        content, read_ok := os.read_entire_file("templates/auditions.html")
        if read_ok {
            return string(content)
        }
    case "/support":
        content, read_ok := os.read_entire_file("templates/support.html")
        if read_ok {
            return string(content)
        }
    case "/contact":
        content, read_ok := os.read_entire_file("templates/contact.html")
        if read_ok {
            return string(content)
        }
    }
    
    // Default to home page if not found
    content, read_ok := os.read_entire_file("templates/home.html")
    if read_ok {
        return string(content)
    }
    
    return "<html><body><h1>404 - Page Not Found</h1></body></html>"
}

main :: proc() {
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

