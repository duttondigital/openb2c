package main

import "core:fmt"
import "core:strings"
import "core:unicode/utf8"

markdown_to_html :: proc(markdown: string) -> string {
    lines := strings.split_lines(markdown)
    html := ""
    in_code_block := false
    in_list := false
    
    for line in lines {
        trimmed := strings.trim_space(line)
        
        // Handle code blocks
        if strings.has_prefix(trimmed, "```") {
            if in_code_block {
                html = strings.concatenate({html, "</pre></code>\n"})
                in_code_block = false
            } else {
                html = strings.concatenate({html, "<code><pre>\n"})
                in_code_block = true
            }
            continue
        }
        
        if in_code_block {
            html = strings.concatenate({html, line, "\n"})
            continue
        }
        
        // Handle empty lines
        if len(trimmed) == 0 {
            if in_list {
                html = strings.concatenate({html, "</ul>\n"})
                in_list = false
            }
            html = strings.concatenate({html, "\n"})
            continue
        }
        
        // Handle headers
        if strings.has_prefix(trimmed, "### ") {
            title := strings.trim_prefix(trimmed, "### ")
            title = process_inline_formatting(title)
            html = strings.concatenate({html, "<h3>", title, "</h3>\n"})
            continue
        }
        
        if strings.has_prefix(trimmed, "## ") {
            title := strings.trim_prefix(trimmed, "## ")
            title = process_inline_formatting(title)
            html = strings.concatenate({html, "<h2>", title, "</h2>\n"})
            continue
        }
        
        if strings.has_prefix(trimmed, "# ") {
            title := strings.trim_prefix(trimmed, "# ")
            title = process_inline_formatting(title)
            html = strings.concatenate({html, "<h1>", title, "</h1>\n"})
            continue
        }
        
        // Handle unordered lists
        if strings.has_prefix(trimmed, "- ") {
            if !in_list {
                html = strings.concatenate({html, "<ul>\n"})
                in_list = true
            }
            item := strings.trim_prefix(trimmed, "- ")
            item = process_inline_formatting(item)
            html = strings.concatenate({html, "<li>", item, "</li>\n"})
            continue
        }
        
        // Handle horizontal rule
        if trimmed == "---" {
            html = strings.concatenate({html, "<hr>\n"})
            continue
        }
        
        // Close list if we're in one and this isn't a list item
        if in_list {
            html = strings.concatenate({html, "</ul>\n"})
            in_list = false
        }
        
        // Handle regular paragraphs
        if len(trimmed) > 0 {
            processed := process_inline_formatting(trimmed)
            html = strings.concatenate({html, "<p>", processed, "</p>\n"})
        }
    }
    
    // Close any open lists
    if in_list {
        html = strings.concatenate({html, "</ul>\n"})
    }
    
    return html
}

process_inline_formatting :: proc(text: string) -> string {
    result := text
    
    // Handle links [text](url)
    result = process_links(result)
    
    // Handle bold **text**
    result = process_bold(result)
    
    // Handle italic *text*
    result = process_italic(result)
    
    // Handle inline code `code`
    result = process_inline_code(result)
    
    return result
}

process_bold :: proc(text: string) -> string {
    result := text
    
    for {
        bold_start := strings.index(result, "**")
        if bold_start == -1 do break
        
        bold_end := strings.index(result[bold_start + 2:], "**")
        if bold_end == -1 do break
        bold_end += bold_start + 2
        
        bold_text := result[bold_start + 2:bold_end]
        replacement := fmt.tprintf(`<strong>%s</strong>`, bold_text)
        
        before := result[:bold_start]
        after := result[bold_end + 2:]
        result = strings.concatenate({before, replacement, after})
    }
    
    return result
}

process_links :: proc(text: string) -> string {
    result := text
    
    // Simple link processing - handles [text](url) format
    for {
        link_start := strings.index(result, "[")
        if link_start == -1 do break
        
        link_text_end := strings.index(result[link_start:], "]")
        if link_text_end == -1 do break
        link_text_end += link_start
        
        if link_text_end + 1 >= len(result) || result[link_text_end + 1] != '(' do break
        
        url_start := link_text_end + 2
        url_end := strings.index(result[url_start:], ")")
        if url_end == -1 do break
        url_end += url_start
        
        link_text := result[link_start + 1:link_text_end]
        url := result[url_start:url_end]
        
        replacement := fmt.tprintf(`<a href="%s">%s</a>`, url, link_text)
        
        before := result[:link_start]
        after := result[url_end + 1:]
        result = strings.concatenate({before, replacement, after})
    }
    
    return result
}

process_italic :: proc(text: string) -> string {
    result := text
    
    // Handle italic *text* but not **bold**
    for {
        star_pos := strings.index(result, "*")
        if star_pos == -1 do break
        
        // Skip if this is part of **bold**
        if star_pos > 0 && result[star_pos - 1] == '*' {
            result = result[star_pos + 1:]
            continue
        }
        if star_pos < len(result) - 1 && result[star_pos + 1] == '*' {
            result = result[star_pos + 2:]
            continue
        }
        
        next_star := strings.index(result[star_pos + 1:], "*")
        if next_star == -1 do break
        next_star += star_pos + 1
        
        // Skip if next star is part of **bold**
        if next_star < len(result) - 1 && result[next_star + 1] == '*' {
            result = result[next_star + 2:]
            continue
        }
        
        italic_text := result[star_pos + 1:next_star]
        replacement := fmt.tprintf(`<em>%s</em>`, italic_text)
        
        before := result[:star_pos]
        after := result[next_star + 1:]
        result = strings.concatenate({before, replacement, after})
    }
    
    return result
}

process_inline_code :: proc(text: string) -> string {
    result := text
    
    for {
        code_start := strings.index(result, "`")
        if code_start == -1 do break
        
        code_end := strings.index(result[code_start + 1:], "`")
        if code_end == -1 do break
        code_end += code_start + 1
        
        code_text := result[code_start + 1:code_end]
        replacement := fmt.tprintf(`<code>%s</code>`, code_text)
        
        before := result[:code_start]
        after := result[code_end + 1:]
        result = strings.concatenate({before, replacement, after})
    }
    
    return result
}
