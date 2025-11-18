package main

import "core:os"
import "core:fmt"
import "core:strings"

get_page_html :: proc(page: string) -> string {
    // Handle news posts - format: /news/post-slug
    if strings.has_prefix(page, "/news/") {
        post_slug := strings.trim_prefix(page, "/news/")
        return get_news_post_html(post_slug)
    }
    
    switch page {
    case "/", "/home":
        content, read_ok := os.read_entire_file("templates/pages/home.html")
        if read_ok {
            return render_page("Duchy Opera", string(content), "home")
        }
    case "/about":
        content, read_ok := os.read_entire_file("templates/pages/about.html")
        if read_ok {
            return render_page("About", string(content), "about")
        }
    case "/whats-on":
        content, read_ok := os.read_entire_file("templates/pages/productions.html")
        if read_ok {
            productions_html := generate_productions_html()
            page_content := fmt.tprintf(string(content), productions_html)
            return render_page("What's on", page_content, "whats-on")
        }
    case "/news":
        content, read_ok := os.read_entire_file("templates/pages/news.html")
        if read_ok {
            news_html := generate_news_html()
            page_content := fmt.tprintf(string(content), news_html)
            return render_page("News", page_content, "news")
        }
    case "/auditions":
        content, read_ok := os.read_entire_file("templates/pages/auditions.html")
        if read_ok {
            return render_page("Auditions", string(content), "auditions")
        }
    case "/support":
        content, read_ok := os.read_entire_file("templates/pages/support.html")
        if read_ok {
            return render_page("Support", string(content), "support")
        }
    case "/contact":
        content, read_ok := os.read_entire_file("templates/pages/contact.html")
        if read_ok {
            return render_page("Contact", string(content), "contact")
        }
    }
    
    // Default to 404 page
    return render_page("404 - Page Not Found", "<h1>404 - Page Not Found</h1>", "")
}
