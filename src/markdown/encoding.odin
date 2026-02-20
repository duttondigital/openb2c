#+private
package markdown

import "core:strings"

encode_bold :: proc(text: string) -> string {
	builder := strings.builder_make()
	defer strings.builder_destroy(&builder)

	remaining := text

	for {
		bold_start := strings.index(remaining, "**")
		if bold_start == -1 {
			strings.write_string(&builder, remaining)
			break
		}

		bold_end := strings.index(remaining[bold_start + 2:], "**")
		if bold_end == -1 {
			strings.write_string(&builder, remaining)
			break
		}
		bold_end += bold_start + 2

		// Write everything before the bold marker
		strings.write_string(&builder, remaining[:bold_start])

		// Write the bold tag
		bold_text := remaining[bold_start + 2:bold_end]
		strings.write_string(&builder, "<strong>")
		strings.write_string(&builder, bold_text)
		strings.write_string(&builder, "</strong>")

		// Continue with the rest
		remaining = remaining[bold_end + 2:]
	}

	return strings.clone(strings.to_string(builder))
}

encode_links :: proc(text: string) -> string {
	builder := strings.builder_make()
	defer strings.builder_destroy(&builder)

	remaining := text

	for {
		link_start := strings.index(remaining, "[")
		if link_start == -1 {
			strings.write_string(&builder, remaining)
			break
		}

		link_text_end := strings.index(remaining[link_start:], "]")
		if link_text_end == -1 {
			strings.write_string(&builder, remaining)
			break
		}
		link_text_end += link_start

		if link_text_end + 1 >= len(remaining) || remaining[link_text_end + 1] != '(' {
			strings.write_string(&builder, remaining)
			break
		}

		url_start := link_text_end + 2
		url_end := strings.index(remaining[url_start:], ")")
		if url_end == -1 {
			strings.write_string(&builder, remaining)
			break
		}
		url_end += url_start

		// Write everything before the link
		strings.write_string(&builder, remaining[:link_start])

		// Write the link
		link_text := remaining[link_start + 1:link_text_end]
		url := remaining[url_start:url_end]
		strings.write_string(&builder, `<a href="`)
		strings.write_string(&builder, url)
		strings.write_string(&builder, `">`)
		strings.write_string(&builder, link_text)
		strings.write_string(&builder, `</a>`)

		// Continue with the rest
		remaining = remaining[url_end + 1:]
	}

	return strings.clone(strings.to_string(builder))
}

encode_italic :: proc(text: string) -> string {
	builder := strings.builder_make()
	defer strings.builder_destroy(&builder)

	i := 0
	for i < len(text) {
		// Look for a single *
		if text[i] == '*' {
			// Skip if this is part of **bold**
			if i > 0 && text[i - 1] == '*' {
				strings.write_byte(&builder, text[i])
				i += 1
				continue
			}
			if i < len(text) - 1 && text[i + 1] == '*' {
				strings.write_byte(&builder, text[i])
				i += 1
				continue
			}

			// Find the closing *
			closing := -1
			for j := i + 1; j < len(text); j += 1 {
				if text[j] == '*' {
					// Skip if this is part of **bold**
					if j < len(text) - 1 && text[j + 1] == '*' {
						continue
					}
					closing = j
					break
				}
			}

			if closing != -1 {
				// Write italic tags
				italic_text := text[i + 1:closing]
				strings.write_string(&builder, "<em>")
				strings.write_string(&builder, italic_text)
				strings.write_string(&builder, "</em>")
				i = closing + 1
				continue
			}
		}

		strings.write_byte(&builder, text[i])
		i += 1
	}

	return strings.clone(strings.to_string(builder))
}

encode_code :: proc(text: string) -> string {
	builder := strings.builder_make()
	defer strings.builder_destroy(&builder)

	remaining := text

	for {
		code_start := strings.index(remaining, "`")
		if code_start == -1 {
			strings.write_string(&builder, remaining)
			break
		}

		code_end := strings.index(remaining[code_start + 1:], "`")
		if code_end == -1 {
			strings.write_string(&builder, remaining)
			break
		}
		code_end += code_start + 1

		// Write everything before the code marker
		strings.write_string(&builder, remaining[:code_start])

		// Write the code tag
		code_text := remaining[code_start + 1:code_end]
		strings.write_string(&builder, "<code>")
		strings.write_string(&builder, code_text)
		strings.write_string(&builder, "</code>")

		// Continue with the rest
		remaining = remaining[code_end + 1:]
	}

	return strings.clone(strings.to_string(builder))
}
