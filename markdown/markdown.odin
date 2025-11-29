package markdown

import "core:strings"

to_html :: proc(markdown: string) -> string {
	lines := strings.split_lines(markdown)
	defer delete(lines)

	builder := strings.builder_make()
	defer strings.builder_destroy(&builder)

	in_code_block := false
	in_list := false

	for line in lines {
		trimmed := strings.trim_space(line)

		// Handle code blocks
		if strings.has_prefix(trimmed, "```") {
			if in_code_block {
				strings.write_string(&builder, "</pre></code>\n")
				in_code_block = false
			} else {
				strings.write_string(&builder, "<code><pre>\n")
				in_code_block = true
			}
			continue
		}

		if in_code_block {
			strings.write_string(&builder, line)
			strings.write_string(&builder, "\n")
			continue
		}

		// Handle empty lines
		if len(trimmed) == 0 {
			if in_list {
				strings.write_string(&builder, "</ul>\n")
				in_list = false
			}
			strings.write_string(&builder, "\n")
			continue
		}

		// Handle headers
		if strings.has_prefix(trimmed, "### ") {
			title := strings.trim_prefix(trimmed, "### ")
			strings.write_string(&builder, "<h3>")
			process_inline_formatting(title, &builder)
			strings.write_string(&builder, "</h3>\n")
			continue
		}

		if strings.has_prefix(trimmed, "## ") {
			title := strings.trim_prefix(trimmed, "## ")
			strings.write_string(&builder, "<h2>")
			process_inline_formatting(title, &builder)
			strings.write_string(&builder, "</h2>\n")
			continue
		}

		if strings.has_prefix(trimmed, "# ") {
			title := strings.trim_prefix(trimmed, "# ")
			strings.write_string(&builder, "<h1>")
			process_inline_formatting(title, &builder)
			strings.write_string(&builder, "</h1>\n")
			continue
		}

		// Handle unordered lists
		if strings.has_prefix(trimmed, "- ") {
			if !in_list {
				strings.write_string(&builder, "<ul>\n")
				in_list = true
			}
			item := strings.trim_prefix(trimmed, "- ")
			strings.write_string(&builder, "<li>")
			process_inline_formatting(item, &builder)
			strings.write_string(&builder, "</li>\n")
			continue
		}

		// Handle horizontal rule
		if trimmed == "---" {
			strings.write_string(&builder, "<hr>\n")
			continue
		}

		// Close list if we're in one and this isn't a list item
		if in_list {
			strings.write_string(&builder, "</ul>\n")
			in_list = false
		}

		// Handle regular paragraphs
		if len(trimmed) > 0 {
			strings.write_string(&builder, "<p>")
			process_inline_formatting(trimmed, &builder)
			strings.write_string(&builder, "</p>\n")
		}
	}

	// Close any open lists
	if in_list {
		strings.write_string(&builder, "</ul>\n")
	}

	return strings.clone(strings.to_string(builder))
}

@(private)
process_inline_formatting :: proc(text: string, builder: ^strings.Builder) {
	// Process in order: links, bold, italic, code
	// We need intermediate strings because each transformation
	// builds on the previous one
	result := encode_links(text)
	defer delete(result)

	result2 := encode_bold(result)
	defer delete(result2)

	result3 := encode_italic(result2)
	defer delete(result3)

	result4 := encode_code(result3)
	defer delete(result4)

	strings.write_string(builder, result4)
}
