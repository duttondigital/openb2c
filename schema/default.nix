# Helper: evaluates all available modules (useful for testing/development)
# Production examples should use their own composition.nix files
let
  lib = import <nixpkgs/lib>;
  composeLib = import ./lib/compose.nix { inherit lib; };

  # Auto-discover all modules
  moduleFiles =
    let dir = ./modules;
    in map (f: dir + "/${f}") (builtins.attrNames (builtins.readDir dir));

  modules = lib.evalModules {
    modules = [
      ./base.nix
    ] ++ moduleFiles;
  };

in {
  organization = modules.config.organization;
  tables = modules.config.tables;
  indexes = modules.config.indexes;
  refs = modules.config.refs;
  relationships = modules.config.relationships;
  operations = composeLib.processOperations modules.config.tables modules.config.relationships modules.config.operations;
  ecommerce = modules.config.ecommerce;
}
