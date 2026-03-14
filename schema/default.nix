# Schema entrypoint: evaluates all modules, exports tables + operations
let
  lib = import <nixpkgs/lib>;

  modules = lib.evalModules {
    modules = [
      ./base.nix
    ] ++ (
      let dir = ./modules;
      in map (f: dir + "/${f}") (builtins.attrNames (builtins.readDir dir))
    );
  };

in {
  tables = modules.config.tables;
  operations = modules.config.operations;
}
