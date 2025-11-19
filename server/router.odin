package main

import "core:os"
import "core:fmt"
import "core:strings"

BASE_DIR :: "templates/pages/"

get_page_html :: proc(path: string) -> (content: string, ok: bool) {
    // Handle news posts - format: /news/post-slug
    if strings.has_prefix(path, "/news/") {
        post_slug := strings.trim_prefix(path, "/news/")
        return get_news_post_html(post_slug), true
    }
    
    switch path {
    case "/", "/home":
        content := os.read_entire_file(BASE_DIR + "home.html") or_return
        return render_page("Duchy Opera", string(content), "home"), true

    case "/about":
        content, read_ok := os.read_entire_file(BASE_DIR + "about.html")
        return render_page("About", string(content), "about"), true

    case "/whats-on":
        content := os.read_entire_file(BASE_DIR + "productions.html") or_return
        productions_html := generate_productions_html()
        page_content := fmt.tprintf(string(content), productions_html)
        return render_page("What's on", page_content, "whats-on"), true

    case "/news":
        content := os.read_entire_file(BASE_DIR + "news.html") or_return
        news_html := generate_news_html()
        page_content := fmt.tprintf(string(content), news_html)
        return render_page("News", page_content, "news"), true

    case "/auditions":
        content := os.read_entire_file(BASE_DIR + "auditions.html") or_return
        return render_page("Auditions", string(content), "auditions"), true

    case "/support":
        content := os.read_entire_file(BASE_DIR + "support.html") or_return
        return render_page("Support", string(content), "support"), true

    case "/contact":
        content := os.read_entire_file(BASE_DIR + "contact.html") or_return
        return render_page("Contact", string(content), "contact"), true
    }
    
    // Default to 404 page
    return render_page("404 - Page Not Found", "<h1>404 - Page Not Found</h1>", ""), true
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

