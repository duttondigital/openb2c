#+private
package core

import "../sqlite"
import "core:testing"

// Mock module for testing
mock_init :: proc(db: ^sqlite.Database) -> bool {
	return true
}

@(test)
test_create_registry :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	testing.expect_value(t, len(registry.modules), 0)
}

@(test)
test_register_module :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	mod := Module {
		name   = "test",
		deps   = {},
		schema = "",
		init   = mock_init,
		routes = {},
	}

	ok := register(&registry, &mod)
	testing.expect(t, ok, "Should register module")
	testing.expect_value(t, len(registry.modules), 1)
}

@(test)
test_register_duplicate :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	mod := Module {
		name = "test",
	}

	register(&registry, &mod)
	ok := register(&registry, &mod)

	testing.expect(t, !ok, "Should reject duplicate registration")
	testing.expect_value(t, len(registry.modules), 1)
}

@(test)
test_resolve_deps_no_deps :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	mod1 := Module {
		name = "a",
		deps = {},
	}
	mod2 := Module {
		name = "b",
		deps = {},
	}

	register(&registry, &mod1)
	register(&registry, &mod2)

	ordered, ok := resolve_deps(&registry)
	defer delete(ordered)

	testing.expect(t, ok, "Should resolve dependencies")
	testing.expect_value(t, len(ordered), 2)
}

@(test)
test_resolve_deps_linear :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	// b depends on a
	mod_a := Module {
		name = "a",
		deps = {},
	}
	mod_b := Module {
		name = "b",
		deps = {"a"},
	}

	register(&registry, &mod_a)
	register(&registry, &mod_b)

	ordered, ok := resolve_deps(&registry)
	defer delete(ordered)

	testing.expect(t, ok, "Should resolve dependencies")
	testing.expect_value(t, len(ordered), 2)
	testing.expect_value(t, ordered[0].name, "a")
	testing.expect_value(t, ordered[1].name, "b")
}

@(test)
test_resolve_deps_missing :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	// b depends on nonexistent module
	mod_b := Module {
		name = "b",
		deps = {"missing"},
	}
	register(&registry, &mod_b)

	_, ok := resolve_deps(&registry)

	testing.expect(t, !ok, "Should fail with missing dependency")
}

@(test)
test_resolve_deps_circular :: proc(t: ^testing.T) {
	registry := create_registry()
	defer destroy_registry(&registry)

	// a depends on b, b depends on a
	mod_a := Module {
		name = "a",
		deps = {"b"},
	}
	mod_b := Module {
		name = "b",
		deps = {"a"},
	}

	register(&registry, &mod_a)
	register(&registry, &mod_b)

	_, ok := resolve_deps(&registry)

	testing.expect(t, !ok, "Should detect circular dependency")
}

@(test)
test_ensure_modules_table :: proc(t: ^testing.T) {
	db, ok := sqlite.open(":memory:")
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to open database")

	table_ok := ensure_modules_table(&db)
	testing.expect(t, table_ok, "Should create _modules table")

	// Verify table exists
	result, query_ok := sqlite.exec(
		&db,
		"SELECT name FROM sqlite_master WHERE type='table' AND name='_modules'",
	)
	defer sqlite.cleanup_result(&result)
	testing.expect(t, query_ok, "Query should succeed")
	testing.expect_value(t, len(result.rows), 1)
}

@(test)
test_record_and_check_module :: proc(t: ^testing.T) {
	db, ok := sqlite.open(":memory:")
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to open database")

	ensure_modules_table(&db)

	// Should not be applied yet
	testing.expect(t, !is_module_applied(&db, "test"), "Module should not be applied yet")

	// Record it
	record_ok := record_module(&db, "test")
	testing.expect(t, record_ok, "Should record module")

	// Now it should be applied
	testing.expect(t, is_module_applied(&db, "test"), "Module should be applied")
}

@(test)
test_apply_schema :: proc(t: ^testing.T) {
	db, ok := sqlite.open(":memory:")
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to open database")

	schema := "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)"
	apply_ok := apply_schema(&db, schema)
	testing.expect(t, apply_ok, "Should apply schema")

	// Verify table exists
	result, query_ok := sqlite.exec(
		&db,
		"SELECT name FROM sqlite_master WHERE type='table' AND name='test'",
	)
	defer sqlite.cleanup_result(&result)
	testing.expect(t, query_ok, "Query should succeed")
	testing.expect_value(t, len(result.rows), 1)
}

@(test)
test_apply_schema_multiple_statements :: proc(t: ^testing.T) {
	db, ok := sqlite.open(":memory:")
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to open database")

	schema := `
		CREATE TABLE t1 (id INTEGER PRIMARY KEY);
		CREATE TABLE t2 (id INTEGER PRIMARY KEY)
	`
	apply_ok := apply_schema(&db, schema)
	testing.expect(t, apply_ok, "Should apply schema")

	// Verify both tables exist
	result, query_ok := sqlite.exec(
		&db,
		"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('t1', 't2')",
	)
	defer sqlite.cleanup_result(&result)
	testing.expect(t, query_ok, "Query should succeed")
	count, _ := result.rows[0][0].(i64)
	testing.expect_value(t, count, i64(2))
}

@(test)
test_init_all :: proc(t: ^testing.T) {
	db, ok := sqlite.open(":memory:")
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to open database")

	registry := create_registry()
	defer destroy_registry(&registry)

	mod := Module {
		name   = "test",
		deps   = {},
		schema = "CREATE TABLE test_table (id INTEGER PRIMARY KEY)",
		init   = mock_init,
		routes = {},
	}
	register(&registry, &mod)

	init_ok := init_all(&registry, &db)
	testing.expect(t, init_ok, "Should initialize all modules")

	// Verify schema was applied
	result, query_ok := sqlite.exec(
		&db,
		"SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
	)
	defer sqlite.cleanup_result(&result)
	testing.expect(t, query_ok, "Query should succeed")
	testing.expect_value(t, len(result.rows), 1)

	// Verify module was recorded
	testing.expect(t, is_module_applied(&db, "test"), "Module should be recorded")
}

@(test)
test_init_all_skips_applied :: proc(t: ^testing.T) {
	db, ok := sqlite.open(":memory:")
	defer sqlite.close(&db)
	testing.expect(t, ok, "Failed to open database")

	registry := create_registry()
	defer destroy_registry(&registry)

	mod := Module {
		name   = "test",
		deps   = {},
		schema = "CREATE TABLE test_table (id INTEGER PRIMARY KEY)",
		init   = mock_init,
		routes = {},
	}
	register(&registry, &mod)

	// Initialize once
	init_all(&registry, &db)

	// Initialize again - should skip schema (would fail if tried to recreate table)
	init_ok := init_all(&registry, &db)
	testing.expect(t, init_ok, "Should succeed on second init")
}
