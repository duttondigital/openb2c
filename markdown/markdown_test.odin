#+private
package markdown

import "core:fmt"
import "core:testing"

@(test)
test_headers :: proc(t: ^testing.T) {
	// Test H1
	{
		input := "# Hello World"
		expected := "<h1>Hello World</h1>\n"
		result := to_html(input)
		defer delete(result)
		testing.expect(
			t,
			result == expected,
			fmt.tprintf("H1: Expected %q, got %q", expected, result),
		)
	}

	// Test H2
	{
		input := "## Hello World"
		expected := "<h2>Hello World</h2>\n"
		result := to_html(input)
		defer delete(result)
		testing.expect(
			t,
			result == expected,
			fmt.tprintf("H2: Expected %q, got %q", expected, result),
		)
	}

	// Test H3
	{
		input := "### Hello World"
		expected := "<h3>Hello World</h3>\n"
		result := to_html(input)
		defer delete(result)
		testing.expect(
			t,
			result == expected,
			fmt.tprintf("H3: Expected %q, got %q", expected, result),
		)
	}
}

@(test)
test_bold :: proc(t: ^testing.T) {
	input := "This is **bold** text"
	expected := "<p>This is <strong>bold</strong> text</p>\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_italic :: proc(t: ^testing.T) {
	input := "This is *italic* text"
	expected := "<p>This is <em>italic</em> text</p>\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_inline_code :: proc(t: ^testing.T) {
	input := "This is `inline code` example"
	expected := "<p>This is <code>inline code</code> example</p>\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_links :: proc(t: ^testing.T) {
	input := "Check out [Odin](https://odin-lang.org) language"
	expected := `<p>Check out <a href="https://odin-lang.org">Odin</a> language</p>` + "\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_unordered_list :: proc(t: ^testing.T) {
	input := `- First item
- Second item
- Third item`


	expected := `<ul>
<li>First item</li>
<li>Second item</li>
<li>Third item</li>
</ul>
`


	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_code_block :: proc(t: ^testing.T) {
	input := "```\ncode line 1\ncode line 2\n```"
	expected := "<code><pre>\ncode line 1\ncode line 2\n</pre></code>\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_horizontal_rule :: proc(t: ^testing.T) {
	input := "---"
	expected := "<hr>\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_paragraph :: proc(t: ^testing.T) {
	input := "This is a simple paragraph."
	expected := "<p>This is a simple paragraph.</p>\n"
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_combined_formatting :: proc(t: ^testing.T) {
	// Bold and italic together
	{
		input := "This has **bold** and *italic* text"
		expected := "<p>This has <strong>bold</strong> and <em>italic</em> text</p>\n"
		result := to_html(input)
		defer delete(result)
		testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
	}

	// Link with bold text
	{
		input := "Visit [**Odin**](https://odin-lang.org)"
		expected := `<p>Visit <a href="https://odin-lang.org"><strong>Odin</strong></a></p>` + "\n"
		result := to_html(input)
		defer delete(result)
		testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
	}

	// Header with inline code
	{
		input := "# Using `to_html` function"
		expected := "<h1>Using <code>to_html</code> function</h1>\n"
		result := to_html(input)
		defer delete(result)
		testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
	}
}

@(test)
test_multiple_paragraphs :: proc(t: ^testing.T) {
	input := `First paragraph.

Second paragraph.`


	expected := `<p>First paragraph.</p>

<p>Second paragraph.</p>
`


	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_list_with_formatting :: proc(t: ^testing.T) {
	input := `- Item with **bold**
- Item with *italic*
- Item with [link](https://example.com)`


	expected := `<ul>
<li>Item with <strong>bold</strong></li>
<li>Item with <em>italic</em></li>
<li>Item with <a href="https://example.com">link</a></li>
</ul>
`


	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_empty_input :: proc(t: ^testing.T) {
	input := ""
	expected := "\n" // Empty input produces a newline
	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}

@(test)
test_mixed_content :: proc(t: ^testing.T) {
	input := `# Markdown Example

This is a paragraph with **bold** and *italic* text.

## Features

- Lists
- Code blocks
- Links

Check out the [documentation](https://example.com) for more.`


	expected := `<h1>Markdown Example</h1>

<p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>

<h2>Features</h2>

<ul>
<li>Lists</li>
<li>Code blocks</li>
<li>Links</li>
</ul>

<p>Check out the <a href="https://example.com">documentation</a> for more.</p>
`


	result := to_html(input)
	defer delete(result)
	testing.expect(t, result == expected, fmt.tprintf("Expected %q, got %q", expected, result))
}
